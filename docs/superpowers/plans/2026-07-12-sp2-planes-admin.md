# SP2 — Planes admin (Plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestión admin de propuestas/planes: listado con filtros compuestos, detalle admin (con datos del host sin anonimizar y ubicación del grid), acciones admin (ocultar/mostrar, cerrar, cancelar), y visor de aplicaciones/matches con cancelación de match.

**Architecture:** Endpoints nuevos bajo `/admin/plans/*` y `/admin/matches/{id}/cancel`. Service en `admin/plans_service.py` sobre modelos existentes. Schemas nuevos reutilizando `HostSummary`/`ApplicationOut`/`MatchOut`. El detalle admin expone la ubicación del **grid** (única persistida; `exact_location` siempre es `None` hoy — ver Nota técnica). Frontend: nuevas páginas `PlansAdminPage` + `PlanDetailAdminPage`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async + GeoAlchemy2 (PostGIS), Pydantic v2, pytest + testcontainers; React 19 + React Query + Tailwind + Leaflet.

**Spec de referencia:** `docs/superpowers/specs/2026-07-12-admin-panel-expansion-design.md` (Sub-proyecto 2).

**Dependencia:** SP0 completo (`record_audit`). SP1 recomendado (patrones admin consolidados) pero no bloqueante.

---

## Nota técnica importante: `exact_location`

`Plan.exact_location` se setea siempre a `None` en `create_plan` (`plans/service.py:47`) y **nunca se persiste** la ubicación exacta del input — solo `location_grid` (anonimizada a ~150m vía `snap_to_grid`). Por lo tanto, el detalle admin expone el **centro del grid** (lat/lng de `location_grid`), no una "ubicación exacta" inexistente. Si en el futuro se quiere guardar la exacta para moderación, haría falta modificar `create_plan` para persistirla en `exact_location` (el campo ya existe en el modelo). **Esto queda fuera del alcance de SP2** y se documenta como decisión.

---

## File Structure

**Crear (backend):**
- `backend/src/gad/admin/plans_service.py` — listado con filtros, detalle, acciones (hide/unhide/close).
- `backend/src/gad/admin/plans_schemas.py` — `AdminPlanListItem`, `AdminPlanOut`, `AdminPlanDetailOut`.
- `backend/src/gad/admin/plans_router.py` — endpoints `/admin/plans/*` y `/admin/matches/{id}/cancel`.
- `backend/tests/test_admin_plans_service.py`, `backend/tests/test_admin_plans_router.py`.

**Modificar (backend):**
- `backend/src/gad/admin/router.py` — incluir `plans_router`.

**Crear (frontend):**
- `frontend/src/features/admin/pages/PlansAdminPage.tsx`
- `frontend/src/features/admin/pages/PlanDetailAdminPage.tsx`
- `frontend/src/features/admin/components/AdminPlanRow.tsx`

**Modificar (frontend):**
- `frontend/src/features/admin/hooks.ts` — hooks de planes admin + extender `adminKeys`.
- `frontend/src/features/admin/types.ts` — `AdminPlanListItem`, `AdminPlanDetailOut`.
- `frontend/src/features/admin/components/AdminNav.tsx` — añadir "Planes".
- `frontend/src/router.tsx` — rutas `/admin/plans` y `/admin/plans/:id`.

---

## Task 1: Schemas de planes admin

**Files:**
- Create: `backend/src/gad/admin/plans_schemas.py`
- Test: `backend/tests/test_admin_plans_schemas.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_plans_schemas.py`:

```python
from datetime import datetime
from uuid import uuid4

from gad.admin.plans_schemas import (
    AdminPlanListItem,
    AdminPlanOut,
)


def test_admin_plan_list_item_serializes():
    item = AdminPlanListItem(
        id=uuid4(),
        title="Café",
        activity_type="coffee",
        status="open",
        mode="now",
        host_id=uuid4(),
        host_name="Ana",
        current_participants=1,
        max_participants=3,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow(),
        hidden_by_host=False,
    )
    assert item.activity_type == "coffee"
    assert item.hidden_by_host is False


def test_admin_plan_out_has_location():
    out = AdminPlanOut(
        id=uuid4(),
        title="Café",
        activity_type="coffee",
        status="open",
        mode="now",
        scheduled_at=None,
        window_minutes=120,
        max_participants=3,
        current_participants=1,
        description=None,
        location_label="Centro",
        location_lat=-34.6,
        location_lng=-58.4,
        search_radius_m=2000,
        expires_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
        hidden_by_host=False,
        host_id=uuid4(),
        host_email="ana@x.com",
        host_name="Ana",
    )
    assert out.location_lat == -34.6
    assert out.host_email == "ana@x.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_plans_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the schemas**

`backend/src/gad/admin/plans_schemas.py`:

```python
# backend/src/gad/admin/plans_schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import ActivityType, PlanMode, PlanStatus


class AdminPlanListItem(BaseModel):
    """Ítem del listado admin (ligero)."""
    id: UUID
    title: str
    activity_type: ActivityType
    status: PlanStatus
    mode: PlanMode
    host_id: UUID
    host_name: str
    current_participants: int
    max_participants: int
    created_at: datetime
    expires_at: datetime
    hidden_by_host: bool


class AdminPlanOut(BaseModel):
    """Detalle admin de un plan: host sin anonimizar + ubicación del grid."""
    id: UUID
    title: str
    activity_type: ActivityType
    status: PlanStatus
    mode: PlanMode
    scheduled_at: datetime | None
    window_minutes: int
    max_participants: int
    current_participants: int
    description: str | None
    location_label: str
    location_lat: float
    location_lng: float
    search_radius_m: int
    expires_at: datetime
    created_at: datetime
    hidden_by_host: bool
    host_id: UUID
    host_email: str
    host_name: str
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_plans_schemas.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/plans_schemas.py backend/tests/test_admin_plans_schemas.py
git commit -m "feat(admin): schemas de planes admin (SP2-task1)"
```

---

## Task 2: Service de planes admin (listado + detalle + acciones)

**Files:**
- Create: `backend/src/gad/admin/plans_service.py`
- Test: `backend/tests/test_admin_plans_service.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_plans_service.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.plans_service import (
    admin_close_plan,
    admin_hide_plan,
    admin_unhide_plan,
    get_admin_plan,
    list_admin_plans,
)
from gad.exceptions import NotFoundError
from gad.models.enums import ActivityType, PlanMode, PlanStatus, UserStatus
from gad.models.plan import Plan
from gad.models.user import User
from gad.models.geo import snap_to_grid
from geoalchemy2.elements import WKTElement


async def _make_host(db_session, email="host@x.com") -> User:
    user = User(email=email, display_name=email.split("@")[0], status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _make_plan(db_session, host, *, title="Plan", activity="coffee", status=PlanStatus.open, hidden=False) -> Plan:
    g_lat, g_lng = snap_to_grid(-34.6, -58.4)
    plan = Plan(
        host_id=host.id,
        activity_type=ActivityType(activity),
        mode=PlanMode.now,
        title=title,
        location_label="Centro",
        location_grid=WKTElement(f"POINT({g_lng} {g_lat})", srid=4326),
        window_minutes=120,
        max_participants=3,
        expires_at=datetime.now(UTC) + timedelta(hours=2),
        status=status,
        hidden_by_host=hidden,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.mark.asyncio
async def test_list_admin_plans_filters_by_status(db_session):
    host = await _make_host(db_session)
    await _make_plan(db_session, host, title="A", status=PlanStatus.open)
    await _make_plan(db_session, host, title="B", status=PlanStatus.cancelled)
    result = await list_admin_plans(db_session, status="open")
    assert len(result) == 1
    assert result[0].title == "A"


@pytest.mark.asyncio
async def test_list_admin_plans_search_by_title(db_session):
    host = await _make_host(db_session)
    await _make_plan(db_session, host, title="Café matutino")
    await _make_plan(db_session, host, title="Paseo nocturno")
    result = await list_admin_plans(db_session, q="café")
    assert len(result) == 1
    assert result[0].title == "Café matutino"


@pytest.mark.asyncio
async def test_list_admin_plans_filter_by_activity(db_session):
    host = await _make_host(db_session)
    await _make_plan(db_session, host, activity="coffee")
    await _make_plan(db_session, host, activity="walk", title="Caminata")
    result = await list_admin_plans(db_session, activity="walk")
    assert len(result) == 1


@pytest.mark.asyncio
async def test_admin_hide_plan(db_session):
    host = await _make_host(db_session)
    plan = await _make_plan(db_session, host, hidden=False)
    updated = await admin_hide_plan(db_session, plan.id)
    assert updated.hidden_by_host is True


@pytest.mark.asyncio
async def test_admin_unhide_plan(db_session):
    host = await _make_host(db_session)
    plan = await _make_plan(db_session, host, hidden=True)
    updated = await admin_unhide_plan(db_session, plan.id)
    assert updated.hidden_by_host is False


@pytest.mark.asyncio
async def test_admin_close_plan(db_session):
    host = await _make_host(db_session)
    plan = await _make_plan(db_session, host, status=PlanStatus.matched)
    updated = await admin_close_plan(db_session, plan.id)
    assert updated.status == PlanStatus.closed


@pytest.mark.asyncio
async def test_get_admin_plan_404(db_session):
    import uuid
    with pytest.raises(NotFoundError):
        await get_admin_plan(db_session, uuid.uuid4())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_plans_service.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the service**

`backend/src/gad/admin/plans_service.py`:

```python
# backend/src/gad/admin/plans_service.py
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gad.exceptions import NotFoundError
from gad.models.enums import PlanStatus
from gad.models.plan import Plan
from gad.models.user import User


async def list_admin_plans(
    session: AsyncSession,
    *,
    status: str | None = None,
    activity: str | None = None,
    host_id: UUID | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Plan]:
    stmt = (
        select(Plan)
        .options(selectinload(Plan.host))
        .order_by(Plan.created_at.desc())
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(Plan.status == PlanStatus(status))
    if activity is not None:
        stmt = stmt.where(Plan.activity_type == activity)
    if host_id is not None:
        stmt = stmt.where(Plan.host_id == host_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            (Plan.title.ilike(pattern))
            | (Plan.description.ilike(pattern))
            | (Plan.location_label.ilike(pattern))
        )
    if date_from is not None:
        stmt = stmt.where(Plan.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Plan.created_at <= date_to)
    if before is not None:
        stmt = stmt.where(Plan.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_admin_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    result = await session.execute(
        select(Plan).options(selectinload(Plan.host)).where(Plan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def admin_hide_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    plan = await get_admin_plan(session, plan_id)
    plan.hidden_by_host = True
    await session.commit()
    await session.refresh(plan)
    return plan


async def admin_unhide_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    plan = await get_admin_plan(session, plan_id)
    plan.hidden_by_host = False
    await session.commit()
    await session.refresh(plan)
    return plan


async def admin_close_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    plan = await get_admin_plan(session, plan_id)
    plan.status = PlanStatus.closed
    await session.commit()
    await session.refresh(plan)
    return plan
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_plans_service.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/plans_service.py backend/tests/test_admin_plans_service.py
git commit -m "feat(admin): service de planes admin (listado, detalle, acciones) (SP2-task2)"
```

---

## Task 3: Router de planes admin (con extracción de coords del grid)

**Files:**
- Create: `backend/src/gad/admin/plans_router.py`
- Modify: `backend/src/gad/admin/router.py`
- Test: `backend/tests/test_admin_plans_router.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_plans_router.py`:

```python
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session
    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(admin_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _make_admin(db_session, user_id):
    from sqlalchemy import update
    from gad.models.user import User
    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _seed_plan(db_session):
    from datetime import UTC, datetime, timedelta
    from gad.models.enums import ActivityType, PlanMode, PlanStatus, UserStatus
    from gad.models.geo import snap_to_grid
    from gad.models.plan import Plan
    from gad.models.user import User
    from geoalchemy2.elements import WKTElement

    host = User(email="host@x.com", display_name="Host", status=UserStatus.active)
    db_session.add(host)
    await db_session.commit()
    await db_session.refresh(host)
    g_lat, g_lng = snap_to_grid(-34.6, -58.4)
    plan = Plan(
        host_id=host.id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Mi café",
        location_label="Centro",
        location_grid=WKTElement(f"POINT({g_lng} {g_lat})", srid=4326),
        window_minutes=120,
        max_participants=3,
        expires_at=datetime.now(UTC) + timedelta(hours=2),
        status=PlanStatus.open,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.mark.asyncio
async def test_admin_list_plans(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/plans", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Mi café"
    assert items[0]["host_email"] == "host@x.com"


@pytest.mark.asyncio
async def test_admin_plan_detail_returns_grid_coords(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/plans/{plan.id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "location_lat" in body
    assert isinstance(body["location_lat"], float)
    assert body["host_email"] == "host@x.com"


@pytest.mark.asyncio
async def test_admin_hide_plan(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/plans/{plan.id}/hide", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["hidden_by_host"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_plans_router.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Write the router**

`backend/src/gad/admin/plans_router.py`:

```python
# backend/src/gad/admin/plans_router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.plans_schemas import AdminPlanListItem, AdminPlanOut
from gad.admin.plans_service import (
    admin_close_plan,
    admin_hide_plan,
    admin_unhide_plan,
    get_admin_plan,
    list_admin_plans,
)
from gad.admin.settings_service import record_audit
from gad.db import get_session
from gad.exceptions import NotFoundError
from gad.models.plan import Plan as PlanModel
from gad.models.user import User
from gad.schemas.pagination import PaginatedOut

router = APIRouter(prefix="/admin", tags=["admin-plans"])


async def _grid_coords(session: AsyncSession, plan_id: UUID) -> tuple[float, float]:
    loc_col = cast(PlanModel.location_grid, Geometry)
    result = await session.execute(
        select(func.ST_Y(loc_col).label("lat"), func.ST_X(loc_col).label("lng")).where(
            PlanModel.id == plan_id
        )
    )
    lat, lng = result.one()
    return float(lat), float(lng)


def _plan_to_list_item(plan, *, lat: float, lng: float) -> AdminPlanListItem:
    return AdminPlanListItem(
        id=plan.id,
        title=plan.title,
        activity_type=plan.activity_type,
        status=plan.status,
        mode=plan.mode,
        host_id=plan.host_id,
        host_name=plan.host.display_name,
        current_participants=plan.current_participants,
        max_participants=plan.max_participants,
        created_at=plan.created_at,
        expires_at=plan.expires_at,
        hidden_by_host=plan.hidden_by_host,
    )


async def _plan_to_detail(session: AsyncSession, plan) -> AdminPlanOut:
    lat, lng = await _grid_coords(session, plan.id)
    return AdminPlanOut(
        id=plan.id,
        title=plan.title,
        activity_type=plan.activity_type,
        status=plan.status,
        mode=plan.mode,
        scheduled_at=plan.scheduled_at,
        window_minutes=plan.window_minutes,
        max_participants=plan.max_participants,
        current_participants=plan.current_participants,
        description=plan.description,
        location_label=plan.location_label,
        location_lat=lat,
        location_lng=lng,
        search_radius_m=plan.search_radius_m,
        expires_at=plan.expires_at,
        created_at=plan.created_at,
        hidden_by_host=plan.hidden_by_host,
        host_id=plan.host_id,
        host_email=plan.host.email,
        host_name=plan.host.display_name,
    )


@router.get("/plans", response_model=PaginatedOut[AdminPlanListItem])
async def admin_list_plans_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    activity: str | None = None,
    host_id: UUID | None = None,
    q: str | None = None,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AdminPlanListItem]:
    plans = await list_admin_plans(
        session,
        status=status, activity=activity, host_id=host_id, q=q,
        date_from=date_from, date_to=date_to, limit=limit, before=before,
    )
    items = [_plan_to_list_item(p, lat=0, lng=0) for p in plans]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[AdminPlanListItem](items=items, next_cursor=next_cursor)


@router.get("/plans/{plan_id}", response_model=AdminPlanOut)
async def admin_get_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await get_admin_plan(session, plan_id)
    return await _plan_to_detail(session, plan)


@router.post("/plans/{plan_id}/hide", response_model=AdminPlanOut)
async def admin_hide_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await admin_hide_plan(session, plan_id)
    await record_audit(
        session, actor_id=admin.id, action="plan.hide",
        target_type="plan", target_id=str(plan_id), detail={},
    )
    return await _plan_to_detail(session, plan)


@router.post("/plans/{plan_id}/unhide", response_model=AdminPlanOut)
async def admin_unhide_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await admin_unhide_plan(session, plan_id)
    await record_audit(
        session, actor_id=admin.id, action="plan.unhide",
        target_type="plan", target_id=str(plan_id), detail={},
    )
    return await _plan_to_detail(session, plan)


@router.post("/plans/{plan_id}/close", response_model=AdminPlanOut)
async def admin_close_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminPlanOut:
    plan = await admin_close_plan(session, plan_id)
    await record_audit(
        session, actor_id=admin.id, action="plan.close",
        target_type="plan", target_id=str(plan_id), detail={},
    )
    return await _plan_to_detail(session, plan)


@router.post("/matches/{match_id}/cancel")
async def admin_cancel_match_endpoint(
    match_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.models.enums import MatchStatus
    from gad.models.match import Match

    result = await session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise NotFoundError("Match no encontrado")
    match.status = MatchStatus.cancelled
    await session.commit()
    await record_audit(
        session, actor_id=admin.id, action="match.cancel",
        target_type="match", target_id=str(match_id), detail={},
    )
    return {"message": "Match cancelado por moderación"}
```

- [ ] **Step 4: Register plans_router in admin/router.py and main.py**

Edit `backend/src/gad/admin/router.py` — add import at top:

```python
from gad.admin.plans_router import router as plans_admin_router
```

At the end of the file:

```python
router.include_router(plans_admin_router)
```

This nests under the `/admin` prefix (the sub-router uses `prefix="/admin"` which concatenates; since the parent is also `/admin`, the result is `/admin/plans`). Verify there's no double-prefix collision by checking FastAPI's behavior: nested routers concatenate prefixes, so `/admin` + `/admin/plans` would yield `/admin/admin/plans`. **To avoid that**, register `plans_router` on the **app** in `main.py` instead (same as `settings_router` in SP0).

**Correction:** Do NOT add `router.include_router(plans_admin_router)` in `admin/router.py`. Instead, register in `main.py`:

Edit `backend/src/gad/main.py` — add import:

```python
from gad.admin.plans_router import router as plans_admin_router
```

After `app.include_router(settings_router)`:

```python
app.include_router(plans_admin_router)
```

Remove the `router.include_router` line from `admin/router.py` if it was added.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_plans_router.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/admin/plans_router.py backend/src/gad/admin/router.py backend/src/gad/main.py backend/tests/test_admin_plans_router.py
git commit -m "feat(admin): endpoints de planes admin con coords del grid (SP2-task3)"
```

---

## Task 4: Endpoints de aplicaciones y matches de un plan

**Files:**
- Modify: `backend/src/gad/admin/plans_router.py`
- Test: `backend/tests/test_admin_plan_relations.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_plan_relations.py`:

```python
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session
    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(admin_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _make_admin(db_session, user_id):
    from sqlalchemy import update
    from gad.models.user import User
    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _seed_plan_with_app(db_session):
    from datetime import UTC, datetime, timedelta
    from gad.models.enums import ActivityType, ApplicationStatus, PlanMode, PlanStatus, UserStatus
    from gad.models.geo import snap_to_grid
    from gad.models.plan import Plan, PlanApplication
    from gad.models.user import User
    from geoalchemy2.elements import WKTElement

    host = User(email="host@x.com", display_name="Host", status=UserStatus.active)
    applicant = User(email="app@x.com", display_name="App", status=UserStatus.active)
    db_session.add_all([host, applicant])
    await db_session.commit()
    await db_session.refresh(host)
    await db_session.refresh(applicant)

    g_lat, g_lng = snap_to_grid(-34.6, -58.4)
    plan = Plan(
        host_id=host.id, activity_type=ActivityType.coffee, mode=PlanMode.now,
        title="Plan", location_label="Centro",
        location_grid=WKTElement(f"POINT({g_lng} {g_lat})", srid=4326),
        window_minutes=120, max_participants=3,
        expires_at=datetime.now(UTC) + timedelta(hours=2),
        status=PlanStatus.open,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    app = PlanApplication(
        plan_id=plan.id, applicant_id=applicant.id,
        status=ApplicationStatus.pending, message="Hola",
    )
    db_session.add(app)
    await db_session.commit()
    return plan


@pytest.mark.asyncio
async def test_admin_plan_applications(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan_with_app(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/plans/{plan.id}/applications", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_admin_plan_matches_empty(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan_with_app(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/plans/{plan.id}/matches", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_plan_relations.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Add endpoints to plans_router.py**

Edit `backend/src/gad/admin/plans_router.py` — add at the end:

```python
from gad.matching.schemas import ApplicationOut, ApplicantSummary, MatchOut, ParticipantOut


@router.get("/plans/{plan_id}/applications", response_model=list[ApplicationOut])
async def admin_plan_applications_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApplicationOut]:
    from gad.models.plan import PlanApplication

    result = await session.execute(
        select(PlanApplication)
        .where(PlanApplication.plan_id == plan_id)
        .order_by(PlanApplication.created_at.desc())
    )
    apps = result.scalars().all()
    # Cargar applicants en batch
    user_ids = {a.applicant_id for a in apps}
    users_map = {}
    if user_ids:
        users_result = await session.execute(select(User).where(User.id.in_(user_ids)))
        for u in users_result.scalars().all():
            users_map[u.id] = u
    out = []
    for a in apps:
        u = users_map.get(a.applicant_id)
        if u is None:
            continue
        out.append(
            ApplicationOut(
                id=a.id, plan_id=a.plan_id,
                applicant=ApplicantSummary(
                    id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
                    reputation_score=u.reputation_score,
                    verification_level=u.verification_level.value,
                ),
                status=a.status, message=a.message,
                created_at=a.created_at, decided_at=a.decided_at,
            )
        )
    return out


@router.get("/plans/{plan_id}/matches", response_model=list[MatchOut])
async def admin_plan_matches_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[MatchOut]:
    from gad.models.match import Match, MatchParticipant

    result = await session.execute(
        select(Match).where(Match.plan_id == plan_id).order_by(Match.started_at.desc())
    )
    matches = result.scalars().all()
    out = []
    for m in matches:
        parts_result = await session.execute(
            select(MatchParticipant, User)
            .join(User, MatchParticipant.user_id == User.id)
            .where(MatchParticipant.match_id == m.id)
        )
        participants = [
            ParticipantOut(
                user_id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
                role=p.role, joined_at=p.joined_at,
            )
            for p, u in parts_result.all()
        ]
        out.append(
            MatchOut(
                id=m.id, plan_id=m.plan_id, status=m.status,
                started_at=m.started_at, ended_at=m.ended_at,
                location_sharing_active=m.location_sharing_active,
                participants=participants,
            )
        )
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_plan_relations.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/plans_router.py backend/tests/test_admin_plan_relations.py
git commit -m "feat(admin): endpoints de aplicaciones y matches de plan (SP2-task4)"
```

---

## Task 5: Frontend — tipos y hooks de planes admin

**Files:**
- Modify: `frontend/src/features/admin/types.ts`
- Modify: `frontend/src/features/admin/hooks.ts`

- [ ] **Step 1: Add types**

Edit `frontend/src/features/admin/types.ts` — add:

```ts
export interface AdminPlanListItem {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  mode: string;
  host_id: string;
  host_name: string;
  current_participants: number;
  max_participants: number;
  created_at: string;
  expires_at: string;
  hidden_by_host: boolean;
}

export interface AdminPlanDetailOut {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  mode: string;
  scheduled_at: string | null;
  window_minutes: number;
  max_participants: number;
  current_participants: number;
  description: string | null;
  location_label: string;
  location_lat: number;
  location_lng: number;
  search_radius_m: number;
  expires_at: string;
  created_at: string;
  hidden_by_host: boolean;
  host_id: string;
  host_email: string;
  host_name: string;
}
```

- [ ] **Step 2: Add hooks**

Edit `frontend/src/features/admin/hooks.ts` — extend `adminKeys`:

```ts
  plans: (status?: string, q?: string) => ['admin', 'plans', { status, q }] as const,
  planDetail: (id: string) => ['admin', 'plans', id] as const,
  planApplications: (id: string) => ['admin', 'plans', id, 'applications'] as const,
  planMatches: (id: string) => ['admin', 'plans', id, 'matches'] as const,
```

Add hooks:

```ts
export function useAdminPlans(status?: string, q?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.plans(status, q),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminPlanListItem>>('/admin/plans', {
        query: { status, q, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useAdminPlanDetail(planId: string) {
  return useQuery({
    queryKey: adminKeys.planDetail(planId),
    queryFn: () => apiGet<AdminPlanDetailOut>(`/admin/plans/${planId}`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useAdminPlanApplications(planId: string) {
  return useQuery({
    queryKey: adminKeys.planApplications(planId),
    queryFn: () => apiGet<unknown[]>(`/admin/plans/${planId}/applications`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useAdminPlanMatches(planId: string) {
  return useQuery({
    queryKey: adminKeys.planMatches(planId),
    queryFn: () => apiGet<unknown[]>(`/admin/plans/${planId}/matches`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useAdminHidePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost<AdminPlanDetailOut>(`/admin/plans/${planId}/hide`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    ...userActionToast('Plan oculto.', 'No se pudo ocultar el plan.'),
  });
}

export function useAdminUnhidePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost<AdminPlanDetailOut>(`/admin/plans/${planId}/unhide`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    ...userActionToast('Plan visible.', 'No se pudo mostrar el plan.'),
  });
}

export function useAdminClosePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost<AdminPlanDetailOut>(`/admin/plans/${planId}/close`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    ...userActionToast('Plan cerrado.', 'No se pudo cerrar el plan.'),
  });
}

export function useAdminCancelMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => apiPost<OKMessage>(`/admin/matches/${matchId}/cancel`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    ...userActionToast('Match cancelado.', 'No se pudo cancelar el match.'),
  });
}
```

Add necessary type imports at the top.

- [ ] **Step 3: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/types.ts frontend/src/features/admin/hooks.ts
git commit -m "feat(admin-fe): hooks y tipos de planes admin (SP2-task5)"
```

---

## Task 6: Frontend — PlansAdminPage y AdminPlanRow

**Files:**
- Create: `frontend/src/features/admin/components/AdminPlanRow.tsx`
- Create: `frontend/src/features/admin/pages/PlansAdminPage.tsx`
- Modify: `frontend/src/features/admin/components/AdminNav.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Create AdminPlanRow**

`frontend/src/features/admin/components/AdminPlanRow.tsx` — following the `<li class="glass-panel">` pattern. Props: `plan: AdminPlanListItem`, `onHide`, `onUnhide`, `onClose`, `busy`. Show title, host, activity badge, status badge, participants, hidden indicator. Action buttons conditional on status.

- [ ] **Step 2: Create PlansAdminPage**

`frontend/src/features/admin/pages/PlansAdminPage.tsx` — following the `UsersAdminPage` pattern: header sticky + `AdminNav`, FILTERS for status (`open`/`matched`/`closed`/`cancelled`/`expired`), search input, `useAdminPlans(status, debouncedQ)`, `<ul>` of `<AdminPlanRow>`, "Cargar más" button.

- [ ] **Step 3: Add nav entry**

Edit `frontend/src/features/admin/components/AdminNav.tsx` — add to ITEMS (after Reports or after Users):

```ts
{ to: '/admin/plans', label: 'Planes', icon: CalendarDays, end: false },
```

Import `CalendarDays` from `lucide-react`.

- [ ] **Step 4: Add routes**

Edit `frontend/src/router.tsx` — add lazy imports:

```tsx
const PlansAdminPage = lazy(() => import('./features/admin/pages/PlansAdminPage'));
const PlanDetailAdminPage = lazy(() => import('./features/admin/pages/PlanDetailAdminPage'));
```

Add inside `RequireAdminRoute` children:

```tsx
{ path: '/admin/plans', element: <PageSuspense><PlansAdminPage /></PageSuspense> },
{ path: '/admin/plans/:id', element: <PageSuspense><PlanDetailAdminPage /></PageSuspense> },
```

- [ ] **Step 5: Run type check and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/admin/`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/admin/components/AdminPlanRow.tsx frontend/src/features/admin/pages/PlansAdminPage.tsx frontend/src/features/admin/components/AdminNav.tsx frontend/src/router.tsx
git commit -m "feat(admin-fe): página de listado de planes admin (SP2-task6)"
```

---

## Task 7: Frontend — PlanDetailAdminPage (con mapa Leaflet)

**Files:**
- Create: `frontend/src/features/admin/pages/PlanDetailAdminPage.tsx`

- [ ] **Step 1: Create PlanDetailAdminPage**

`frontend/src/features/admin/pages/PlanDetailAdminPage.tsx` — follows the detail page pattern from `UserDetailAdminPage` (SP1). Shows plan data (cabecera), a Leaflet map centered on `location_lat`/`location_lng` (the grid centroid, labeled as "Ubicación (centro de grilla)"), and two sections: applications (`useAdminPlanApplications`) and matches (`useAdminPlanMatches`) with the cancel-match action (`useAdminCancelMatch`).

For the map, reuse the existing Leaflet setup from `features/plans` (the project already uses `react-leaflet`). Import `MapContainer`, `TileLayer`, `Marker` from `react-leaflet` and `L` icon fix if needed (check how `features/plans` does it).

Include action buttons: hide/unhide (depending on `hidden_by_host`), close, and link to "Ver host" (`/admin/users/${host_id}`).

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/pages/PlanDetailAdminPage.tsx
git commit -m "feat(admin-fe): página de detalle de plan con mapa y relaciones (SP2-task7)"
```

---

## Self-Review (post-plan)

**Spec coverage (Sub-proyecto 2):**
- ✅ Listado y filtros (status, activity, host, q, fechas) → Tasks 2-3.
- ✅ Detalle admin (sin anonimizar, coords del grid) → Tasks 2-3.
- ✅ Acciones (cancelar ya existe, ocultar/mostrar, cerrar) → Tasks 2-3.
- ✅ Aplicaciones y matches → Task 4.
- ✅ Cancelar match → Task 3 (`POST /admin/matches/{id}/cancel`).
- ✅ Frontend completo → Tasks 5-7.

**Nota técnica documentada:** `exact_location` siempre `None` → el admin expone el centro del grid. Decision registrada.

**Placeholder scan:** Los Tasks 6-7 del frontend son más escriptivos (siguen patrones documentados en el reporte de exploración) pero no contienen TODOs — describen la estructura exacta a seguir (header, FILTERS, `<ul>`, "Cargar más"). Las decisiones de layout específicas (qué íconos, qué campos mostrar) son derivadas de `UsersAdminPage` y los tipos definidos en Task 5.

**Type consistency:** `AdminPlanListItem` y `AdminPlanDetailOut` coinciden entre backend (Task 1) y frontend (Task 5). `_grid_coords` usa el mismo patrón que `venues admin` y `matching/router.py`. `record_audit` importado de SP0.

**Decisión de registro de sub-router:** Confirmar que `plans_router` se registra en `main.py` (no en `admin/router.py`) para evitar doble prefijo `/admin`. Esto se documenta en Task 3 Step 4.

---

## Notas de ejecución

- **Dependencia:** SP0 completo. SP1 recomendado (patrones).
- **Orden:** Tasks 1→4 backend, 5→7 frontend.
- **Leaflet:** verificar el fix del ícono default de Leaflet en `features/plans` antes de usar el mapa en el detalle admin.
