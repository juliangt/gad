# backend/src/gad/admin/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.schemas import AdminStatsOut, ReportStatusUpdate
from gad.admin.service import get_stats, list_reports_admin, update_report_status_admin
from gad.db import get_session
from gad.models.user import User
from gad.reports.schemas import ReportOut
from gad.schemas.pagination import PaginatedOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
async def stats_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminStatsOut:
    stats = await get_stats(session)
    return AdminStatsOut(**stats)


@router.get("/reports", response_model=PaginatedOut[ReportOut])
async def list_reports_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[ReportOut]:
    reports = await list_reports_admin(
        session, status=status, limit=limit, before=before
    )
    items = [
        ReportOut(
            id=r.id, reporter_id=r.reporter_id, reported_id=r.reported_id,
            reason=r.reason, description=r.description, status=r.status,
            payload=r.payload, created_at=r.created_at,
        )
        for r in reports
    ]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[ReportOut](items=items, next_cursor=next_cursor)


@router.patch("/reports/{report_id}", response_model=ReportOut)
async def update_report_endpoint(
    report_id: UUID,
    data: ReportStatusUpdate,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportOut:
    report = await update_report_status_admin(session, report_id, data.status)
    return ReportOut(
        id=report.id, reporter_id=report.reporter_id, reported_id=report.reported_id,
        reason=report.reason, description=report.description, status=report.status,
        payload=report.payload, created_at=report.created_at,
    )
