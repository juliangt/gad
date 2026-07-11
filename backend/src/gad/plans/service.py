# backend/src/gad/plans/service.py
from datetime import UTC, datetime, timedelta

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.availability.alerts import notify_matching_users
from gad.availability.matcher import find_matching_availability
from gad.exceptions import ConflictError, NotFoundError
from gad.models.enums import ActivityType, ApplicationStatus, PlanMode, PlanStatus
from gad.models.geo import snap_to_grid
from gad.models.plan import Plan, PlanApplication
from gad.models.social import Block
from gad.models.user import User
from gad.plans.schemas import PlanIn


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def create_plan(session: AsyncSession, host: User, data: PlanIn) -> Plan:
    now = datetime.now(UTC)
    grid_lat, grid_lng = snap_to_grid(data.location.lat, data.location.lng)

    if data.mode == PlanMode.now:
        expires_at = now + timedelta(minutes=data.window_minutes)
    else:
        assert data.scheduled_at is not None
        expires_at = data.scheduled_at + timedelta(minutes=data.window_minutes)

    plan = Plan(
        host_id=host.id,
        activity_type=data.activity_type,
        mode=data.mode,
        scheduled_at=data.scheduled_at,
        window_minutes=data.window_minutes,
        max_participants=data.max_participants,
        title=data.title,
        description=data.description,
        location_label=data.location.label,
        location_grid=_to_geography(grid_lat, grid_lng),
        exact_location=None,
        search_radius_m=data.search_radius_m,
        status=PlanStatus.open,
        expires_at=expires_at,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)

    # Alertar a usuarios en modo disponible que matcheen este plan
    availabilities = await find_matching_availability(session, plan)
    if availabilities:
        await notify_matching_users(session, plan, availabilities)
    return plan


async def get_plan(session: AsyncSession, plan_id) -> Plan:
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def cancel_plan(session: AsyncSession, plan: Plan) -> Plan:
    plan.status = PlanStatus.cancelled
    plan.hidden_by_host = True
    await session.commit()
    await session.refresh(plan)
    return plan


async def update_plan(session: AsyncSession, plan: Plan, data) -> Plan:
    dump = data.model_dump(exclude_unset=True)

    # hidden_by_host se puede cambiar independientemente del status
    # (es solo visibilidad para el host, no altera el ciclo de vida del plan).
    if "hidden" in dump and dump["hidden"] is not None:
        plan.hidden_by_host = bool(dump["hidden"])

    # El resto de los campos solo se pueden editar si el plan está abierto
    editable_fields = {
        "title": dump.get("title"),
        "description": dump.get("description"),
        "scheduled_at": dump.get("scheduled_at"),
        "max_participants": dump.get("max_participants"),
        "search_radius_m": dump.get("search_radius_m"),
    }
    has_edits = any(v is not None for v in editable_fields.values())
    if has_edits:
        if plan.status != PlanStatus.open:
            raise ConflictError("Solo se pueden editar planes abiertos")
        if (
            editable_fields["max_participants"] is not None
            and editable_fields["max_participants"] < plan.current_participants
        ):
            raise ConflictError(
                "max_participants no puede ser menor a los participantes actuales"
            )
        for field, value in editable_fields.items():
            if value is not None:
                setattr(plan, field, value)

    await session.commit()
    await session.refresh(plan)
    return plan


async def list_nearby_plans(
    session: AsyncSession,
    *,
    viewer: User,
    lat: float,
    lng: float,
    radius_m: int,
    activity: ActivityType | None = None,
    mode: PlanMode | None = None,
    limit: int = 50,
) -> list[Plan]:
    """Devuelve planes abiertos, no expirados, dentro de radius_m, que no son
    del viewer y cuyos hosts no están bloqueados por/para el viewer."""
    viewer_point = _to_geography(lat, lng)

    blocked_subq = select(Block.blocked_id).where(Block.blocker_id == viewer.id)
    blocked_by_subq = select(Block.blocker_id).where(Block.blocked_id == viewer.id)
    exclude_ids = blocked_subq.union(blocked_by_subq)

    stmt = (
        select(Plan)
        .join(User, User.id == Plan.host_id)
        .where(
            Plan.status == PlanStatus.open,
            Plan.expires_at > func.now(),
            Plan.host_id != viewer.id,
            Plan.location_grid.ST_DWithin(viewer_point, radius_m),
            ~User.id.in_(exclude_ids),
        )
        .order_by(Plan.location_grid.ST_Distance(viewer_point))
        .limit(limit)
    )
    if activity is not None:
        stmt = stmt.where(Plan.activity_type == activity)
    if mode is not None:
        stmt = stmt.where(Plan.mode == mode)

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_my_plans(
    session: AsyncSession,
    *,
    host_id,
    status_filter: list[PlanStatus] | None = None,
    limit: int = 50,
    before: datetime | None = None,
    include_hidden: bool = False,
) -> list[tuple[Plan, int]]:
    """Devuelve los planes creados por host_id con su contador de
    postulaciones pendientes. Ordenados por created_at desc.

    Paginación por cursor: `before` es el created_at del último item de la
    página anterior (mismo patrón que list_my_applications).

    Por defecto excluye los hidden_by_host (el host los "eliminó" de su vista).
    """
    # Subquery: cantidad de postulaciones pendientes por plan
    pending_subq = (
        select(PlanApplication.plan_id, func.count().label("pending_count"))
        .where(PlanApplication.status == ApplicationStatus.pending)
        .group_by(PlanApplication.plan_id)
        .subquery()
    )

    stmt = (
        select(Plan, func.coalesce(pending_subq.c.pending_count, 0))
        .outerjoin(pending_subq, pending_subq.c.plan_id == Plan.id)
        .where(Plan.host_id == host_id)
        .order_by(Plan.created_at.desc())
        .limit(limit)
    )
    if not include_hidden:
        stmt = stmt.where(Plan.hidden_by_host.is_(False))
    if status_filter:
        stmt = stmt.where(Plan.status.in_(status_filter))
    if before is not None:
        stmt = stmt.where(Plan.created_at < before)

    result = await session.execute(stmt)
    return [(row[0], row[1]) for row in result.all()]

