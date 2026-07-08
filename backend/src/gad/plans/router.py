# backend/src/gad/plans/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.exceptions import NotFoundError
from gad.middleware.rate_limit import limiter
from gad.models.plan import Plan
from gad.models.user import User
from gad.plans.schemas import HostSummary, PlanIn, PlanListItem, PlanOut
from gad.plans.service import cancel_plan, create_plan, get_plan, list_nearby_plans

router = APIRouter(prefix="/plans", tags=["plans"])


async def _plan_to_out(session: AsyncSession, plan: Plan) -> PlanOut:
    # Cargar host
    result = await session.execute(select(User).where(User.id == plan.host_id))
    host = result.scalar_one()
    # Extraer lat/lng del grid con ST_X/ST_Y. La columna es geography;
    # ST_X/ST_Y requieren geometry, por eso el cast.
    grid_col = cast(plan.__table__.c.location_grid, Geometry)
    point_stmt = select(
        func.ST_Y(grid_col).label("lat"),
        func.ST_X(grid_col).label("lng"),
    ).where(plan.__table__.c.id == plan.id)
    point_result = await session.execute(point_stmt)
    lat, lng = point_result.one()

    return PlanOut(
        id=plan.id,
        activity_type=plan.activity_type,
        mode=plan.mode,
        scheduled_at=plan.scheduled_at,
        window_minutes=plan.window_minutes,
        max_participants=plan.max_participants,
        current_participants=plan.current_participants,
        title=plan.title,
        description=plan.description,
        location_label=plan.location_label,
        location_lat=lat,
        location_lng=lng,
        search_radius_m=plan.search_radius_m,
        status=plan.status,
        expires_at=plan.expires_at,
        host=HostSummary(
            id=host.id,
            display_name=host.display_name,
            avatar_url=host.avatar_url,
            reputation_score=host.reputation_score,
            verification_level=host.verification_level.value,
        ),
        created_at=plan.created_at,
    )


@router.post("", response_model=PlanOut, status_code=201)
@limiter.limit("10/hour")
async def create_plan_endpoint(
    request: Request,
    data: PlanIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await create_plan(session, current_user, data)
    return await _plan_to_out(session, plan)


@router.get("", response_model=list[PlanListItem])
async def list_plans_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius: int = Query(default=2000, ge=100, le=50000),
    activity: str | None = None,
    mode: str | None = None,
) -> list[PlanOut]:
    from gad.models.enums import ActivityType, PlanMode

    activity_enum = ActivityType(activity) if activity else None
    mode_enum = PlanMode(mode) if mode else None
    plans = await list_nearby_plans(
        session,
        viewer=current_user,
        lat=lat,
        lng=lng,
        radius_m=radius,
        activity=activity_enum,
        mode=mode_enum,
    )
    return [await _plan_to_out(session, p) for p in plans]


@router.get("/{plan_id}", response_model=PlanOut)
async def get_plan_endpoint(
    plan_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await get_plan(session, plan_id)
    return await _plan_to_out(session, plan)


@router.delete("/{plan_id}", response_model=PlanOut)
async def cancel_plan_endpoint(
    plan_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await get_plan(session, plan_id)
    if plan.host_id != current_user.id:
        raise NotFoundError("Plan no encontrado")
    plan = await cancel_plan(session, plan)
    return await _plan_to_out(session, plan)
