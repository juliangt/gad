# backend/src/gad/chat/websocket.py
import time
from collections import deque
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.jwt import decode_token
from gad.chat.manager import manager
from gad.chat.schemas import MessageIn
from gad.chat.service import send_message
from gad.config import settings
from gad.db import async_session_maker
from gad.exceptions import InvalidTokenError
from gad.models.match import MatchParticipant
from gad.models.user import User

router = APIRouter(tags=["chat"])


class SlidingWindowRateLimiter:
    """Límite de N mensajes por segundo usando una ventana deslizante in-memory.

    Suficiente para throttle por conexión WS (slowapi no cubre websockets).
    """

    def __init__(self, max_per_second: int, window: float = 1.0):
        self.max_per_second = max_per_second
        self.window = window
        self._events: deque[float] = deque()

    def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        while self._events and self._events[0] <= cutoff:
            self._events.popleft()
        if len(self._events) >= self.max_per_second:
            return False
        self._events.append(now)
        return True


def _get_session_maker(app) -> async_sessionmaker[AsyncSession]:
    """Permite inyectar un session_maker de test vía app.state; en prod usa el global."""
    return getattr(app.state, "chat_session_maker", None) or async_session_maker


def _get_manager(app):
    return getattr(app.state, "chat_manager", None) or manager


async def _authenticate(token: str) -> str:
    try:
        payload = decode_token(token)
    except Exception as e:
        raise InvalidTokenError("Token inválido") from e
    if payload.get("type") != "access":
        raise InvalidTokenError("Token no es access")
    return payload["sub"]


async def _is_participant(
    session_maker: async_sessionmaker[AsyncSession], match_id: UUID, user_id: str
) -> bool:
    async with session_maker() as session:
        result = await session.execute(
            select(MatchParticipant).where(
                MatchParticipant.match_id == match_id,
                MatchParticipant.user_id == UUID(user_id),
            )
        )
        return result.scalar_one_or_none() is not None


@router.websocket("/chat/{match_id}")
async def chat_endpoint(
    websocket: WebSocket,
    match_id: UUID,
    token: Annotated[str, Query()],
) -> None:
    session_maker = _get_session_maker(websocket.app)
    mgr = _get_manager(websocket.app)

    try:
        user_id = await _authenticate(token)
    except InvalidTokenError:
        await websocket.close(code=4401)
        return

    if not await _is_participant(session_maker, match_id, user_id):
        await websocket.close(code=4403)
        return

    await mgr.connect(str(match_id), websocket)
    throttle = SlidingWindowRateLimiter(
        max_per_second=getattr(websocket.app.state, "ws_message_rate", None)
        or settings.ws_max_message_rate
    )
    try:
        while True:
            data = await websocket.receive_json()
            if not throttle.allow():
                await websocket.send_json(
                    {"type": "error", "detail": "Demasiados mensajes, frená un poco"}
                )
                continue
            try:
                msg_in = MessageIn(**data)
            except Exception:
                await websocket.send_json(
                    {"type": "error", "detail": "Mensaje inválido"}
                )
                continue

            # Persistir en sesión propia
            async with session_maker() as session:
                user = (
                    await session.execute(select(User).where(User.id == UUID(user_id)))
                ).scalar_one()
                msg = await send_message(session, user, match_id, msg_in.content)

            payload = {
                "type": "message",
                "id": str(msg.id),
                "match_id": str(msg.match_id),
                "sender_id": str(msg.sender_id),
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
            }
            await mgr.publish(str(match_id), payload)
    except WebSocketDisconnect:
        mgr.disconnect(str(match_id), websocket)
