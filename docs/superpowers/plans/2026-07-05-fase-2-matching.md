# Fase 2 — Matching y Postulaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el sistema de postulaciones a planes, aceptación/rechazo, creación automática de matches cuando se llena el cupo, y la inicialización del chat (sin realtime aún — llega en Fase 3). Incluye el endpoint para listar los matches del usuario.

**Architecture:** Nuevo módulo `matching/` con `service.py` (transacciones de postulación/aceptación) y `router.py`. Los matches se crean atómicamente al llenarse `current_participants == max_participants`. La notificación realtime de "match confirmado" se emite vía Redis pub/sub pero el consumo WebSocket se implementa en Fase 3; aquí solo publicamos el evento.

**Tech Stack:** FastAPI, SQLAlchemy async, Redis pub/sub (solo publish), pytest-asyncio.

**Depende de:** Fases 0 y 1 completadas.

---

## File Structure (adiciones)

```
backend/src/gad/
├── matching/
│   ├── __init__.py
│   ├── service.py             # apply, accept, reject, withdraw, list_matches
│   ├── schemas.py             # ApplicationIn, ApplicationOut, MatchOut
│   ├── notifications.py       # publish_match_event (Redis pub/sub)
│   └── router.py              # /plans/{id}/applications, /applications/{id}/*, /matches
└── schemas/
    └── (sin cambios)
```

---

## Task 1: Schemas de matching

**Files:**
- Create: `backend/src/gad/matching/__init__.py`
- Create: `backend/src/gad/matching/schemas.py`
- Test: `backend/tests/test_matching_schemas.py`

- [ ] **Step 1: `backend/src/gad/matching/__init__.py`**

```python
# backend/src/gad/matching/__init__.py
```

- [ ] **Step 2: `backend/src/gad/matching/schemas.py`**

```python
# backend/src/gad/matching/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ApplicationStatus, MatchRole, MatchStatus


class ApplicationIn(BaseModel):
    message: str | None = Field(default=None, max_length=500)


class ApplicantSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    reputation_score: float
    verification_level: str


class ApplicationOut(BaseModel):
    id: UUID
    plan_id: UUID
    applicant: ApplicantSummary
    status: ApplicationStatus
    message: str | None
    created_at: datetime
    decided_at: datetime | None


class ParticipantOut(BaseModel):
    user_id: UUID
    display_name: str
    avatar_url: str | None
    role: MatchRole
    joined_at: datetime


class MatchOut(BaseModel):
    id: UUID
    plan_id: UUID
    status: MatchStatus
    started_at: datetime
    ended_at: datetime | None
    location_sharing_active: bool
    participants: list[ParticipantOut]
    # Ubicación exacta revelada solo a participantes
    exact_location_lat: float | None = None
    exact_location_lng: float | None = None
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_matching_schemas.py
from gad.matching.schemas import ApplicationIn, ApplicationOut, MatchOut


def test_application_in_message_optional():
    a = ApplicationIn()
    assert a.message is None


def test_application_in_message_max_length():
    from pydantic import ValidationError
    import pytest

    with pytest.raises(ValidationError):
        ApplicationIn(message="x" * 501)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_matching_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/matching/__init__.py backend/src/gad/matching/schemas.py backend/tests/test_matching_schemas.py
git commit -m "feat(matching): schemas de postulaciones y matches"
```

---

## Task 2: Publicación de eventos (Redis pub/sub)

**Files:**
- Create: `backend/src/gad/matching/notifications.py`
- Test: `backend/tests/test_matching_notifications.py`

- [ ] **Step 1: `backend/src/gad/matching/notifications.py`**

```python
# backend/src/gad/matching/notifications.py
"""Publicación de eventos de matching vía Redis pub/sub.

El consumo (WebSocket) llega en Fase 3. Aquí solo publicamos.
"""
import json

from gad.redis_client import redis_client


def _channel_for_user(user_id: str) -> str:
    return f"gad:user:{user_id}"


async def publish_new_application(host_id: str, plan_id: str, applicant_id: str) -> None:
    await redis_client.publish(
        _channel_for_user(host_id),
        json.dumps(
            {
                "type": "new_application",
                "plan_id": plan_id,
                "applicant_id": applicant_id,
            }
        ),
    )


async def publish_match_created(match_id: str, plan_id: str, participant_ids: list[str]) -> None:
    for uid in participant_ids:
        await redis_client.publish(
            _channel_for_user(uid),
            json.dumps(
                {
                    "type": "match_created",
                    "match_id": match_id,
                    "plan_id": plan_id,
                }
            ),
        )


async def publish_application_decided(
    applicant_id: str, plan_id: str, accepted: bool
) -> None:
    await redis_client.publish(
        _channel_for_user(applicant_id),
        json.dumps(
            {
                "type": "application_decided",
                "plan_id": plan_id,
                "accepted": accepted,
            }
        ),
    )
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_matching_notifications.py
import asyncio
import json

import pytest


@pytest.mark.asyncio
async def test_publish_match_created_delivers_to_all_participants(redis_client):
    received: list[dict] = []

    async def subscriber(channel):
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(channel)
        async for msg in pubsub.listen():
            if msg["type"] == "subscribe":
                continue
            received.append(json.loads(msg["data"]))
            break

    task1 = asyncio.create_task(subscriber("gad:user:u1"))
    task2 = asyncio.create_task(subscriber("gad:user:u2"))
    await asyncio.sleep(0.1)

    from gad.matching.notifications import publish_match_created

    await publish_match_created("m1", "p1", ["u1", "u2"])
    await asyncio.wait_for(asyncio.gather(task1, task2), timeout=2)

    assert len(received) == 2
    assert all(r["type"] == "match_created" for r in received)
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_matching_notifications.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/matching/notifications.py backend/tests/test_matching_notifications.py
git commit -m "feat(matching): publicación de eventos vía Redis pub/sub"
```

---

## Task 3: Servicio de matching — postularse

**Files:**
- Create: `backend/src/gad/matching/service.py`
- Test: `backend/tests/test_matching_apply.py`

- [ ] **Step 1: `backend/src/gad/matching/service.py`**

```python
# backend/src/gad/matching/service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.matching.notifications import publish_new_application
from gad.matching.schemas import ApplicationIn
from gad.models.enums import ApplicationStatus, PlanMode, PlanStatus
from gad.models.plan import Plan, PlanApplication
from gad.models.user import User
from gad.users.service import is_blocked_pair


async def _load_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def apply_to_plan(
    session: AsyncSession,
    applicant: User,
    plan_id: UUID,
    data: ApplicationIn,
) -> PlanApplication:
    plan = await _load_plan(session, plan_id)

    if plan.status != PlanStatus.open:
        raise ConflictError("El plan no está abierto a postulaciones")
    if plan.host_id == applicant.id:
        raise ValidationError("No podés postularte a tu propio plan")
    if await is_blocked_pair(session, applicant.id, plan.host_id):
        raise ConflictError("No podés postularte a este plan")

    existing = await session.execute(
        select(PlanApplication).where(
            PlanApplication.plan_id == plan_id,
            PlanApplication.applicant_id == applicant.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Ya te postulaste a este plan")

    application = PlanApplication(
        plan_id=plan_id,
        applicant_id=applicant.id,
        status=ApplicationStatus.pending,
        message=data.message,
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)

    await publish_new_application(
        str(plan.host_id), str(plan_id), str(applicant.id)
    )
    return application
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_matching_apply.py
import pytest

from gad.auth.service import register
from gad.exceptions import ConflictError, ValidationError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import apply_to_plan
from gad.models.enums import ActivityType, PlanMode
from gad.models.plan import Plan
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from sqlalchemy import select


async def _make_user(session, email):
    tokens = await register(
        session,
        __import__("gad.schemas.auth", fromlist=["RegisterIn"]).RegisterIn(
            email=email, password="12345678", display_name="U"
        ),
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


async def _make_plan(session, host):
    return await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )


@pytest.mark.asyncio
async def test_apply_to_plan_creates_pending(db_session):
    host = await _make_user(db_session, "host@example.com")
    applicant = await _make_user(db_session, "app@example.com")
    plan = await _make_plan(db_session, host)

    application = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())

    assert application.status.value == "pending"
    assert application.applicant_id == applicant.id


@pytest.mark.asyncio
async def test_apply_to_own_plan_raises(db_session):
    host = await _make_user(db_session, "self@example.com")
    plan = await _make_plan(db_session, host)

    with pytest.raises(ValidationError):
        await apply_to_plan(db_session, host, plan.id, ApplicationIn())


@pytest.mark.asyncio
async def test_apply_twice_raises(db_session):
    host = await _make_user(db_session, "h@example.com")
    applicant = await _make_user(db_session, "a@example.com")
    plan = await _make_plan(db_session, host)

    await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    with pytest.raises(ConflictError):
        await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_matching_apply.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/matching/service.py backend/tests/test_matching_apply.py
git commit -m "feat(matching): postulación a plan con validaciones"
```

---

## Task 4: Servicio de matching — aceptar/rechazar/withdraw

**Files:**
- Modify: `backend/src/gad/matching/service.py`
- Test: `backend/tests/test_matching_decide.py`

- [ ] **Step 1: Añadir a `backend/src/gad/matching/service.py`**

```python
# Añadir imports
from datetime import datetime, timezone

from geoalchemy2.elements import WKTElement

from gad.matching.notifications import (
    publish_application_decided,
    publish_match_created,
)
from gad.models.enums import MatchRole, MatchStatus
from gad.models.match import Match, MatchParticipant
from gad.models.plan import PlanApplication


async def _load_application(session: AsyncSession, application_id: UUID) -> PlanApplication:
    result = await session.execute(
        select(PlanApplication).where(PlanApplication.id == application_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise NotFoundError("Postulación no encontrada")
    return application


async def accept_application(
    session: AsyncSession, host: User, application_id: UUID
) -> Match | None:
    application = await _load_application(session, application_id)
    plan = await _load_plan(session, application.plan_id)

    if plan.host_id != host.id:
        raise NotFoundError("Postulación no encontrada")
    if plan.status != PlanStatus.open:
        raise ConflictError("El plan no está abierto")
    if application.status != ApplicationStatus.pending:
        raise ConflictError("La postulación ya fue decidida")
    if plan.current_participants >= plan.max_participants:
        raise ConflictError("El plan está completo")

    application.status = ApplicationStatus.accepted
    application.decided_at = datetime.now(timezone.utc)
    plan.current_participants += 1

    match = None
    if plan.current_participants >= plan.max_participants:
        plan.status = PlanStatus.matched
        match = Match(
            plan_id=plan.id,
            status=MatchStatus.active,
            started_at=datetime.now(timezone.utc),
            location_sharing_active=False,
        )
        session.add(match)
        await session.flush()  # para tener match.id

        # Host
        session.add(
            MatchParticipant(
                match_id=match.id,
                user_id=host.id,
                role=MatchRole.host,
                joined_at=datetime.now(timezone.utc),
            )
        )
        # Participantes aceptados (incluyendo el actual)
        accepted_apps = await session.execute(
            select(PlanApplication).where(
                PlanApplication.plan_id == plan.id,
                PlanApplication.status == ApplicationStatus.accepted,
            )
        )
        participant_ids = [host.id]
        for app in accepted_apps.scalars():
            session.add(
                MatchParticipant(
                    match_id=match.id,
                    user_id=app.applicant_id,
                    role=MatchRole.participant,
                    joined_at=datetime.now(timezone.utc),
                )
            )
            participant_ids.append(app.applicant_id)

        await publish_match_created(
            str(match.id), str(plan.id), [str(u) for u in participant_ids]
        )

    await session.commit()
    if application.applicant_id:
        await publish_application_decided(
            str(application.applicant_id), str(plan.id), accepted=True
        )
    if match is not None:
        await session.refresh(match)
    return match


async def reject_application(
    session: AsyncSession, host: User, application_id: UUID
) -> None:
    application = await _load_application(session, application_id)
    plan = await _load_plan(session, application.plan_id)

    if plan.host_id != host.id:
        raise NotFoundError("Postulación no encontrada")
    if application.status != ApplicationStatus.pending:
        raise ConflictError("La postulación ya fue decidida")

    application.status = ApplicationStatus.rejected
    application.decided_at = datetime.now(timezone.utc)
    await session.commit()

    await publish_application_decided(
        str(application.applicant_id), str(plan.id), accepted=False
    )


async def withdraw_application(
    session: AsyncSession, applicant: User, application_id: UUID
) -> None:
    application = await _load_application(session, application_id)
    if application.applicant_id != applicant.id:
        raise NotFoundError("Postulación no encontrada")
    if application.status != ApplicationStatus.pending:
        raise ConflictError("La postulación ya fue decidida")

    application.status = ApplicationStatus.withdrawn
    await session.commit()
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_matching_decide.py
import pytest

from gad.auth.service import register
from gad.exceptions import ConflictError, NotFoundError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import (
    accept_application,
    apply_to_plan,
    reject_application,
    withdraw_application,
)
from gad.models.enums import ActivityType, ApplicationStatus, PlanMode, PlanStatus
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from sqlalchemy import select


async def _user(session, email):
    tokens = await register(
        session,
        __import__("gad.schemas.auth", fromlist=["RegisterIn"]).RegisterIn(
            email=email, password="12345678", display_name="U"
        ),
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


async def _plan(session, host, **kw):
    return await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"), **kw),
    )


@pytest.mark.asyncio
async def test_accept_application_on_1v1_creates_match(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    match = await accept_application(db_session, host, app.id)

    assert match is not None
    assert plan.status == PlanStatus.matched
    assert plan.current_participants == 1


@pytest.mark.asyncio
async def test_reject_application_keeps_plan_open(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    await reject_application(db_session, host, app.id)

    await db_session.refresh(app)
    assert app.status == ApplicationStatus.rejected
    await db_session.refresh(plan)
    assert plan.status == PlanStatus.open


@pytest.mark.asyncio
async def test_withdraw_own_application(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    await withdraw_application(db_session, applicant, app.id)

    await db_session.refresh(app)
    assert app.status == ApplicationStatus.withdrawn


@pytest.mark.asyncio
async def test_accept_on_full_plan_raises(db_session):
    host = await _user(db_session, "h@example.com")
    a1 = await _user(db_session, "a1@example.com")
    a2 = await _user(db_session, "a2@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app1 = await apply_to_plan(db_session, a1, plan.id, ApplicationIn())
    await accept_application(db_session, host, app1.id)

    app2 = await apply_to_plan(db_session, a2, plan.id, ApplicationIn())
    # plan ya está matched
    with pytest.raises(ConflictError):
        await accept_application(db_session, host, app2.id)
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_matching_decide.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/matching/service.py backend/tests/test_matching_decide.py
git commit -m "feat(matching): aceptar, rechazar y withdraw postulaciones + creación de match"
```

---

## Task 5: Servicio — listar matches y aplicaciones

**Files:**
- Modify: `backend/src/gad/matching/service.py`
- Test: `backend/tests/test_matching_list.py`

- [ ] **Step 1: Añadir a `backend/src/gad/matching/service.py`**

```python
# Añadir imports
from gad.models.match import Match, MatchParticipant


async def list_applications_for_plan(
    session: AsyncSession, host: User, plan_id: UUID
) -> list[PlanApplication]:
    plan = await _load_plan(session, plan_id)
    if plan.host_id != host.id:
        raise NotFoundError("Plan no encontrado")
    result = await session.execute(
        select(PlanApplication)
        .where(PlanApplication.plan_id == plan_id)
        .order_by(PlanApplication.created_at.desc())
    )
    return list(result.scalars().all())


async def list_my_applications(session: AsyncSession, user: User) -> list[PlanApplication]:
    result = await session.execute(
        select(PlanApplication)
        .where(PlanApplication.applicant_id == user.id)
        .order_by(PlanApplication.created_at.desc())
    )
    return list(result.scalars().all())


async def list_my_matches(session: AsyncSession, user: User) -> list[Match]:
    result = await session.execute(
        select(Match)
        .join(MatchParticipant, MatchParticipant.match_id == Match.id)
        .where(MatchParticipant.user_id == user.id)
        .order_by(Match.started_at.desc())
    )
    return list(result.scalars().unique().all())


async def get_match(session: AsyncSession, match_id: UUID) -> Match:
    result = await session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise NotFoundError("Match no encontrado")
    return match
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_matching_list.py
import pytest

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import (
    accept_application,
    apply_to_plan,
    list_applications_for_plan,
    list_my_applications,
    list_my_matches,
)
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from sqlalchemy import select


async def _user(session, email):
    tokens = await register(
        session,
        __import__("gad.schemas.auth", fromlist=["RegisterIn"]).RegisterIn(
            email=email, password="12345678", display_name="U"
        ),
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


async def _plan(session, host):
    return await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )


@pytest.mark.asyncio
async def test_list_applications_for_plan(db_session):
    host = await _user(db_session, "h@example.com")
    a1 = await _user(db_session, "a1@example.com")
    a2 = await _user(db_session, "a2@example.com")
    plan = await _plan(db_session, host)

    await apply_to_plan(db_session, a1, plan.id, ApplicationIn())
    await apply_to_plan(db_session, a2, plan.id, ApplicationIn())

    apps = await list_applications_for_plan(db_session, host, plan.id)
    assert len(apps) == 2


@pytest.mark.asyncio
async def test_list_my_applications(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host)

    await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())

    apps = await list_my_applications(db_session, applicant)
    assert len(apps) == 1


@pytest.mark.asyncio
async def test_list_my_matches_after_accept(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    await accept_application(db_session, host, app.id)

    host_matches = await list_my_matches(db_session, host)
    applicant_matches = await list_my_matches(db_session, applicant)
    assert len(host_matches) == 1
    assert len(applicant_matches) == 1
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_matching_list.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/matching/service.py backend/tests/test_matching_list.py
git commit -m "feat(matching): listar aplicaciones y matches del usuario"
```

---

## Task 6: Router de matching

**Files:**
- Create: `backend/src/gad/matching/router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_matching_router.py`

- [ ] **Step 1: `backend/src/gad/matching/router.py`**

```python
# backend/src/gad/matching/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.exceptions import NotFoundError
from gad.matching.schemas import (
    ApplicantSummary,
    ApplicationIn,
    ApplicationOut,
    MatchOut,
    ParticipantOut,
)
from gad.matching.service import (
    accept_application,
    apply_to_plan,
    get_match,
    list_applications_for_plan,
    list_my_applications,
    list_my_matches,
    reject_application,
    withdraw_application,
)
from gad.models.match import MatchParticipant
from gad.models.plan import PlanApplication
from gad.models.user import User

router = APIRouter(tags=["matching"])


async def _app_to_out(session: AsyncSession, app: PlanApplication) -> ApplicationOut:
    result = await session.execute(select(User).where(User.id == app.applicant_id))
    applicant = result.scalar_one()
    return ApplicationOut(
        id=app.id,
        plan_id=app.plan_id,
        applicant=ApplicantSummary(
            id=applicant.id,
            display_name=applicant.display_name,
            avatar_url=applicant.avatar_url,
            reputation_score=applicant.reputation_score,
            verification_level=applicant.verification_level.value,
        ),
        status=app.status,
        message=app.message,
        created_at=app.created_at,
        decided_at=app.decided_at,
    )


async def _match_to_out(session: AsyncSession, match, viewer: User) -> MatchOut:
    participants_result = await session.execute(
        select(User, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.user_id == User.id)
        .where(MatchParticipant.match_id == match.id)
    )
    participants = [
        ParticipantOut(
            user_id=u.id,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            role=mp.role,
            joined_at=mp.joined_at,
        )
        for u, mp in participants_result.all()
    ]

    # Solo participantes ven la ubicación exacta
    exact_lat = None
    exact_lng = None
    is_participant = any(p.user_id == viewer.id for p in participants)
    if is_participant:
        from gad.models.plan import Plan

        plan_result = await session.execute(select(Plan).where(Plan.id == match.plan_id))
        plan = plan_result.scalar_one()
        if plan.exact_location is not None:
            point = await session.execute(
                select(
                    func.ST_Y(plan.__table__.c.exact_location).label("lat"),
                    func.ST_X(plan.__table__.c.exact_location).label("lng"),
                ).where(plan.__table__.c.id == plan.id)
            )
            exact_lat, exact_lng = point.one()

    return MatchOut(
        id=match.id,
        plan_id=match.plan_id,
        status=match.status,
        started_at=match.started_at,
        ended_at=match.ended_at,
        location_sharing_active=match.location_sharing_active,
        participants=participants,
        exact_location_lat=exact_lat,
        exact_location_lng=exact_lng,
    )


@router.post("/plans/{plan_id}/applications", response_model=ApplicationOut, status_code=201)
async def apply_endpoint(
    plan_id: UUID,
    data: ApplicationIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ApplicationOut:
    app = await apply_to_plan(session, current_user, plan_id, data)
    return await _app_to_out(session, app)


@router.get("/plans/{plan_id}/applications", response_model=list[ApplicationOut])
async def list_plan_applications_endpoint(
    plan_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApplicationOut]:
    apps = await list_applications_for_plan(session, current_user, plan_id)
    return [await _app_to_out(session, a) for a in apps]


@router.post("/applications/{application_id}/accept", response_model=MatchOut | None)
async def accept_endpoint(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut | None:
    match = await accept_application(session, current_user, application_id)
    if match is None:
        return None
    return await _match_to_out(session, match, current_user)


@router.post("/applications/{application_id}/reject")
async def reject_endpoint(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await reject_application(session, current_user, application_id)
    return {"message": "Postulación rechazada"}


@router.delete("/applications/{application_id}")
async def withdraw_endpoint(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await withdraw_application(session, current_user, application_id)
    return {"message": "Postulación retirada"}


@router.get("/me/applications", response_model=list[ApplicationOut])
async def my_applications_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApplicationOut]:
    apps = await list_my_applications(session, current_user)
    return [await _app_to_out(session, a) for a in apps]


@router.get("/matches", response_model=list[MatchOut])
async def my_matches_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[MatchOut]:
    matches = await list_my_matches(session, current_user)
    return [await _match_to_out(session, m, current_user) for m in matches]


@router.get("/matches/{match_id}", response_model=MatchOut)
async def get_match_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    match = await get_match(session, match_id)
    return await _match_to_out(session, match, current_user)
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_matching_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.db import async_session_maker
from gad.matching.router import router as matching_router
from gad.plans.router import router as plans_router


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(plans_router)
    app.include_router(matching_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register(client, email):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "U"},
    )
    return resp.json()["access_token"], resp.json()["user_id"]


async def _create_plan(client, token):
    resp = await client.post(
        "/plans",
        json={
            "activity_type": "coffee", "mode": "now", "title": "X", "max_participants": 1,
            "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_full_apply_accept_flow(client):
    async with client as c:
        host_token, host_id = await _register(c, "host@example.com")
        app_token, app_id = await _register(c, "applicant@example.com")

        plan_id = await _create_plan(c, host_token)

        # Applicant se postula
        resp = await c.post(
            f"/plans/{plan_id}/applications",
            json={"message": "Hola"},
            headers={"Authorization": f"Bearer {app_token}"},
        )
        assert resp.status_code == 201
        app_id_resp = resp.json()["id"]

        # Host ve postulaciones
        resp = await c.get(
            f"/plans/{plan_id}/applications",
            headers={"Authorization": f"Bearer {host_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Host acepta → crea match
        resp = await c.post(
            f"/applications/{app_id_resp}/accept",
            headers={"Authorization": f"Bearer {host_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

        # Ambos ven el match
        resp = await c.get("/matches", headers={"Authorization": f"Bearer {host_token}"})
        assert len(resp.json()) == 1
        resp = await c.get("/matches", headers={"Authorization": f"Bearer {app_token}"})
        assert len(resp.json()) == 1
```

- [ ] **Step 3: Incluir router en `main.py`**

```python
from gad.matching.router import router as matching_router
# ...
    app.include_router(matching_router)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_matching_router.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/matching/router.py backend/src/gad/main.py backend/tests/test_matching_router.py
git commit -m "feat(matching): router completo de postulaciones y matches"
```

---

## Task 7: Smoke test de integración de la Fase 2

**Files:**
- Create: `backend/tests/test_smoke_phase2.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_smoke_phase2.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.main import create_app
from gad.matching.router import router as matching_router
from gad.plans.router import router as plans_router


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_plan_apply_match_flow(client):
    async with client as c:
        # Host crea plan
        host_resp = await c.post(
            "/auth/register",
            json={"email": "host2@example.com", "password": "12345678", "display_name": "H"},
        )
        host_token = host_resp.json()["access_token"]

        plan_resp = await c.post(
            "/plans",
            json={
                "activity_type": "drinks", "mode": "now", "title": "Cervezas",
                "max_participants": 1,
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers={"Authorization": f"Bearer {host_token}"},
        )
        plan_id = plan_resp.json()["id"]

        # Applicant se postula
        app_resp = await c.post(
            "/auth/register",
            json={"email": "app2@example.com", "password": "12345678", "display_name": "A"},
        )
        app_token = app_resp.json()["access_token"]

        apply_resp = await c.post(
            f"/plans/{plan_id}/applications",
            json={"message": "Me sumo"},
            headers={"Authorization": f"Bearer {app_token}"},
        )
        app_id = apply_resp.json()["id"]

        # Host acepta
        accept_resp = await c.post(
            f"/applications/{app_id}/accept",
            headers={"Authorization": f"Bearer {host_token}"},
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["participants"] is not None
        assert len(accept_resp.json()["participants"]) == 2
```

- [ ] **Step 2:** Run `cd backend && poetry run pytest tests/test_smoke_phase2.py -v` → PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_phase2.py
git commit -m "test: smoke test de postulación + match (Fase 2)"
```

---

## Self-Review

**1. Spec coverage (Fase 2):** ✅ Aplicaciones + aceptación + creación de matches + webapp (la webapp del mapa se cubre en la Fase 6 frontend — este plan es backend). Las queries espaciales ya están en Fase 1.

**2. Placeholder scan:** Sin placeholders. Los serializers usan ST_Y/ST_X consistentemente.

**3. Type consistency:** `apply_to_plan`, `accept_application`, `reject_application`, `withdraw_application` firmas consistentes. `MatchOut.participants` → `ParticipantOut[]`. `_match_to_out` y `_app_to_out` usados en todo el router.

**4. Edge cases cubiertos:** postularse a plan propio, duplicado, plan cerrado, bloqueo mutuo, accept en plan lleno.
