from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gad.exceptions import NotFoundError
from gad.models.enums import PlanStatus
from gad.models.plan import Plan


async def list_admin_plans(
    session: AsyncSession,
    *,
    status: str | None = None,
    activity: str | None = None,
    host_id: UUID | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Plan]:
    stmt = (
        select(Plan)
        .options(selectinload(Plan.host))
        .order_by(Plan.created_at.desc())
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(Plan.status == PlanStatus(status))
    if activity is not None:
        stmt = stmt.where(Plan.activity_type == activity)
    if host_id is not None:
        stmt = stmt.where(Plan.host_id == host_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            (Plan.title.ilike(pattern))
            | (Plan.description.ilike(pattern))
            | (Plan.location_label.ilike(pattern))
        )
    if date_from is not None:
        stmt = stmt.where(Plan.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Plan.created_at <= date_to)
    if before is not None:
        stmt = stmt.where(Plan.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_admin_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    result = await session.execute(
        select(Plan).options(selectinload(Plan.host)).where(Plan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def admin_hide_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    plan = await get_admin_plan(session, plan_id)
    plan.hidden_by_host = True
    await session.commit()
    await session.refresh(plan)
    return plan


async def admin_unhide_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    plan = await get_admin_plan(session, plan_id)
    plan.hidden_by_host = False
    await session.commit()
    await session.refresh(plan)
    return plan


async def admin_close_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    plan = await get_admin_plan(session, plan_id)
    plan.status = PlanStatus.closed
    await session.commit()
    await session.refresh(plan)
    return plan
