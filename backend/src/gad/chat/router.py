# backend/src/gad/chat/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.chat.schemas import MessageOut
from gad.chat.service import get_history, mark_read
from gad.db import get_session
from gad.models.user import User

router = APIRouter(tags=["chat"])


@router.get("/matches/{match_id}/messages", response_model=list[MessageOut])
async def history_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=200),
    before: datetime | None = Query(default=None),
) -> list[MessageOut]:
    messages = await get_history(
        session, current_user, match_id, limit=limit, before=before
    )
    return [
        MessageOut(
            id=m.id,
            match_id=m.match_id,
            sender_id=m.sender_id,
            content=m.content,
            created_at=m.created_at,
            read_at=m.read_at,
        )
        for m in messages
    ]


@router.post("/matches/{match_id}/read")
async def mark_read_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int]:
    count = await mark_read(session, current_user, match_id)
    return {"read": count}
