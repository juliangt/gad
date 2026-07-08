# backend/src/gad/chat/service.py
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ValidationError
from gad.models.match import MatchParticipant, Message
from gad.models.user import User


async def _is_participant(session: AsyncSession, match_id: UUID, user_id: UUID) -> bool:
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def send_message(
    session: AsyncSession,
    sender: User,
    match_id: UUID,
    content: str,
) -> Message:
    if not await _is_participant(session, match_id, sender.id):
        raise ValidationError("No sos participante de este match")

    msg = Message(
        match_id=match_id,
        sender_id=sender.id,
        content=content,
        created_at=datetime.now(UTC),
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg


async def get_history(
    session: AsyncSession,
    requester: User,
    match_id: UUID,
    *,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Message]:
    if not await _is_participant(session, match_id, requester.id):
        raise ValidationError("No sos participante de este match")

    stmt = (
        select(Message)
        .where(Message.match_id == match_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Message.created_at < before)
    result = await session.execute(stmt)
    return list(reversed(result.scalars().all()))


async def mark_read(
    session: AsyncSession, user: User, match_id: UUID
) -> int:
    """Marca como leídos los mensajes del match donde el read_at es null y el
    sender no es el usuario. Retorna cantidad actualizada."""
    result = await session.execute(
        select(Message)
        .where(
            Message.match_id == match_id,
            Message.sender_id != user.id,
            Message.read_at.is_(None),
        )
    )
    count = 0
    now = datetime.now(UTC)
    for msg in result.scalars():
        msg.read_at = now
        count += 1
    if count:
        await session.commit()
    return count


async def get_unread_count(
    session: AsyncSession, user: User, match_id: UUID
) -> int:
    result = await session.execute(
        select(func.count(Message.id)).where(
            Message.match_id == match_id,
            Message.sender_id != user.id,
            Message.read_at.is_(None),
        )
    )
    return result.scalar_one()
