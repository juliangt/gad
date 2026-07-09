# backend/src/gad/notifications/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.notifications.schemas import NotificationOut
from gad.notifications.service import list_notifications, mark_read, unread_count
from gad.schemas.pagination import PaginatedOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedOut[NotificationOut])
async def list_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[NotificationOut]:
    notifs = await list_notifications(
        session,
        current_user.id,
        unread_only=unread_only,
        limit=limit,
        before=before,
    )
    items = [NotificationOut.model_validate(n) for n in notifs]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[NotificationOut](items=items, next_cursor=next_cursor)


@router.get("/unread/count")
async def unread_count_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int]:
    count = await unread_count(session, current_user.id)
    return {"count": count}


@router.patch("/{notification_id}/read")
async def mark_read_endpoint(
    notification_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await mark_read(session, current_user.id, notification_id)
    return {"message": "Notificación marcada como leída"}
