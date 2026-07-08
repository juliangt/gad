# backend/src/gad/plans/service.py
from datetime import UTC, datetime, timedelta

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError
from gad.models.enums import PlanMode, PlanStatus
from gad.models.geo import snap_to_grid
from gad.models.plan import Plan
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
    return plan


async def get_plan(session: AsyncSession, plan_id) -> Plan:
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def cancel_plan(session: AsyncSession, plan: Plan) -> Plan:
    plan.status = PlanStatus.cancelled
    await session.commit()
    await session.refresh(plan)
    return plan
