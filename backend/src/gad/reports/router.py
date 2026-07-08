# backend/src/gad/reports/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.middleware.rate_limit import limiter
from gad.models.user import User
from gad.reports.schemas import ReportIn, ReportOut
from gad.reports.service import create_report

router = APIRouter(tags=["reports"])


@router.post("/users/{user_id}/report", response_model=ReportOut, status_code=201)
@limiter.limit("10/day")
async def report_endpoint(
    request: Request,
    user_id: UUID,
    data: ReportIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportOut:
    report = await create_report(session, current_user, user_id, data)
    return ReportOut(
        id=report.id, reporter_id=report.reporter_id, reported_id=report.reported_id,
        reason=report.reason, description=report.description, status=report.status,
        payload=report.payload, created_at=report.created_at,
    )
