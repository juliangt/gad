# backend/src/gad/reports/service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError, ValidationError
from gad.models.report import Report
from gad.models.user import User
from gad.reports.schemas import ReportIn


async def create_report(
    session: AsyncSession,
    reporter: User,
    reported_id: UUID,
    data: ReportIn,
) -> Report:
    if reporter.id == reported_id:
        raise ValidationError("No podés reportarte a vos mismo")

    result = await session.execute(select(User).where(User.id == reported_id))
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Usuario no encontrado")

    report = Report(
        reporter_id=reporter.id,
        reported_id=reported_id,
        reason=data.reason,
        description=data.description,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def list_reports(
    session: AsyncSession, *, status: str | None = None
) -> list[Report]:
    stmt = select(Report).order_by(Report.created_at.desc())
    if status is not None:
        stmt = stmt.where(Report.status == status)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_report_status(
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
