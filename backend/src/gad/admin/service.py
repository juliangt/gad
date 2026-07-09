# backend/src/gad/admin/service.py
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError
from gad.models.enums import UserStatus
from gad.models.match import Match
from gad.models.plan import Plan
from gad.models.report import Report
from gad.models.user import User
from gad.users.service import set_user_status


async def get_stats(session: AsyncSession) -> dict[str, int]:
    total_users = (await session.execute(select(func.count(User.id)))).scalar_one()
    total_plans = (await session.execute(select(func.count(Plan.id)))).scalar_one()
    total_matches = (await session.execute(select(func.count(Match.id)))).scalar_one()
    open_reports = (
        await session.execute(
            select(func.count(Report.id)).where(Report.status == "open")
        )
    ).scalar_one()
    return {
        "total_users": total_users,
        "total_plans": total_plans,
        "total_matches": total_matches,
        "open_reports": open_reports,
    }


async def list_reports_admin(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Report]:
    stmt = select(Report).order_by(Report.created_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(Report.status == status)
    if before is not None:
        stmt = stmt.where(Report.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_report_status_admin(
    session: AsyncSession, report_id: UUID, status: str
) -> Report:
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise NotFoundError("Reporte no encontrado")
    report.status = status
    await session.commit()
    await session.refresh(report)
    return report


async def ban_user(session: AsyncSession, store, user_id: UUID) -> User:
    """Suspende al usuario y revoca sus tokens activos."""
    user = await set_user_status(session, user_id, UserStatus.suspended)
    await store.revoke_user(str(user_id), ttl_seconds=7 * 86400)
    return user


async def list_users_admin(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
    before: datetime | None = None,
) -> list[User]:
    stmt = select(User).order_by(User.created_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(User.status == UserStatus(status))
    if before is not None:
        stmt = stmt.where(User.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def force_cancel_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    from gad.models.enums import PlanStatus

    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    plan.status = PlanStatus.cancelled
    await session.commit()
    await session.refresh(plan)
    return plan


async def list_flagged_reviews(
    session: AsyncSession,
    *,
    limit: int = 50,
    before: datetime | None = None,
) -> list:
    from gad.models.review import Review

    stmt = (
        select(Review)
        .where(Review.flag.is_not(None))
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Review.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_review_admin(session: AsyncSession, review_id: UUID) -> None:
    from gad.models.review import Review
    from gad.reviews.service import recalc_reputation

    result = await session.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if review is None:
        raise NotFoundError("Reseña no encontrada")
    reviewee_id = review.reviewee_id
    await session.delete(review)
    await session.commit()
    await recalc_reputation(session, reviewee_id)
