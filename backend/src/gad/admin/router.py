# backend/src/gad/admin/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.schemas import AdminStatsOut, AdminUserOut, ReportStatusUpdate
from gad.admin.service import (
    ban_user,
    force_cancel_plan,
    get_stats,
    list_reports_admin,
    list_users_admin,
    update_report_status_admin,
)
from gad.db import get_session
from gad.models.user import User
from gad.reports.schemas import ReportOut
from gad.schemas.pagination import PaginatedOut
from gad.users.service import set_user_status

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


def _user_to_admin_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        is_admin=user.is_admin,
        reputation_score=user.reputation_score,
        created_at=user.created_at,
    )


@router.get("/users", response_model=PaginatedOut[AdminUserOut])
async def list_users_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AdminUserOut]:
    users = await list_users_admin(session, status=status, limit=limit, before=before)
    items = [_user_to_admin_out(u) for u in users]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[AdminUserOut](items=items, next_cursor=next_cursor)


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
async def ban_user_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    from gad.auth.dependencies import get_token_store

    user = await ban_user(session, get_token_store(), user_id)
    return _user_to_admin_out(user)


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    from gad.auth.dependencies import get_token_store

    user = await ban_user(session, get_token_store(), user_id)
    return _user_to_admin_out(user)


@router.post("/users/{user_id}/activate", response_model=AdminUserOut)
async def activate_user_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    user = await set_user_status(session, user_id, "active")
    return _user_to_admin_out(user)


@router.post("/plans/{plan_id}/cancel")
async def force_cancel_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await force_cancel_plan(session, plan_id)
    return {"message": "Plan cancelado por moderación"}


@router.get("/reviews", response_model=PaginatedOut[dict])
async def list_flagged_reviews_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[dict]:
    from gad.admin.service import list_flagged_reviews

    reviews = await list_flagged_reviews(session, limit=limit, before=before)
    items = [
        {
            "id": str(r.id),
            "match_id": str(r.match_id),
            "reviewer_id": str(r.reviewer_id),
            "reviewee_id": str(r.reviewee_id),
            "rating": r.rating,
            "comment": r.comment,
            "flag": r.flag.value if r.flag else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in reviews
    ]
    next_cursor = items[-1]["created_at"] if len(items) == limit and items else None
    return PaginatedOut[dict](items=items, next_cursor=next_cursor)


@router.delete("/reviews/{review_id}")
async def delete_review_admin_endpoint(
    review_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.admin.service import delete_review_admin

    await delete_review_admin(session, review_id)
    return {"message": "Reseña eliminada por moderación"}
