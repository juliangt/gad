# backend/src/gad/notifications/push_router.py
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.social import PushSubscription
from gad.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: dict[str, str]


class VapidPublicKeyOut(BaseModel):
    public_key: str


@router.get("/vapid-public-key")
async def vapid_key() -> VapidPublicKeyOut:
    public_key_path = Path("vapid_public.pem")
    key = public_key_path.read_text() if public_key_path.exists() else ""
    return VapidPublicKeyOut(public_key=key)


@router.post("/register", status_code=201)
async def register_push(
    data: PushSubscriptionIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    sub = PushSubscription(
        id=uuid4(),
        user_id=current_user.id,
        endpoint=data.endpoint,
        p256dh=data.keys.get("p256dh", ""),
        auth=data.keys.get("auth", ""),
        created_at=datetime.now(UTC),
    )
    session.add(sub)
    await session.commit()
    return {"message": "Suscripción push registrada"}


@router.delete("/subscription")
async def unsubscribe_push(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    endpoint: str = Query(default=""),
) -> dict[str, int]:
    from sqlalchemy import delete

    stmt = delete(PushSubscription).where(
        PushSubscription.user_id == current_user.id
    )
    if endpoint:
        stmt = stmt.where(PushSubscription.endpoint == endpoint)
    result = await session.execute(stmt)
    await session.commit()
    return {"deleted": result.rowcount}
