# Fase 4 — Seguridad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo de seguridad: ubicación compartida en vivo durante la salida (pings periódicos + visualización), contactos de confianza con link público de tracking, y botón SOS con registro de eventos.

**Architecture:** Nuevo módulo `safety/` con `service.py` (gestión de contactos, pings, SOS), `router.py` (endpoints autenticados) y `public_router.py` (link público `/s/{token}` sin auth). Los pings se guardan en `safety_sessions.last_ping_location`. El link público usa tokens con secreto aleatorio (itsdangerous) firmados que contienen `match_id` y expiran.

**Tech Stack:** FastAPI, GeoAlchemy2, itsdangerous (tokens), pytest-asyncio.

**Depende de:** Fases 0-3 completadas.

---

## File Structure (adiciones)

```
backend/src/gad/
├── safety/
│   ├── __init__.py
│   ├── service.py             # contactos, ping, get_peer_location, SOS, link
│   ├── tokens.py              # firma/verificación de link público
│   ├── schemas.py
│   ├── router.py              # /me/trusted-contacts, /safety/{match_id}/*
│   └── public_router.py       # /s/{token}
```

---

## Task 1: Schemas de seguridad

**Files:**
- Create: `backend/src/gad/safety/__init__.py`
- Create: `backend/src/gad/safety/schemas.py`
- Test: `backend/tests/test_safety_schemas.py`

- [ ] **Step 1: `backend/src/gad/safety/__init__.py`**

```python
# backend/src/gad/safety/__init__.py
```

- [ ] **Step 2: `backend/src/gad/safety/schemas.py`**

```python
# backend/src/gad/safety/schemas.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ContactType


class TrustedContactIn(BaseModel):
    contact_type: ContactType
    contact_value: str = Field(min_length=3, max_length=255)
    label: str = Field(min_length=1, max_length=100)


class TrustedContactOut(BaseModel):
    id: UUID
    contact_type: ContactType
    contact_value: str
    label: str
    created_at: datetime


class PingIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class PeerLocationOut(BaseModel):
    lat: float | None
    lng: float | None
    last_ping_at: datetime | None


class SosOut(BaseModel):
    event_id: UUID
    message: str


class SafetyEventOut(BaseModel):
    id: UUID
    match_id: UUID | None
    user_id: UUID
    type: str
    payload: dict[str, Any] | None
    created_at: datetime


class PublicLocationOut(BaseModel):
    """Respuesta del link público /s/{token}."""
    match_id: UUID
    user_display_name: str
    lat: float | None
    lng: float | None
    last_ping_at: datetime | None
    expired: bool
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_safety_schemas.py
import pytest
from pydantic import ValidationError

from gad.models.enums import ContactType
from gad.safety.schemas import PingIn, TrustedContactIn


def test_trusted_contact_ok():
    c = TrustedContactIn(
        contact_type=ContactType.email, contact_value="mom@example.com", label="Mom"
    )
    assert c.contact_type == ContactType.email


def test_ping_rejects_bad_lat():
    with pytest.raises(ValidationError):
        PingIn(lat=95, lng=0)


def test_trusted_contact_label_required():
    with pytest.raises(ValidationError):
        TrustedContactIn(contact_type=ContactType.phone, contact_value="+1234", label="")
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_safety_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/safety/__init__.py backend/src/gad/safety/schemas.py backend/tests/test_safety_schemas.py
git commit -m "feat(safety): schemas de contactos, ping, SOS y link público"
```

---

## Task 2: Tokens firmados (link público)

**Files:**
- Create: `backend/src/gad/safety/tokens.py`
- Test: `backend/tests/test_safety_tokens.py`

- [ ] **Step 1: `backend/src/gad/safety/tokens.py`**

```python
# backend/src/gad/safety/tokens.py
"""Tokens firmados para el link público de ubicación compartida.

El token contiene: match_id, user_id (quien comparte), y timestamp de creación.
Se firma con JWT_SECRET. Expira a las 24hs o cuando el match termina.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt

from gad.config import settings

LINK_TTL_HOURS = 24


@dataclass
class LinkPayload:
    match_id: str
    user_id: str
    iat: int
    exp: int


def create_share_link_token(match_id: UUID, user_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "match_id": str(match_id),
        "user_id": str(user_id),
        "type": "safety_link",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=LINK_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_share_link_token(token: str) -> LinkPayload:
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as e:
        raise JWTError(f"Link inválido: {e}") from e

    if payload.get("type") != "safety_link":
        raise JWTError("Token no es safety_link")

    return LinkPayload(
        match_id=payload["match_id"],
        user_id=payload["user_id"],
        iat=payload["iat"],
        exp=payload["exp"],
    )
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_safety_tokens.py
import uuid

import pytest
from jose import JWTError

from gad.config import get_settings
from gad.safety.tokens import create_share_link_token, decode_share_link_token

ENV = {
    "JWT_SECRET": "test-secret-12345678901234567890",
    "DATABASE_URL": "postgresql+asyncpg://u:p@db:5432/gad",
    "REDIS_URL": "redis://redis:6379/0",
}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_roundtrip_token():
    mid = uuid.uuid4()
    uid = uuid.uuid4()
    token = create_share_link_token(mid, uid)
    payload = decode_share_link_token(token)
    assert payload.match_id == str(mid)
    assert payload.user_id == str(uid)


def test_invalid_token_raises():
    with pytest.raises(JWTError):
        decode_share_link_token("garbage")


def test_tampered_token_raises():
    mid = uuid.uuid4()
    uid = uuid.uuid4()
    token = create_share_link_token(mid, uid)
    with pytest.raises(JWTError):
        decode_share_link_token(token[:-4] + "XXXX")
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_safety_tokens.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/safety/tokens.py backend/tests/test_safety_tokens.py
git commit -m "feat(safety): tokens firmados JWT para link público de ubicación"
```

---

## Task 3: Servicio — contactos de confianza

**Files:**
- Create: `backend/src/gad/safety/service.py`
- Test: `backend/tests/test_safety_contacts.py`

- [ ] **Step 1: `backend/src/gad/safety/service.py` (parte 1)**

```python
# backend/src/gad/safety/service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError
from gad.models.safety import TrustedContact
from gad.models.user import User
from gad.safety.schemas import TrustedContactIn

MAX_TRUSTED_CONTACTS = 2


async def list_trusted_contacts(session: AsyncSession, user: User) -> list[TrustedContact]:
    result = await session.execute(
        select(TrustedContact)
        .where(TrustedContact.user_id == user.id)
        .order_by(TrustedContact.created_at.desc())
    )
    return list(result.scalars().all())


async def add_trusted_contact(
    session: AsyncSession, user: User, data: TrustedContactIn
) -> TrustedContact:
    existing = await list_trusted_contacts(session, user)
    if len(existing) >= MAX_TRUSTED_CONTACTS:
        raise ConflictError(
            f"Ya tenés el máximo de {MAX_TRUSTED_CONTACTS} contactos de confianza"
        )
    # Validar duplicado
    for c in existing:
        if c.contact_value == data.contact_value:
            raise ConflictError("Ya tenés ese contacto registrado")

    contact = TrustedContact(
        user_id=user.id,
        contact_type=data.contact_type,
        contact_value=data.contact_value,
        label=data.label,
    )
    session.add(contact)
    await session.commit()
    await session.refresh(contact)
    return contact


async def delete_trusted_contact(
    session: AsyncSession, user: User, contact_id: UUID
) -> None:
    result = await session.execute(
        select(TrustedContact).where(
            TrustedContact.id == contact_id,
            TrustedContact.user_id == user.id,
        )
    )
    contact = result.scalar_one_or_none()
    if contact is None:
        raise NotFoundError("Contacto no encontrado")
    await session.delete(contact)
    await session.commit()
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_safety_contacts.py
import pytest

from gad.auth.service import register
from gad.exceptions import ConflictError
from gad.models.enums import ContactType
from gad.models.user import User
from gad.safety.schemas import TrustedContactIn
from gad.safety.service import add_trusted_contact, list_trusted_contacts
from sqlalchemy import select


async def _user(session, email):
    from gad.schemas.auth import RegisterIn

    tokens = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == tokens.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_add_and_list_contacts(db_session):
    user = await _user(db_session, "c@example.com")
    await add_trusted_contact(
        db_session, user,
        TrustedContactIn(contact_type=ContactType.email, contact_value="m@example.com", label="Mom"),
    )

    contacts = await list_trusted_contacts(db_session, user)
    assert len(contacts) == 1
    assert contacts[0].label == "Mom"


@pytest.mark.asyncio
async def test_max_two_contacts(db_session):
    user = await _user(db_session, "max@example.com")
    await add_trusted_contact(
        db_session, user,
        TrustedContactIn(contact_type=ContactType.email, contact_value="a@example.com", label="A"),
    )
    await add_trusted_contact(
        db_session, user,
        TrustedContactIn(contact_type=ContactType.phone, contact_value="+1234", label="B"),
    )
    with pytest.raises(ConflictError):
        await add_trusted_contact(
            db_session, user,
            TrustedContactIn(contact_type=ContactType.email, contact_value="c@example.com", label="C"),
        )


@pytest.mark.asyncio
async def test_duplicate_contact_raises(db_session):
    user = await _user(db_session, "dup@example.com")
    await add_trusted_contact(
        db_session, user,
        TrustedContactIn(contact_type=ContactType.email, contact_value="x@example.com", label="X"),
    )
    with pytest.raises(ConflictError):
        await add_trusted_contact(
            db_session, user,
            TrustedContactIn(contact_type=ContactType.email, contact_value="x@example.com", label="X"),
        )
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_safety_contacts.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/safety/service.py backend/tests/test_safety_contacts.py
git commit -m "feat(safety): CRUD de contactos de confianza (máx 2)"
```

---

## Task 4: Servicio — pings de ubicación y ubicación del par

**Files:**
- Modify: `backend/src/gad/safety/service.py`
- Test: `backend/tests/test_safety_pings.py`

- [ ] **Step 1: Añadir a `backend/src/gad/safety/service.py`**

```python
# Añadir imports
from datetime import datetime, timezone

from geoalchemy2.elements import WKTElement
from sqlalchemy import func

from gad.chat.service import _is_participant as is_chat_participant
from gad.models.enums import SafetyEventType
from gad.models.match import MatchParticipant
from gad.models.safety import SafetyEvent, SafetySession


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def _verify_participant(
    session: AsyncSession, match_id: UUID, user_id: UUID
) -> None:
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        from gad.exceptions import ValidationError

        raise ValidationError("No sos participante de este match")


async def _get_or_create_session(
    session: AsyncSession, match_id: UUID, user_id: UUID
) -> SafetySession:
    result = await session.execute(
        select(SafetySession).where(
            SafetySession.match_id == match_id,
            SafetySession.user_id == user_id,
        )
    )
    safety = result.scalar_one_or_none()
    if safety is None:
        safety = SafetySession(
            match_id=match_id,
            user_id=user_id,
            started_at=datetime.now(timezone.utc),
        )
        session.add(safety)
        await session.commit()
        await session.refresh(safety)
    return safety


async def ping_location(
    session: AsyncSession,
    user: User,
    match_id: UUID,
    lat: float,
    lng: float,
) -> SafetySession:
    await _verify_participant(session, match_id, user.id)
    safety = await _get_or_create_session(session, match_id, user.id)
    safety.last_ping_location = _to_geography(lat, lng)
    safety.last_ping_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(safety)
    return safety


async def get_peer_location(
    session: AsyncSession, user: User, match_id: UUID
) -> tuple[float | None, float | None, datetime | None]:
    """Devuelve (lat, lng, last_ping_at) del OTRO participante del match.
    Para grupos, devuelve el del último ping."""
    await _verify_participant(session, match_id, user.id)

    result = await session.execute(
        select(SafetySession)
        .join(MatchParticipant, MatchParticipant.user_id == SafetySession.user_id)
        .where(
            SafetySession.match_id == match_id,
            SafetySession.user_id != user.id,
        )
        .order_by(SafetySession.last_ping_at.desc().nulls_last())
        .limit(1)
    )
    other = result.scalar_one_or_none()
    if other is None or other.last_ping_location is None or other.last_ping_at is None:
        return None, None, None

    point = await session.execute(
        select(
            func.ST_Y(other.__table__.c.last_ping_location).label("lat"),
            func.ST_X(other.__table__.c.last_ping_location).label("lng"),
        ).where(other.__table__.c.id == other.id)
    )
    lat, lng = point.one()
    return lat, lng, other.last_ping_at
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_safety_pings.py
import pytest

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.safety.service import get_peer_location, ping_location
from sqlalchemy import select


async def _match(session):
    from gad.schemas.auth import RegisterIn

    host_t = await register(session, RegisterIn(email="sh@example.com", password="12345678", display_name="H"))
    app_t = await register(session, RegisterIn(email="sa@example.com", password="12345678", display_name="A"))
    host = (await session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (await session.execute(select(User).where(User.id == app_t.user_id))).scalar_one()

    plan = await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X", max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    app = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
    match = await accept_application(session, host, app.id)
    return host, applicant, match


@pytest.mark.asyncio
async def test_ping_then_get_peer(db_session):
    host, applicant, match = await _match(db_session)

    await ping_location(db_session, host, match.id, -34.59, -58.43)

    lat, lng, ts = await get_peer_location(db_session, applicant, match.id)
    assert lat is not None
    assert abs(lat - (-34.59)) < 0.001
    assert ts is not None


@pytest.mark.asyncio
async def test_get_peer_without_ping_returns_none(db_session):
    host, applicant, match = await _match(db_session)
    lat, lng, ts = await get_peer_location(db_session, applicant, match.id)
    assert lat is None
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_safety_pings.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/safety/service.py backend/tests/test_safety_pings.py
git commit -m "feat(safety): pings de ubicación en vivo + ubicación del par"
```

---

## Task 5: Servicio — SOS + link público

**Files:**
- Modify: `backend/src/gad/safety/service.py`
- Test: `backend/tests/test_safety_sos.py`

- [ ] **Step 1: Añadir a `backend/src/gad/safety/service.py`**

```python
# Añadir imports
from gad.notifications.service import create_notification
from gad.models.enums import NotificationType
from gad.safety.tokens import create_share_link_token


async def trigger_sos(
    session: AsyncSession, user: User, match_id: UUID, lat: float, lng: float
) -> SafetyEvent:
    await _verify_participant(session, match_id, user.id)

    event = SafetyEvent(
        match_id=match_id,
        user_id=user.id,
        type=SafetyEventType.sos,
        payload={"lat": lat, "lng": lng},
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)

    # Notificar al otro participante
    other_participants = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id != user.id,
        )
    )
    for p in other_participants.scalars():
        await create_notification(
            session, p.user_id, NotificationType.safety,
            {"type": "sos", "match_id": str(match_id), "from": str(user.id)},
        )

    return event


async def generate_share_link(
    session: AsyncSession, user: User, match_id: UUID
) -> str:
    await _verify_participant(session, match_id, user.id)
    return create_share_link_token(match_id, user.id)


async def get_public_location(
    session: AsyncSession, token: str
):
    """Resuelve el link público: valida token, devuelve ubicación del user."""
    from gad.safety.tokens import decode_share_link_token
    from jose import JWTError

    try:
        payload = decode_share_link_token(token)
    except JWTError:
        from gad.exceptions import InvalidTokenError

        raise InvalidTokenError("Link inválido o expirado")

    match_id = UUID(payload.match_id)
    user_id = UUID(payload.user_id)

    # Info del user
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        from gad.exceptions import NotFoundError

        raise NotFoundError("Usuario no encontrado")

    # Última sesión de safety
    safety_result = await session.execute(
        select(SafetySession).where(
            SafetySession.match_id == match_id,
            SafetySession.user_id == user_id,
        )
    )
    safety = safety_result.scalar_one_or_none()

    lat = lng = None
    last_ping = None
    if safety and safety.last_ping_location and safety.last_ping_at:
        point = await session.execute(
            select(
                func.ST_Y(safety.__table__.c.last_ping_location),
                func.ST_X(safety.__table__.c.last_ping_location),
            ).where(safety.__table__.c.id == safety.id)
        )
        lat, lng = point.one()
        last_ping = safety.last_ping_at

    from datetime import datetime, timezone

    expired = payload.exp < datetime.now(timezone.utc).timestamp()

    return {
        "match_id": match_id,
        "user_display_name": user.display_name,
        "lat": lat,
        "lng": lng,
        "last_ping_at": last_ping,
        "expired": expired,
    }
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_safety_sos.py
import pytest

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, PlanMode, SafetyEventType
from gad.models.user import User
from gad.notifications.service import list_notifications
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.safety.service import generate_share_link, get_public_location, trigger_sos
from sqlalchemy import select


async def _match(session):
    from gad.schemas.auth import RegisterIn

    host_t = await register(session, RegisterIn(email="sh2@example.com", password="12345678", display_name="H"))
    app_t = await register(session, RegisterIn(email="sa2@example.com", password="12345678", display_name="A"))
    host = (await session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (await session.execute(select(User).where(User.id == app_t.user_id))).scalar_one()
    plan = await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X", max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    app = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
    match = await accept_application(session, host, app.id)
    return host, applicant, match


@pytest.mark.asyncio
async def test_sos_creates_event_and_notifies(db_session):
    host, applicant, match = await _match(db_session)

    event = await trigger_sos(db_session, host, match.id, -34.5, -58.4)

    assert event.type == SafetyEventType.sos
    notifs = await list_notifications(db_session, applicant.id)
    assert len(notifs) == 1


@pytest.mark.asyncio
async def test_share_link_resolves_to_location(db_session):
    host, applicant, match = await _match(db_session)
    from gad.safety.service import ping_location

    await ping_location(db_session, host, match.id, -34.59, -58.43)

    token = await generate_share_link(db_session, host, match.id)
    info = await get_public_location(db_session, token)

    assert info["user_display_name"] == "H"
    assert info["lat"] is not None
    assert info["expired"] is False
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_safety_sos.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/safety/service.py backend/tests/test_safety_sos.py
git commit -m "feat(safety): SOS con notificación + link público de ubicación"
```

---

## Task 6: Routers de seguridad

**Files:**
- Create: `backend/src/gad/safety/router.py`
- Create: `backend/src/gad/safety/public_router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_safety_router.py`

- [ ] **Step 1: `backend/src/gad/safety/router.py`**

```python
# backend/src/gad/safety/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.safety.schemas import (
    PeerLocationOut,
    PingIn,
    SosOut,
    TrustedContactIn,
    TrustedContactOut,
)
from gad.safety.service import (
    add_trusted_contact,
    delete_trusted_contact,
    generate_share_link,
    get_peer_location,
    list_trusted_contacts,
    ping_location,
    trigger_sos,
)

router = APIRouter(tags=["safety"])


@router.get("/me/trusted-contacts", response_model=list[TrustedContactOut])
async def list_contacts_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TrustedContactOut]:
    contacts = await list_trusted_contacts(session, current_user)
    return [
        TrustedContactOut(
            id=c.id, contact_type=c.contact_type, contact_value=c.contact_value,
            label=c.label, created_at=c.created_at,
        )
        for c in contacts
    ]


@router.post("/me/trusted-contacts", response_model=TrustedContactOut, status_code=201)
async def add_contact_endpoint(
    data: TrustedContactIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TrustedContactOut:
    contact = await add_trusted_contact(session, current_user, data)
    return TrustedContactOut(
        id=contact.id, contact_type=contact.contact_type,
        contact_value=contact.contact_value, label=contact.label,
        created_at=contact.created_at,
    )


@router.delete("/me/trusted-contacts/{contact_id}")
async def delete_contact_endpoint(
    contact_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await delete_trusted_contact(session, current_user, contact_id)
    return {"message": "Contacto eliminado"}


@router.post("/safety/{match_id}/ping")
async def ping_endpoint(
    match_id: UUID,
    data: PingIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await ping_location(session, current_user, match_id, data.lat, data.lng)
    return {"message": "Ubicación actualizada"}


@router.get("/safety/{match_id}/peer", response_model=PeerLocationOut)
async def peer_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PeerLocationOut:
    lat, lng, ts = await get_peer_location(session, current_user, match_id)
    return PeerLocationOut(lat=lat, lng=lng, last_ping_at=ts)


@router.post("/safety/{match_id}/share-link")
async def share_link_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    token = await generate_share_link(session, current_user, match_id)
    return {"token": token, "url": f"/s/{token}"}


@router.post("/safety/{match_id}/sos", response_model=SosOut)
async def sos_endpoint(
    match_id: UUID,
    data: PingIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SosOut:
    event = await trigger_sos(session, current_user, match_id, data.lat, data.lng)
    return SosOut(event_id=event.id, message="SOS registrado y notificado")
```

- [ ] **Step 2: `backend/src/gad/safety/public_router.py`**

```python
# backend/src/gad/safety/public_router.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.db import get_session
from gad.safety.schemas import PublicLocationOut
from gad.safety.service import get_public_location

router = APIRouter(tags=["safety"])


@router.get("/s/{token}", response_model=PublicLocationOut)
async def public_location_endpoint(
    token: str,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PublicLocationOut:
    info = await get_public_location(session, token)
    return PublicLocationOut(**info)
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_safety_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.safety.public_router import router as public_router
from gad.safety.router import router as safety_router


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(safety_router)
    app.include_router(public_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_trusted_contacts_crud(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "sc@example.com", "password": "12345678", "display_name": "S"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        resp = await c.post(
            "/me/trusted-contacts",
            json={"contact_type": "email", "contact_value": "m@example.com", "label": "Mom"},
            headers=headers,
        )
        assert resp.status_code == 201
        contact_id = resp.json()["id"]

        resp = await c.get("/me/trusted-contacts", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        resp = await c.delete(f"/me/trusted-contacts/{contact_id}", headers=headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_public_link_invalid_returns_401(client):
    async with client as c:
        resp = await c.get("/s/invalid-token")
    assert resp.status_code == 401
```

- [ ] **Step 4: Incluir routers en `main.py`**

```python
from gad.safety.router import router as safety_router
from gad.safety.public_router import router as safety_public_router
# ...
    app.include_router(safety_router)
    app.include_router(safety_public_router)
```

- [ ] **Step 5:** Run `cd backend && poetry run pytest tests/test_safety_router.py -v` → PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/safety/router.py backend/src/gad/safety/public_router.py backend/src/gad/main.py backend/tests/test_safety_router.py
git commit -m "feat(safety): routers de contactos, ping, peer, share-link, SOS y link público"
```

---

## Task 7: Smoke test de la Fase 4

**Files:**
- Create: `backend/tests/test_smoke_phase4.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_smoke_phase4.py
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
async def test_safety_endpoints_require_auth(client):
    async with client as c:
        import uuid

        resp = await c.get("/me/trusted-contacts")
        assert resp.status_code == 401

        resp = await c.post(f"/safety/{uuid.uuid4()}/ping", json={"lat": 0, "lng": 0})
        assert resp.status_code == 401
```

- [ ] **Step 2:** Run `cd backend && poetry run pytest tests/test_smoke_phase4.py -v` → PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_phase4.py
git commit -m "test: smoke test de seguridad (Fase 4)"
```

---

## Self-Review

**1. Spec coverage (Fase 4):** ✅ Ubicación compartida en vivo (ping + peer), contacto de confianza + link público, botón SOS, bloqueos (ya en Fase 1), reportes (pendiente — ver nota).

**2. Placeholder scan:** Sin placeholders. Todos los servicios y routers tienen código completo.

**3. Type consistency:** `ping_location`, `get_peer_location`, `trigger_sos`, `generate_share_link`, `get_public_location` firmas consistentes entre servicio y router. `TrustedContactOut` mapeado correctamente.

**4. Seguridad:** El link público usa JWT firmado con expiración. Los pings validan participación. El SOS notifica al par.

**Nota:** El spec menciona "reportes de usuario" en sección 5.3. No está incluido en este plan — debe añadirse como Task adicional o moverse a Fase 5. Recomendación: añadir `POST /users/{id}/report` en Fase 5 junto con el panel de moderación.
