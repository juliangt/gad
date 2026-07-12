from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.plans_schemas import AdminPlanListItem, AdminPlanOut
from gad.admin.plans_service import (
    admin_close_plan,
    admin_hide_plan,
    admin_unhide_plan,
    get_admin_plan,
    list_admin_plans,
)
from gad.admin.settings_service import record_audit
from gad.db import get_session
from gad.matching.schemas import ApplicantSummary, ApplicationOut, MatchOut, ParticipantOut
from gad.models.plan import Plan as PlanModel
from gad.models.user import User
from gad.schemas.pagination import PaginatedOut

router = APIRouter(prefix="/plans", tags=["admin-plans"])


async def _grid_coords(session: AsyncSession, plan_id: UUID) -> tuple[float, float]:
    loc_col = cast(PlanModel.location_grid, Geometry)
    result = await session.execute(
        select(func.ST_Y(loc_col).label("lat"), func.ST_X(loc_col).label("lng")).where(
            PlanModel.id == plan_id
        )
    )
    lat, lng = result.one()
    return float(lat), float(lng)


def _plan_to_list_item(plan) -> AdminPlanListItem:
    return AdminPlanListItem(
        id=plan.id,
        title=plan.title,
        activity_type=plan.activity_type,
        status=plan.status,
        mode=plan.mode,
        host_id=plan.host_id,
        host_name=plan.host.display_name,
        current_participants=plan.current_participants,
        max_participants=plan.max_participants,
        created_at=plan.created_at,
        expires_at=plan.expires_at,
        hidden_by_host=plan.hidden_by_host,
    )


async def _plan_to_detail(session: AsyncSession, plan) -> AdminPlanOut:
    lat, lng = await _grid_coords(session, plan.id)
    return AdminPlanOut(
        id=plan.id,
        title=plan.title,
        activity_type=plan.activity_type,
        status=plan.status,
        mode=plan.mode,
        scheduled_at=plan.scheduled_at,
        window_minutes=plan.window_minutes,
        max_participants=plan.max_participants,
        current_participants=plan.current_participants,
        description=plan.description,
        location_label=plan.location_label,
        location_lat=lat,
        location_lng=lng,
        search_radius_m=plan.search_radius_m,
        expires_at=plan.expires_at,
        created_at=plan.created_at,
        hidden_by_host=plan.hidden_by_host,
        host_id=plan.host_id,
        host_email=plan.host.email,
        host_name=plan.host.display_name,
    )


@router.get("", response_model=PaginatedOut[AdminPlanListItem])
async def admin_list_plans_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    activity: str | None = None,
    host_id: UUID | None = None,
    q: str | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to_: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AdminPlanListItem]:
    plans = await list_admin_plans(
        session,
        status=status, activity=activity, host_id=host_id, q=q,
        date_from=from_, date_to=to_, limit=limit, before=before,
    )
    items = [_plan_to_list_item(p) for p in plans]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[AdminPlanListItem](items=items, next_cursor=next_cursor)


@router.get("/{plan_id}", response_model=AdminPlanOut)
async def admin_get_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await get_admin_plan(session, plan_id)
    return await _plan_to_detail(session, plan)


@router.post("/{plan_id}/hide", response_model=AdminPlanOut)
async def admin_hide_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await admin_hide_plan(session, plan_id)
    await record_audit(
        session, actor_id=admin.id, action="plan.hide",
        target_type="plan", target_id=str(plan_id), detail={},
    )
    return await _plan_to_detail(session, plan)


@router.post("/{plan_id}/unhide", response_model=AdminPlanOut)
async def admin_unhide_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await admin_unhide_plan(session, plan_id)
    await record_audit(
        session, actor_id=admin.id, action="plan.unhide",
        target_type="plan", target_id=str(plan_id), detail={},
    )
    return await _plan_to_detail(session, plan)


@router.post("/{plan_id}/close", response_model=AdminPlanOut)
async def admin_close_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await admin_close_plan(session, plan_id)
    await record_audit(
        session, actor_id=admin.id, action="plan.close",
        target_type="plan", target_id=str(plan_id), detail={},
    )
    return await _plan_to_detail(session, plan)


@router.get("/{plan_id}/applications", response_model=list[ApplicationOut])
async def admin_plan_applications_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApplicationOut]:
    from gad.models.plan import PlanApplication

    result = await session.execute(
        select(PlanApplication)
        .where(PlanApplication.plan_id == plan_id)
        .order_by(PlanApplication.created_at.desc())
    )
    apps = result.scalars().all()
    # Cargar applicants en batch
    user_ids = {a.applicant_id for a in apps}
    users_map = {}
    if user_ids:
        users_result = await session.execute(select(User).where(User.id.in_(user_ids)))
        for u in users_result.scalars().all():
            users_map[u.id] = u
    out = []
    for a in apps:
        u = users_map.get(a.applicant_id)
        if u is None:
            continue
        out.append(
            ApplicationOut(
                id=a.id, plan_id=a.plan_id,
                applicant=ApplicantSummary(
                    id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
                    reputation_score=u.reputation_score,
                    verification_level=u.verification_level.value,
                ),
                status=a.status, message=a.message,
                created_at=a.created_at, decided_at=a.decided_at,
            )
        )
    return out


@router.get("/{plan_id}/matches", response_model=list[MatchOut])
async def admin_plan_matches_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[MatchOut]:
    from gad.models.match import Match, MatchParticipant

    result = await session.execute(
        select(Match).where(Match.plan_id == plan_id).order_by(Match.started_at.desc())
    )
    matches = result.scalars().all()
    out = []
    for m in matches:
        parts_result = await session.execute(
            select(MatchParticipant, User)
            .join(User, MatchParticipant.user_id == User.id)
            .where(MatchParticipant.match_id == m.id)
        )
        participants = [
            ParticipantOut(
                user_id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
                role=p.role, joined_at=p.joined_at,
            )
            for p, u in parts_result.all()
        ]
        out.append(
            MatchOut(
                id=m.id, plan_id=m.plan_id, status=m.status,
                started_at=m.started_at, ended_at=m.ended_at,
                location_sharing_active=m.location_sharing_active,
                participants=participants,
            )
        )
    return out
