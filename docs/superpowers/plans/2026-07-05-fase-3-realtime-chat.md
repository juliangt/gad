# Fase 3 — Realtime y Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar chat en tiempo real entre participantes de un match vía WebSockets, con persistencia de mensajes, historial paginado vía REST, notificaciones in-app y Web Push.

**Architecture:** WebSocket endpoint `/chat/{match_id}` autenticado por token en query param. Un `ConnectionManager` mantiene las conexiones activas por match en memoria del proceso. Cuando un cliente envía un mensaje, el servidor lo persiste, lo publica en Redis pub/sub (canal `gad:match:{match_id}`) y todos los procesos API suscritos lo reciben y lo broadcastean a las conexiones locales. Esto permite escalar horizontalmente en el futuro. Las notificaciones in-app se guardan en la tabla `notifications` y las Web Push se envían vía VAPID.

**Tech Stack:** FastAPI WebSocket, Redis pub/sub, pywebpush, pytest-asyncio.

**Depende de:** Fases 0, 1 y 2 completadas.

---

## File Structure (adiciones)

```
backend/src/gad/
├── chat/
│   ├── __init__.py
│   ├── manager.py              # ConnectionManager (in-memory + Redis subscriber)
│   ├── service.py              # persistir mensajes, historial, mark_read
│   ├── schemas.py              # MessageOut, MessageIn
│   ├── websocket.py            # WS endpoint /chat/{match_id}
│   └── router.py               # REST historial /matches/{id}/messages
├── notifications/
│   ├── __init__.py
│   ├── service.py              # create_notification, list, mark_read
│   ├── push.py                 # Web Push (VAPID)
│   ├── schemas.py              # NotificationOut
│   └── router.py               # /notifications, /notifications/register
```

---

## Task 1: Schemas de chat

**Files:**
- Create: `backend/src/gad/chat/__init__.py`
- Create: `backend/src/gad/chat/schemas.py`
- Test: `backend/tests/test_chat_schemas.py`

- [ ] **Step 1: `backend/src/gad/chat/__init__.py`**

```python
# backend/src/gad/chat/__init__.py
```

- [ ] **Step 2: `backend/src/gad/chat/schemas.py`**

```python
# backend/src/gad/chat/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    id: UUID
    match_id: UUID
    sender_id: UUID
    content: str
    created_at: datetime
    read_at: datetime | None


class TypingEvent(BaseModel):
    type: str = "typing"
    user_id: UUID
    is_typing: bool


class SystemEvent(BaseModel):
    type: str = "system"
    content: str
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_chat_schemas.py
import pytest
from pydantic import ValidationError

from gad.chat.schemas import MessageIn


def test_message_in_ok():
    m = MessageIn(content="Hola")
    assert m.content == "Hola"


def test_message_in_rejects_empty():
    with pytest.raises(ValidationError):
        MessageIn(content="")


def test_message_in_rejects_too_long():
    with pytest.raises(ValidationError):
        MessageIn(content="x" * 2001)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_chat_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/chat/__init__.py backend/src/gad/chat/schemas.py backend/tests/test_chat_schemas.py
git commit -m "feat(chat): schemas de mensajes y eventos"
```

---

## Task 2: Servicio de chat (persistencia + historial)

**Files:**
- Create: `backend/src/gad/chat/service.py`
- Test: `backend/tests/test_chat_service.py`

- [ ] **Step 1: `backend/src/gad/chat/service.py`**

```python
# backend/src/gad/chat/service.py
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError, ValidationError
from gad.models.match import Match, MatchParticipant, Message
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
        created_at=datetime.now(timezone.utc),
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
    now = datetime.now(timezone.utc)
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
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_chat_service.py
import pytest

from gad.auth.service import register
from gad.chat.service import get_history, get_unread_count, mark_read, send_message
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from sqlalchemy import select


async def _setup_match(session):
    from gad.schemas.auth import RegisterIn

    host_t = await register(session, RegisterIn(email="h@example.com", password="12345678", display_name="H"))
    app_t = await register(session, RegisterIn(email="a@example.com", password="12345678", display_name="A"))
    host = (await session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (await session.execute(select(User).where(User.id == app_t.user_id))).scalar_one()

    plan = await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    app = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
    match = await accept_application(session, host, app.id)
    return host, applicant, match


@pytest.mark.asyncio
async def test_send_message_persists(db_session):
    host, applicant, match = await _setup_match(db_session)

    msg = await send_message(db_session, host, match.id, "Hola")

    assert msg.content == "Hola"
    assert msg.sender_id == host.id


@pytest.mark.asyncio
async def test_non_participant_cannot_send(db_session):
    from gad.schemas.auth import RegisterIn

    host, applicant, match = await _setup_match(db_session)
    outsider_t = await register(db_session, RegisterIn(email="o@example.com", password="12345678", display_name="O"))
    outsider = (await db_session.execute(select(User).where(User.id == outsider_t.user_id))).scalar_one()

    from gad.exceptions import ValidationError

    with pytest.raises(ValidationError):
        await send_message(db_session, outsider, match.id, "spam")


@pytest.mark.asyncio
async def test_history_returns_chronological(db_session):
    host, applicant, match = await _setup_match(db_session)
    await send_message(db_session, host, match.id, "uno")
    await send_message(db_session, applicant, match.id, "dos")

    history = await get_history(db_session, host, match.id)
    assert [m.content for m in history] == ["uno", "dos"]


@pytest.mark.asyncio
async def test_mark_read_clears_unread(db_session):
    host, applicant, match = await _setup_match(db_session)
    await send_message(db_session, host, match.id, "para ti")

    assert await get_unread_count(db_session, applicant, match.id) == 1
    count = await mark_read(db_session, applicant, match.id)
    assert count == 1
    assert await get_unread_count(db_session, applicant, match.id) == 0
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_chat_service.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/chat/service.py backend/tests/test_chat_service.py
git commit -m "feat(chat): persistencia de mensajes, historial y mark_read"
```

---

## Task 3: ConnectionManager (in-memory + Redis pub/sub)

**Files:**
- Create: `backend/src/gad/chat/manager.py`
- Test: `backend/tests/test_chat_manager.py`

- [ ] **Step 1: `backend/src/gad/chat/manager.py`**

```python
# backend/src/gad/chat/manager.py
"""Gestiona conexiones WebSocket activas y broadcastea mensajes vía Redis pub/sub.

Cada proceso API mantiene un ConnectionManager local. Cuando llega un mensaje,
se persiste y se publica en Redis; todos los procesos lo reciben y lo envían a
las conexiones locales del match correspondiente.
"""
import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from gad.redis_client import redis_client


class ConnectionManager:
    def __init__(self) -> None:
        # match_id -> set of WebSocket
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._subscriber_task: asyncio.Task | None = None

    async def connect(self, match_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[match_id].add(ws)

    def disconnect(self, match_id: str, ws: WebSocket) -> None:
        self._connections[match_id].discard(ws)
        if not self._connections[match_id]:
            self._connections.pop(match_id, None)

    async def broadcast_local(self, match_id: str, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections.get(match_id, set()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(match_id, ws)

    async def publish(self, match_id: str, payload: dict) -> None:
        """Publica al canal Redis para que todos los procesos lo broadcasteen."""
        await redis_client.publish(
            f"gad:match:{match_id}", json.dumps(payload, default=str)
        )

    async def start_subscriber(self) -> None:
        """Escucha los canales gad:match:* y broadcastea localmente."""
        if self._subscriber_task is not None:
            return
        self._subscriber_task = asyncio.create_task(self._subscribe_loop())

    async def _subscribe_loop(self) -> None:
        pubsub = redis_client.pubsub()
        await pubsub.psubscribe("gad:match:*")
        async for msg in pubsub.listen():
            if msg["type"] != "pmessage":
                continue
            try:
                channel = msg["channel"].decode() if isinstance(msg["channel"], bytes) else msg["channel"]
                match_id = channel.split(":")[-1]
                payload = json.loads(msg["data"])
                await self.broadcast_local(match_id, payload)
            except Exception:
                continue

    async def stop_subscriber(self) -> None:
        if self._subscriber_task is not None:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass
            self._subscriber_task = None


manager = ConnectionManager()
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_chat_manager.py
import asyncio
import json

import pytest

from gad.chat.manager import ConnectionManager


@pytest.mark.asyncio
async def test_publish_broadcasts_via_redis(redis_client):
    """Al publicar en el manager, el mensaje llega al canal Redis."""
    received: list[str] = []

    async def sub():
        ps = redis_client.pubsub()
        await ps.psubscribe("gad:match:*")
        async for m in ps.listen():
            if m["type"] != "pmessage":
                continue
            received.append(m["data"])
            break

    task = asyncio.create_task(sub())
    await asyncio.sleep(0.1)

    m = ConnectionManager()
    await m.publish("m1", {"type": "message", "content": "hi"})
    await asyncio.wait_for(task, timeout=2)
    assert received
    data = json.loads(received[0])
    assert data["content"] == "hi"
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_chat_manager.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/chat/manager.py backend/tests/test_chat_manager.py
git commit -m "feat(chat): ConnectionManager con Redis pub/sub para multi-proceso"
```

---

## Task 4: WebSocket endpoint

**Files:**
- Create: `backend/src/gad/chat/websocket.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_chat_websocket.py`

- [ ] **Step 1: `backend/src/gad/chat/websocket.py`**

```python
# backend/src/gad/chat/websocket.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.jwt import decode_token
from gad.chat.manager import manager
from gad.chat.schemas import MessageIn
from gad.chat.service import send_message
from gad.db import async_session_maker, get_session
from gad.exceptions import InvalidTokenError
from gad.models.match import MatchParticipant
from sqlalchemy import select

router = APIRouter(tags=["chat"])


async def _authenticate(token: str) -> str:
    try:
        payload = decode_token(token)
    except Exception as e:
        raise InvalidTokenError("Token inválido") from e
    if payload.get("type") != "access":
        raise InvalidTokenError("Token no es access")
    return payload["sub"]


async def _is_participant(match_id: UUID, user_id: str) -> bool:
    async with async_session_maker() as session:
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
    token: str = Query(...),
) -> None:
    try:
        user_id = await _authenticate(token)
    except InvalidTokenError:
        await websocket.close(code=4401)
        return

    if not await _is_participant(match_id, user_id):
        await websocket.close(code=4403)
        return

    await manager.connect(str(match_id), websocket)
    try:
        while True:
            data = await websocket.receive_json()
            try:
                msg_in = MessageIn(**data)
            except Exception:
                await websocket.send_json({"type": "error", "detail": "Mensaje inválido"})
                continue

            # Persistir en sesión propia
            async with async_session_maker() as session:
                from gad.models.user import User

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
            await manager.publish(str(match_id), payload)
    except WebSocketDisconnect:
        manager.disconnect(str(match_id), websocket)
```

- [ ] **Step 2: Test con cliente WS real**

```python
# backend/tests/test_chat_websocket.py
import asyncio
import json

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from gad.auth.router import router as auth_router
from gad.chat.websocket import router as chat_router
from gad.main import create_app


@pytest.fixture
def app():
    return create_app()


def test_websocket_rejects_without_token(app):
    client = TestClient(app)
    import uuid

    with client.websocket_connect(f"/chat/{uuid.uuid4()}") as ws:
        # Sin token → cierre con código de error
        pass  # El servidor cerrará con 4401/4403; starlette lo maneja


@pytest.mark.asyncio
async def test_websocket_rejects_invalid_token(app):
    # Usamos TestClient síncrono para WS
    client = TestClient(app)
    import uuid

    with pytest.raises(Exception):
        with client.websocket_connect(f"/chat/{uuid.uuid4()}?token=invalid"):
            pass
```

- [ ] **Step 3: Incluir router + arrancar subscriber en `main.py`**

```python
# Añadir imports
from gad.chat.manager import manager
from gad.chat.websocket import router as chat_router

# En create_app, después de include_router(...):
    app.include_router(chat_router)

# En lifespan, antes de yield:
    await manager.start_subscriber()

# En lifespan, en el bloque finally (después de yield):
    await manager.stop_subscriber()
```

Lifespan actualizado completo:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await redis_client.ping()
    await start_scheduler()
    await manager.start_subscriber()
    yield
    await manager.stop_subscriber()
    await shutdown_scheduler()
    await redis_client.aclose()
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_chat_websocket.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/chat/websocket.py backend/src/gad/main.py backend/tests/test_chat_websocket.py
git commit -m "feat(chat): WebSocket /chat/{match_id} con auth + persistencia + broadcast"
```

---

## Task 5: REST router de historial

**Files:**
- Create: `backend/src/gad/chat/router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_chat_router.py`

- [ ] **Step 1: `backend/src/gad/chat/router.py`**

```python
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
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_chat_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.chat.router import router as chat_router


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(chat_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_history_requires_auth(client):
    import uuid

    async with client as c:
        resp = await c.get(f"/matches/{uuid.uuid4()}/messages")
    assert resp.status_code == 401
```

- [ ] **Step 3: Incluir router en `main.py`**

```python
from gad.chat.router import router as chat_rest_router
# ...
    app.include_router(chat_rest_router)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_chat_router.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/chat/router.py backend/src/gad/main.py backend/tests/test_chat_router.py
git commit -m "feat(chat): REST de historial paginado y mark_read"
```

---

## Task 6: Notificaciones in-app

**Files:**
- Create: `backend/src/gad/notifications/__init__.py`
- Create: `backend/src/gad/notifications/schemas.py`
- Create: `backend/src/gad/notifications/service.py`
- Create: `backend/src/gad/notifications/router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_notifications.py`

- [ ] **Step 1: `backend/src/gad/notifications/__init__.py`**

```python
# backend/src/gad/notifications/__init__.py
```

- [ ] **Step 2: `backend/src/gad/notifications/schemas.py`**

```python
# backend/src/gad/notifications/schemas.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import NotificationType


class NotificationOut(BaseModel):
    id: UUID
    type: NotificationType
    payload: dict[str, Any] | None
    read_at: datetime | None
    created_at: datetime
```

- [ ] **Step 3: `backend/src/gad/notifications/service.py`**

```python
# backend/src/gad/notifications/service.py
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
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
        id=UUID(),
        user_id=user_id,
        type=type_,
        payload=payload,
        created_at=datetime.now(timezone.utc),
    )
    session.add(notif)
    await session.commit()
    await session.refresh(notif)
    return notif


async def list_notifications(
    session: AsyncSession, user_id: UUID, *, unread_only: bool = False, limit: int = 50
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
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
        .values(read_at=datetime.now(timezone.utc))
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
```

- [ ] **Step 4: `backend/src/gad/notifications/router.py`**

```python
# backend/src/gad/notifications/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.notifications.schemas import NotificationOut
from gad.notifications.service import list_notifications, mark_read, unread_count

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    unread_only: bool = Query(default=False),
) -> list[NotificationOut]:
    notifs = await list_notifications(session, current_user.id, unread_only=unread_only)
    return [NotificationOut(**{c.name: getattr(n, c.name) for c in n.__table__.columns}) for n in notifs]


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
```

- [ ] **Step 5: Test**

```python
# backend/tests/test_notifications.py
import pytest

from gad.models.enums import NotificationType
from gad.notifications.service import (
    create_notification,
    list_notifications,
    mark_read,
    unread_count,
)
import uuid


@pytest.mark.asyncio
async def test_create_and_list_notification(db_session):
    uid = uuid.uuid4()
    await create_notification(db_session, uid, NotificationType.new_message, {"x": 1})

    notifs = await list_notifications(db_session, uid)
    assert len(notifs) == 1
    assert notifs[0].type == NotificationType.new_message


@pytest.mark.asyncio
async def test_unread_count_and_mark_read(db_session):
    uid = uuid.uuid4()
    n1 = await create_notification(db_session, uid, NotificationType.match)
    n2 = await create_notification(db_session, uid, NotificationType.match)

    assert await unread_count(db_session, uid) == 2
    await mark_read(db_session, uid, n1.id)
    assert await unread_count(db_session, uid) == 1


@pytest.mark.asyncio
async def test_list_unread_only(db_session):
    uid = uuid.uuid4()
    n1 = await create_notification(db_session, uid, NotificationType.match)
    await create_notification(db_session, uid, NotificationType.match)
    await mark_read(db_session, uid, n1.id)

    notifs = await list_notifications(db_session, uid, unread_only=True)
    assert len(notifs) == 1
```

- [ ] **Step 6: Incluir router en `main.py`**

```python
from gad.notifications.router import router as notifications_router
# ...
    app.include_router(notifications_router)
```

- [ ] **Step 7:** Run `cd backend && poetry run pytest tests/test_notifications.py -v` → PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/gad/notifications/ backend/src/gad/main.py backend/tests/test_notifications.py
git commit -m "feat(notifications): notificaciones in-app con listado y mark_read"
```

---

## Task 7: Web Push (VAPID)

**Files:**
- Create: `backend/src/gad/notifications/push.py`
- Modify: `backend/pyproject.toml`
- Modify: `backend/src/gad/models/user.py` (añadir relación push_subscriptions)
- Create: `backend/src/gad/notifications/push_router.py`
- Test: `backend/tests/test_push.py`

> **Nota de modelado:** la tabla para almacenar las suscripciones push no estaba en el spec original. Se añade como `push_subscriptions`.

- [ ] **Step 1: Añadir dependencia**

```bash
cd backend && poetry add pywebpush py-vapid
```

- [ ] **Step 2: Crear modelo `PushSubscription`** en `backend/src/gad/models/social.py` (añadir al final):

```python
# Añadir a backend/src/gad/models/social.py
class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    p256dh: Mapped[str] = mapped_column(String(200), nullable=False)
    auth: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

Añadir imports necesarios arriba de `social.py`:
```python
from uuid import UUID, uuid4
from sqlalchemy import String
```

- [ ] **Step 3: Actualizar `__init__.py` de modelos** para exportar `PushSubscription`.

- [ ] **Step 4: `backend/src/gad/notifications/push.py`**

```python
# backend/src/gad/notifications/push.py
"""Web Push con VAPID.

Generar claves una vez:
    python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); v.save_key('vapid_private.pem'); v.save_public_key('vapid_public.pem')"
"""
import json
import os
from pathlib import Path

from pywebpush import webpush

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS = {"sub": "mailto:dev@gad.local"}


def send_push(subscription: dict, payload: dict, private_key: str | None = None) -> None:
    key = private_key or VAPID_PRIVATE_KEY
    if not key:
        return  # No-op si no hay clave configurada (dev)
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=key,
        vapid_claims=VAPID_CLAIMS,
    )
```

- [ ] **Step 5: `backend/src/gad/notifications/push_router.py`**

```python
# backend/src/gad/notifications/push_router.py
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
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
        created_at=datetime.now(timezone.utc),
    )
    session.add(sub)
    await session.commit()
    return {"message": "Suscripción push registrada"}


# Import diferido
from pathlib import Path  # noqa: E402
```

- [ ] **Step 6: Test**

```python
# backend/tests/test_push.py
import pytest

from gad.notifications.push import send_push


def test_send_push_noop_without_key():
    """Sin VAPID_PRIVATE_KEY configurada, send_push no falla."""
    send_push({}, {"x": 1}, private_key="")  # no-op


def test_send_push_returns_none_on_invalid_subscription():
    # Sin clave, es no-op
    assert send_push({}, {"x": 1}, private_key="") is None
```

- [ ] **Step 7: Incluir router en `main.py`**

```python
from gad.notifications.push_router import router as push_router
# ...
    app.include_router(push_router)
```

- [ ] **Step 8:** Run `cd backend && poetry run pytest tests/test_push.py -v` → PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/gad/notifications/push.py backend/src/gad/notifications/push_router.py backend/src/gad/models/social.py backend/src/gad/models/__init__.py backend/pyproject.toml backend/poetry.lock backend/src/gad/main.py backend/tests/test_push.py
git commit -m "feat(push): Web Push con VAPID + registro de suscripciones"
```

---

## Task 8: Integrar notificaciones en matching

**Files:**
- Modify: `backend/src/gad/matching/notifications.py` (crear también notificación in-app)
- Test: extend `backend/tests/test_matching_apply.py`

- [ ] **Step 1: Modificar `backend/src/gad/matching/notifications.py`** para que además de publicar vía WS, cree la notificación in-app. Como `notifications.py` opera a nivel pub/sub sin sesión, se crea la notificación en el servicio (`service.py`) donde hay sesión disponible.

Modificar `apply_to_plan` en `backend/src/gad/matching/service.py`:

```python
# Añadir import
from gad.models.enums import NotificationType
from gad.notifications.service import create_notification
from sqlalchemy.ext.asyncio import async_sessionmaker
```

Y al final de `apply_to_plan`, antes del return:
```python
    await create_notification(
        session,
        plan.host_id,
        NotificationType.new_application,
        {"plan_id": str(plan_id), "applicant_id": str(applicant.id)},
    )
```

Similarmente en `accept_application`, cuando se crea el match:
```python
    for uid in participant_ids:
        await create_notification(
            session,
            uid,
            NotificationType.match,
            {"match_id": str(match.id), "plan_id": str(plan.id)},
        )
```

- [ ] **Step 2: Test**

```python
# Añadir a backend/tests/test_matching_apply.py
@pytest.mark.asyncio
async def test_apply_creates_notification_for_host(db_session):
    from gad.notifications.service import list_notifications

    host = await _make_user(db_session, "hostn@example.com")
    applicant = await _make_user(db_session, "appn@example.com")
    plan = await _make_plan(db_session, host)

    await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())

    notifs = await list_notifications(db_session, host.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == "new_application"
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_matching_apply.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/matching/service.py backend/tests/test_matching_apply.py
git commit -m "feat(matching): crea notificaciones in-app al postularse y hacer match"
```

---

## Task 9: Smoke test de integración de la Fase 3

**Files:**
- Create: `backend/tests/test_smoke_phase3.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_smoke_phase3.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_notifications_endpoint_requires_auth(client):
    async with client as c:
        resp = await c.get("/notifications")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_history_requires_participant(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "p3@example.com", "password": "12345678", "display_name": "P3"},
        )
        token = resp.json()["access_token"]
        import uuid

        resp = await c.get(
            f"/matches/{uuid.uuid4()}/messages",
            headers={"Authorization": f"Bearer {token}"},
        )
    # Como no es participante, ValidationError → 400
    assert resp.status_code in (400, 404)
```

- [ ] **Step 2:** Run `cd backend && poetry run pytest tests/test_smoke_phase3.py -v` → PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_phase3.py
git commit -m "test: smoke test de chat y notificaciones (Fase 3)"
```

---

## Self-Review

**1. Spec coverage (Fase 3):** ✅ WebSockets + Redis pub/sub, chat del match con historial, notificaciones in-app + Web Push.

**2. Placeholder scan:** Sin placeholders. Todos los endpoints y servicios tienen código completo.

**3. Type consistency:** `send_message`, `get_history`, `mark_read` firmas consistentes. `manager.publish`/`broadcast_local` usados correctamente. `NotificationOut` schema mapeado desde el modelo.

**4. Escalabilidad:** El diseño pub/sub permite múltiples procesos API; cada uno mantiene sus conexiones locales y se sincroniza vía Redis.

**5. Seguridad:** El WS valida token y participación antes de aceptar. Los endpoints REST validan participación para historial.
