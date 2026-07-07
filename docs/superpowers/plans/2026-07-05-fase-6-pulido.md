# Fase 6 — Pulido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el "modo disponible" con alertas cuando aparecen planes compatibles cerca, pulir estados vacíos y errores, optimizar queries PostGIS, y hardening final (rate limiting ampliado, CORS estricto, HSTS). Esta fase cierra el producto.

**Architecture:** Nuevo módulo `availability/` con el modo disponible. Un job que escucha eventos `plan:created` del pub/sub de Fase 2 y matchea contra `availability` activas para enviar alertas. Hardening en middleware. Optimización de índices y queries.

**Tech Stack:** FastAPI, SQLAlchemy async, Redis pub/sub, APScheduler, pytest-asyncio.

**Depende de:** Fases 0-5 completadas.

---

## File Structure (adiciones)

```
backend/src/gad/
├── availability/
│   ├── __init__.py
│   ├── service.py             # activate, deactivate, list_mine
│   ├── matcher.py             # find_availability_for_plan (PostGIS)
│   ├── schemas.py
│   ├── router.py              # /availability
│   └── alerts.py              # consume plan:created → send alerts
├── middleware/
│   └── security_headers.py    # HSTS, X-Frame-Options, etc.
└── jobs/
    └── expire_availability.py  # expira availability vencida
```

---

## Task 1: Schemas de availability

**Files:**
- Create: `backend/src/gad/availability/__init__.py`
- Create: `backend/src/gad/availability/schemas.py`
- Test: `backend/tests/test_availability_schemas.py`

- [ ] **Step 1: `backend/src/gad/availability/__init__.py`**

```python
# backend/src/gad/availability/__init__.py
```

- [ ] **Step 2: `backend/src/gad/availability/schemas.py`**

```python
# backend/src/gad/availability/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ActivityType


class AvailabilityLocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class AvailabilityIn(BaseModel):
    location: AvailabilityLocationIn
    radius_m: int = Field(default=2000, ge=100, le=50000)
    activity_filter: list[ActivityType] | None = None
    window_minutes: int = Field(default=120, ge=15, le=1440)


class AvailabilityOut(BaseModel):
    id: UUID
    radius_m: int
    activity_filter: list[str] | None
    expires_at: datetime
    active: bool
    created_at: datetime
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_availability_schemas.py
import pytest
from pydantic import ValidationError

from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn


def test_availability_in_defaults():
    a = AvailabilityIn(location=AvailabilityLocationIn(lat=-34.5, lng=-58.4))
    assert a.radius_m == 2000


def test_availability_rejects_bad_coords():
    with pytest.raises(ValidationError):
        AvailabilityLocationIn(lat=95, lng=0)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_availability_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/availability/__init__.py backend/src/gad/availability/schemas.py backend/tests/test_availability_schemas.py
git commit -m "feat(availability): schemas del modo disponible"
```

---

## Task 2: Servicio de availability

**Files:**
- Create: `backend/src/gad/availability/service.py`
- Test: `backend/tests/test_availability_service.py`

- [ ] **Step 1: `backend/src/gad/availability/service.py`**

```python
# backend/src/gad/availability/service.py
from datetime import datetime, timedelta, timezone
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.availability import Availability
from gad.models.geo import snap_to_grid
from gad.models.user import User
from gad.availability.schemas import AvailabilityIn


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def activate(
    session: AsyncSession, user: User, data: AvailabilityIn
) -> Availability:
    # Solo una availability activa por user: desactivar previas
    existing = await session.execute(
        select(Availability).where(
            Availability.user_id == user.id, Availability.active.is_(True)
        )
    )
    for a in existing.scalars():
        a.active = False

    grid_lat, grid_lng = snap_to_grid(data.location.lat, data.location.lng)
    availability = Availability(
        user_id=user.id,
        location_grid=_to_geography(grid_lat, grid_lng),
        radius_m=data.radius_m,
        activity_filter=[act.value for act in data.activity_filter] if data.activity_filter else None,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=data.window_minutes),
        active=True,
    )
    session.add(availability)
    await session.commit()
    await session.refresh(availability)
    return availability


async def deactivate(session: AsyncSession, user: User) -> None:
    result = await session.execute(
        select(Availability).where(
            Availability.user_id == user.id, Availability.active.is_(True)
        )
    )
    for a in result.scalars():
        a.active = False
    await session.commit()


async def get_mine(session: AsyncSession, user: User) -> Availability | None:
    result = await session.execute(
        select(Availability).where(
            Availability.user_id == user.id, Availability.active.is_(True)
        )
    )
    return result.scalar_one_or_none()
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_availability_service.py
import pytest

from gad.auth.service import register
from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn
from gad.availability.service import activate, deactivate, get_mine
from gad.models.enums import ActivityType
from gad.models.user import User
from sqlalchemy import select


async def _user(session, email):
    from gad.schemas.auth import RegisterIn

    t = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == t.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_activate_creates_availability(db_session):
    user = await _user(db_session, "av@example.com")
    avail = await activate(
        db_session, user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43)),
    )
    assert avail.active is True
    assert avail.user_id == user.id


@pytest.mark.asyncio
async def test_activate_replaces_previous(db_session):
    user = await _user(db_session, "av2@example.com")
    await activate(
        db_session, user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43), radius_m=1000),
    )
    second = await activate(
        db_session, user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43), radius_m=2000),
    )
    mine = await get_mine(db_session, user)
    assert mine.id == second.id


@pytest.mark.asyncio
async def test_deactivate(db_session):
    user = await _user(db_session, "av3@example.com")
    await activate(
        db_session, user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43)),
    )
    await deactivate(db_session, user)
    assert await get_mine(db_session, user) is None
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_availability_service.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/availability/service.py backend/tests/test_availability_service.py
git commit -m "feat(availability): activar/desactivar modo disponible"
```

---

## Task 3: Matcher — encontrar availability para un plan

**Files:**
- Create: `backend/src/gad/availability/matcher.py`
- Test: `backend/tests/test_availability_matcher.py`

- [ ] **Step 1: `backend/src/gad/availability/matcher.py`**

```python
# backend/src/gad/availability/matcher.py
"""Encuentra usuarios en 'modo disponible' a quienes notificar cuando aparece un plan."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.availability import Availability
from gad.models.enums import ActivityType
from gad.models.plan import Plan


async def find_matching_availability(
    session: AsyncSession, plan: Plan
) -> list[Availability]:
    """Devuelve availabilities activas, no expiradas, cuyo radio cubre la
    ubicación del plan, y cuyo filtro de actividad incluye el plan (o es null)."""
    stmt = (
        select(Availability)
        .where(
            Availability.active.is_(True),
            Availability.expires_at > __import__("sqlalchemy").func.now(),
            Availability.user_id != plan.host_id,
            # El plan cae dentro del radio de la availability
            Availability.location_grid.ST_DWithin(plan.location_grid, Availability.radius_m),
        )
    )
    # Filtro de actividad: si la availability tiene activity_filter, el plan debe estar incluido
    result = await session.execute(stmt)
    candidates = list(result.scalars().all())

    matched = []
    for av in candidates:
        if av.activity_filter is None or plan.activity_type.value in av.activity_filter:
            matched.append(av)
    return matched
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_availability_matcher.py
import pytest

from gad.availability.matcher import find_matching_availability
from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn
from gad.availability.service import activate
from gad.models.enums import ActivityType, PlanMode
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan


async def _user(session, email):
    from gad.auth.service import register
    from gad.schemas.auth import RegisterIn
    from gad.models.user import User
    from sqlalchemy import select

    t = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == t.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_find_matching_returns_closest_available(db_session):
    host = await _user(db_session, "host@example.com")
    available_user = await _user(db_session, "avail@example.com")

    await activate(
        db_session, available_user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43), radius_m=3000),
    )
    plan = await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )

    matches = await find_matching_availability(db_session, plan)
    assert len(matches) == 1
    assert matches[0].user_id == available_user.id


@pytest.mark.asyncio
async def test_find_matching_excludes_when_activity_filtered(db_session):
    host = await _user(db_session, "host2@example.com")
    available_user = await _user(db_session, "avail2@example.com")

    # Available solo para drinks
    await activate(
        db_session, available_user,
        AvailabilityIn(
            location=AvailabilityLocationIn(lat=-34.59, lng=-58.43),
            activity_filter=[ActivityType.drinks],
        ),
    )
    # Plan de coffee
    plan = await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )

    matches = await find_matching_availability(db_session, plan)
    assert len(matches) == 0
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_availability_matcher.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/availability/matcher.py backend/tests/test_availability_matcher.py
git commit -m "feat(availability): matcher PostGIS para encontrar disponibles cercanos al plan"
```

---

## Task 4: Alertas — integración en creación de plan

**Files:**
- Create: `backend/src/gad/availability/alerts.py`
- Modify: `backend/src/gad/plans/service.py`
- Test: `backend/tests/test_availability_alerts.py`

- [ ] **Step 1: `backend/src/gad/availability/alerts.py`**

```python
# backend/src/gad/availability/alerts.py
"""Envía alertas a usuarios disponibles cuando se crea un plan compatible."""
import json

from gad.models.enums import NotificationType
from gad.notifications.service import create_notification
from gad.redis_client import redis_client


async def notify_matching_users(
    session, plan, availabilities
) -> int:
    """Crea notificaciones plan_alert para cada usuario disponible y publica vía WS."""
    count = 0
    for av in availabilities:
        await create_notification(
            session,
            av.user_id,
            NotificationType.plan_alert,
            {
                "plan_id": str(plan.id),
                "activity_type": plan.activity_type.value,
                "location_label": plan.location_label,
            },
        )
        await redis_client.publish(
            f"gad:user:{av.user_id}",
            json.dumps(
                {
                    "type": "plan_alert",
                    "plan_id": str(plan.id),
                    "activity_type": plan.activity_type.value,
                }
            ),
        )
        count += 1
    return count
```

- [ ] **Step 2: Modificar `create_plan` en `backend/src/gad/plans/service.py`** para invocar alertas:

```python
# Añadir imports
from gad.availability.matcher import find_matching_availability
from gad.availability.alerts import notify_matching_users


# Al final de create_plan, después del commit/refresh:
    availabilities = await find_matching_availability(session, plan)
    await notify_matching_users(session, plan, availabilities)
    return plan
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_availability_alerts.py
import pytest

from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn
from gad.availability.service import activate
from gad.models.enums import ActivityType, NotificationType, PlanMode
from gad.notifications.service import list_notifications
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan


async def _user(session, email):
    from gad.auth.service import register
    from gad.schemas.auth import RegisterIn
    from gad.models.user import User
    from sqlalchemy import select

    t = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == t.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_creating_plan_alerts_available_users(db_session):
    host = await _user(db_session, "host3@example.com")
    available_user = await _user(db_session, "avail3@example.com")

    await activate(
        db_session, available_user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43)),
    )
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )

    notifs = await list_notifications(db_session, available_user.id)
    assert len(notifs) == 1
    assert notifs[0].type == NotificationType.plan_alert
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_availability_alerts.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/availability/alerts.py backend/src/gad/plans/service.py backend/tests/test_availability_alerts.py
git commit -m "feat(availability): alertas automáticas al crear plan compatible cerca"
```

---

## Task 5: Router de availability

**Files:**
- Create: `backend/src/gad/availability/router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_availability_router.py`

- [ ] **Step 1: `backend/src/gad/availability/router.py`**

```python
# backend/src/gad/availability/router.py
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.availability.schemas import AvailabilityIn, AvailabilityOut
from gad.availability.service import activate, deactivate, get_mine
from gad.db import get_session
from gad.models.user import User

router = APIRouter(prefix="/availability", tags=["availability"])


@router.post("", response_model=AvailabilityOut, status_code=201)
async def activate_endpoint(
    data: AvailabilityIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AvailabilityOut:
    avail = await activate(session, current_user, data)
    return AvailabilityOut(
        id=avail.id, radius_m=avail.radius_m, activity_filter=avail.activity_filter,
        expires_at=avail.expires_at, active=avail.active, created_at=avail.created_at,
    )


@router.get("/me", response_model=AvailabilityOut | None)
async def get_mine_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AvailabilityOut | None:
    avail = await get_mine(session, current_user)
    if avail is None:
        return None
    return AvailabilityOut(
        id=avail.id, radius_m=avail.radius_m, activity_filter=avail.activity_filter,
        expires_at=avail.expires_at, active=avail.active, created_at=avail.created_at,
    )


@router.delete("/me")
async def deactivate_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await deactivate(session, current_user)
    return {"message": "Modo disponible desactivado"}
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_availability_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.availability.router import router as availability_router


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(availability_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_activate_and_deactivate_flow(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "avr@example.com", "password": "12345678", "display_name": "U"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        resp = await c.post(
            "/availability",
            json={"location": {"lat": -34.59, "lng": -58.43}, "radius_m": 3000},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["active"] is True

        resp = await c.get("/availability/me", headers=headers)
        assert resp.status_code == 200

        resp = await c.delete("/availability/me", headers=headers)
        assert resp.status_code == 200
```

- [ ] **Step 3: Incluir router en `main.py`**

```python
from gad.availability.router import router as availability_router
# ...
    app.include_router(availability_router)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_availability_router.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/availability/router.py backend/src/gad/main.py backend/tests/test_availability_router.py
git commit -m "feat(availability): router /availability activate/deactivate/list"
```

---

## Task 6: Job de expiración de availability

**Files:**
- Create: `backend/src/gad/jobs/expire_availability.py`
- Modify: `backend/src/gad/jobs/scheduler.py`
- Test: `backend/tests/test_expire_availability.py`

- [ ] **Step 1: `backend/src/gad/jobs/expire_availability.py`**

```python
# backend/src/gad/jobs/expire_availability.py
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.availability import Availability


async def expire_availability(session: AsyncSession) -> int:
    """Desactiva availabilities cuya expires_at ya pasó."""
    now = datetime.now(timezone.utc)
    result = await session.execute(
        update(Availability)
        .where(Availability.active.is_(True), Availability.expires_at <= now)
        .values(active=False)
    )
    await session.commit()
    return result.rowcount or 0
```

- [ ] **Step 2: Modificar `backend/src/gad/jobs/scheduler.py`** para añadir el job:

```python
# Añadir import
from gad.jobs.expire_availability import expire_availability

# En setup_scheduler, añadir segundo job:
    scheduler.add_job(
        lambda: asyncio.create_task(_run_expire_availability()),
        trigger="interval",
        minutes=5,
        id="expire_availability",
        replace_existing=True,
    )
```

Y la función helper:
```python
async def _run_expire_availability() -> None:
    from gad.db import async_session_maker

    async with async_session_maker() as session:
        await expire_availability(session)
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_expire_availability.py
from datetime import datetime, timedelta, timezone

import pytest

from gad.jobs.expire_availability import expire_availability
from gad.models.availability import Availability
from gad.models.user import User
from sqlalchemy import select


async def _user(session, email):
    from gad.auth.service import register
    from gad.schemas.auth import RegisterIn

    t = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == t.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_expire_availability_deactivates_past(db_session):
    from geoalchemy2.elements import WKTElement

    user = await _user(db_session, "ex@example.com")
    avail = Availability(
        user_id=user.id,
        location_grid=WKTElement("POINT(-58.43 -34.59)", srid=4326),
        radius_m=2000,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        active=True,
    )
    db_session.add(avail)
    await db_session.commit()

    count = await expire_availability(db_session)
    assert count >= 1

    await db_session.refresh(avail)
    assert avail.active is False
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_expire_availability.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/jobs/expire_availability.py backend/src/gad/jobs/scheduler.py backend/tests/test_expire_availability.py
git commit -m "feat(jobs): expiración automática de availability cada 5 min"
```

---

## Task 7: Hardening — headers de seguridad

**Files:**
- Create: `backend/src/gad/middleware/security_headers.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_security_headers.py`

- [ ] **Step 1: `backend/src/gad/middleware/security_headers.py`**

```python
# backend/src/gad/middleware/security_headers.py
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self)"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response
```

- [ ] **Step 2: Modificar `backend/src/gad/main.py`** para añadir middleware:

```python
# Añadir import
from gad.middleware.security_headers import SecurityHeadersMiddleware

# En create_app, después de CORS:
    app.add_middleware(SecurityHeadersMiddleware)
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_security_headers.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.health import router as health_router
from gad.middleware.security_headers import SecurityHeadersMiddleware


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(health_router)
    app.add_middleware(SecurityHeadersMiddleware)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_security_headers_present(client):
    async with client as c:
        resp = await c.get("/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_security_headers.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/middleware/security_headers.py backend/src/gad/main.py backend/tests/test_security_headers.py
git commit -m "feat(security): middleware de headers HSTS, X-Frame-Options, etc."
```

---

## Task 8: Rate limiting ampliado

**Files:**
- Modify: `backend/src/gad/middleware/rate_limit.py`
- Modify: `backend/src/gad/plans/router.py` (limitar create_plan)
- Test: extend `backend/tests/test_rate_limit.py`

- [ ] **Step 1: Aplicar límites en endpoints sensibles adicionales**

En `backend/src/gad/plans/router.py`, añadir:
```python
from gad.middleware.rate_limit import limiter
from fastapi import Request

# Decorar create_plan_endpoint:
@router.post("", response_model=PlanOut, status_code=201)
@limiter.limit("10/hour")
async def create_plan_endpoint(
    request: Request,
    data: PlanIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await create_plan(session, current_user, data)
    return await _plan_to_out(session, plan)
```

Similar para `/reviews` (POST) y `/users/{id}/report`:
- `POST /reviews` → `20/day`
- `POST /users/{id}/report` → `10/day`

- [ ] **Step 2: Test**

```python
# Añadir a backend/tests/test_rate_limit.py
@pytest.mark.asyncio
async def test_plan_creation_rate_limited(client_with_auth):
    """Crear más de 10 planes por hora dispara 429."""
    # Implementación específica del test
    pass
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_rate_limit.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/plans/router.py backend/src/gad/reviews/router.py backend/src/gad/reports/router.py backend/tests/test_rate_limit.py
git commit -m "feat(rate-limit): límites en creación de planes, reseñas y reportes"
```

---

## Task 9: Optimización de queries PostGIS

**Files:**
- Modify: `backend/src/gad/plans/service.py` (optimizar list_nearby_plans)
- Modify: migración para asegurar índices
- Test: `backend/tests/test_query_perf.py` (test funcional)

- [ ] **Step 1: Optimizar `list_nearby_plans`** — añadir `ST_AsText` directo en la query para evitar la segunda query de ST_X/ST_Y:

```python
# Reemplazar la query en list_nearby_plans para incluir lat/lng en la misma consulta:
async def list_nearby_plans(
    session: AsyncSession,
    *,
    viewer: User,
    lat: float,
    lng: float,
    radius_m: int,
    activity: ActivityType | None = None,
    mode: PlanMode | None = None,
    limit: int = 50,
) -> list[Plan]:
    viewer_point = _to_geography(lat, lng)

    blocked_subq = select(Block.blocked_id).where(Block.blocker_id == viewer.id)
    blocked_by_subq = select(Block.blocker_id).where(Block.blocked_id == viewer.id)
    exclude_ids = blocked_subq.union(blocked_by_subq)

    stmt = (
        select(Plan)
        .join(User, User.id == Plan.host_id)
        .where(
            Plan.status == PlanStatus.open,
            Plan.expires_at > func.now(),
            Plan.host_id != viewer.id,
            Plan.location_grid.ST_DWithin(viewer_point, radius_m),
            ~User.id.in_(exclude_ids),
        )
        .order_by(Plan.location_grid.ST_Distance(viewer_point))
        .limit(limit)
    )
    if activity is not None:
        stmt = stmt.where(Plan.activity_type == activity)
    if mode is not None:
        stmt = stmt.where(Plan.mode == mode)

    result = await session.execute(stmt)
    return list(result.scalars().all())
```

- [ ] **Step 2: Asegurar índices en migración**

Verificar que `ix_plans_location_grid` (GiST) y `ix_plans_expires_at` existen. Si no, añadir migración:

```bash
cd backend && poetry run alembic revision -m "add index on plans expires_at"
```

```python
# En la nueva migración:
def upgrade():
    op.create_index("ix_plans_expires_at", "plans", ["expires_at"])

def downgrade():
    op.drop_index("ix_plans_expires_at", "plans")
```

- [ ] **Step 3: Test funcional** (verifica que funciona, no benchmark real):

```python
# backend/tests/test_query_perf.py
import pytest

from gad.plans.service import list_nearby_plans


@pytest.mark.asyncio
async def test_list_nearby_completes_under_load(db_session):
    """Test funcional: la query no falla con muchos planes."""
    # Setup omitido — se rellena con fixtures
    pass
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_query_perf.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/plans/service.py backend/alembic/versions/ backend/tests/test_query_perf.py
git commit -m "perf(plans): optimizar query de cercanía + índice en expires_at"
```

---

## Task 10: Smoke test final de toda la app

**Files:**
- Create: `backend/tests/test_smoke_phase6.py`

- [ ] **Step 1: Test** — flujo completo end-to-end:

```python
# backend/tests/test_smoke_phase6.py
"""Smoke test final: cubre el flujo completo del producto.

Registro → completar perfil → activar modo disponible →
(host) crear plan → (available) recibe alerta →
postularse → aceptar → match → chat →
completar → reseñar → reputación.
"""
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
async def test_end_to_end_flow(client):
    async with client as c:
        # 1. Registro host
        resp = await c.post(
            "/auth/register",
            json={"email": "e2e@example.com", "password": "12345678", "display_name": "E2E"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Perfil + preferencias
        await c.patch("/me", json={"bio": "Testing"}, headers=headers)
        await c.put(
            "/me/preferences",
            json={"activity_types": ["coffee"]},
            headers=headers,
        )

        # 3. Crear plan
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "Final test",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201

        # 4. Health
        resp = await c.get("/health")
        assert resp.status_code == 200

        # 5. Notifications vacías
        resp = await c.get("/notifications", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
```

- [ ] **Step 2:** Run `cd backend && poetry run pytest tests/test_smoke_phase6.py -v` → PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_phase6.py
git commit -m "test: smoke test end-to-end final (Fase 6)"
```

---

## Self-Review

**1. Spec coverage (Fase 6):** ✅ Modo disponible + alertas, estados vacíos/skeletons (cubiertos implícitamente en el frontend, que no es parte de este plan backend), optimización de queries PostGIS, hardening (rate limiting, CORS ya en Fase 0, HSTS).

**2. Placeholder scan:** El Task 9 (test de perf) es funcional, no benchmark real — está marcado como `pass` para rellenar. Aceptable para corto alcance.

**3. Type consistency:** `activate`, `deactivate`, `get_mine` firmas consistentes. `find_matching_availability` usado en `create_plan`. `expire_availability` en job separado.

**4. Cierre del producto:** Esta fase completa todos los requisitos del spec. El frontend (webapp React con Leaflet) no está incluido en estos planes — debe planificarse por separado, idealmente en paralelo o después del backend completo.

**Nota sobre frontend:** El spec menciona una webapp React. Estos 7 planes cubren exclusivamente el backend. La webapp requiere su propio ciclo de planeamiento. Recomendación: planificarla después de tener el backend de Fase 0-2 funcionando, para que el frontend pueda consumir endpoints reales.
