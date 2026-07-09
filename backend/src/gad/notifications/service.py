# backend/src/gad/notifications/service.py
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.enums import NotificationType
from gad.models.social import Notification


async def create_notification(
    session: AsyncSession,
    user_id: UUID,
    type_: NotificationType,
    payload: dict[str, Any] | None = None,
) -> Notification:
    notif = Notification(
        id=uuid4(),
        user_id=user_id,
        type=type_,
        payload=payload,
        created_at=datetime.now(UTC),
    )
    session.add(notif)
    await session.commit()
    await session.refresh(notif)
    return notif


async def list_notifications(
    session: AsyncSession,
    user_id: UUID,
    *,
    unread_only: bool = False,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    if before is not None:
        stmt = stmt.where(Notification.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def mark_read(
    session: AsyncSession, user_id: UUID, notification_id: UUID
) -> None:
    await session.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()


async def unread_count(session: AsyncSession, user_id: UUID) -> int:
    result = await session.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    )
    return result.scalar_one()


async def mark_all_read(session: AsyncSession, user_id: UUID) -> int:
    result = await session.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return result.rowcount


async def delete_all(session: AsyncSession, user_id: UUID) -> int:
    result = await session.execute(
        delete(Notification).where(Notification.user_id == user_id)
    )
    await session.commit()
    return result.rowcount
