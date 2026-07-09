# backend/src/gad/admin/service.py
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError
from gad.models.match import Match
from gad.models.plan import Plan
from gad.models.report import Report
from gad.models.user import User


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
