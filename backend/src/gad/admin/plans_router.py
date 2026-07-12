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
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AdminPlanListItem]:
    plans = await list_admin_plans(
        session,
        status=status, activity=activity, host_id=host_id, q=q,
        date_from=date_from, date_to=date_to, limit=limit, before=before,
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
