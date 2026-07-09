# Plan 3 — Paginación consistente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar paginación por cursor en los listados que hoy devuelven todo o solo 50 sin forma de pedir la siguiente página.

**Architecture:** Un schema genérico `PaginatedOut[T]` envuelve `{items, next_cursor}`. El cursor es el `created_at` ISO-8601 del último item (patrón ya probado en `chat/service.py:get_history` con `before`). Cada servicio que lista añade los params `limit` (con bound) y `before: datetime | None`.

**Tech Stack:** FastAPI, Pydantic v2 (genéricos), SQLAlchemy async, pytest.

---

## File Structure

- **Create:** `backend/src/gad/schemas/pagination.py` — `PaginatedOut[T]` genérico.
- **Modify:** `backend/src/gad/notifications/service.py`, `notifications/router.py`, `notifications/schemas.py`.
- **Modify:** `backend/src/gad/reviews/service.py`, `reviews/router.py`.
- **Modify:** `backend/src/gad/matching/service.py`, `matching/router.py`.
- **Modify:** `backend/src/gad/admin/service.py`, `admin/router.py`.
- **Create:** `backend/tests/test_pagination.py`

---

## Task 1: Schema genérico PaginatedOut

**Files:**
- Create: `backend/src/gad/schemas/pagination.py`
- Create: `backend/tests/test_pagination.py`

- [ ] **Step 1: Test que falla**

`backend/tests/test_pagination.py`:

```python
from datetime import datetime, timezone

from gad.schemas.pagination import PaginatedOut


class _Item:
    pass


def test_paginated_out_with_items_and_cursor():
    out = PaginatedOut[_Item](items=[], next_cursor=None)
    assert out.items == []
    assert out.next_cursor is None


def test_paginated_out_serializes_cursor_as_iso():
    ts = datetime(2026, 7, 8, 12, 0, tzinfo=timezone.utc)
    out = PaginatedOut[dict](items=[{"a": 1}], next_cursor=ts.isoformat())
    dumped = out.model_dump()
    assert dumped["next_cursor"] == ts.isoformat()
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_pagination.py -v`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

`backend/src/gad/schemas/pagination.py`:

```python
"""Schema genérico de respuesta paginada por cursor."""
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedOut(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
```

- [ ] **Step 4: Correr test**

Run: `cd backend && uv run pytest tests/test_pagination.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/schemas/pagination.py backend/tests/test_pagination.py
git commit -m "feat(schemas): PaginatedOut genérico para paginación por cursor"
```

---

## Task 2: Paginación en notifications

**Files:**
- Modify: `backend/src/gad/notifications/service.py`
- Modify: `backend/src/gad/notifications/router.py`

- [ ] **Step 1: Test que falla**

Añadir a `backend/tests/test_pagination.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.models.enums import NotificationType
from gad.notifications.router import router as notif_router
from gad.notifications.service import create_notification
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code})

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session
    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(notif_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_notifications_pagination_returns_cursor(client, db_session):
    tokens = await register(
        db_session, RegisterIn(email="n@example.com", password="12345678", display_name="N")
    )
    # Crear 3 notificaciones
    for _ in range(3):
        await create_notification(db_session, tokens.user_id, NotificationType.match, {})
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        # Pedir 2
        resp = await c.get("/notifications?limit=2", headers=headers)
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None
        # Pedir la siguiente página
        resp2 = await c.get(
            f"/notifications?limit=2&before={body['next_cursor']}", headers=headers
        )
        body2 = resp2.json()
        assert len(body2["items"]) == 1
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_pagination.py::test_notifications_pagination_returns_cursor -v`
Expected: FAIL (formato actual devuelve lista, no `{items, next_cursor}`)

- [ ] **Step 3: Modificar service**

En `backend/src/gad/notifications/service.py`, modificar `list_notifications`:

```python
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
```

Añadir import `from datetime import datetime` si no está (ya está como `UTC, datetime`).

- [ ] **Step 4: Modificar router**

En `backend/src/gad/notifications/router.py`, reescribir el endpoint de listado:

```python
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.notifications.schemas import NotificationOut
from gad.notifications.service import list_notifications, mark_read, unread_count
from gad.schemas.pagination import PaginatedOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedOut[NotificationOut])
async def list_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[NotificationOut]:
    notifs = await list_notifications(
        session, current_user.id, unread_only=unread_only, limit=limit, before=before
    )
    items = [NotificationOut.model_validate(n) for n in notifs]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[NotificationOut](items=items, next_cursor=next_cursor)
```

(el resto del router queda igual: `unread_count_endpoint`, `mark_read_endpoint`.)

- [ ] **Step 5: Correr test**

Run: `cd backend && uv run pytest tests/test_pagination.py::test_notifications_pagination_returns_cursor -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/notifications/service.py backend/src/gad/notifications/router.py backend/tests/test_pagination.py
git commit -m "feat(notifications): paginación por cursor"
```

---

## Task 3: Paginación en reviews

**Files:**
- Modify: `backend/src/gad/reviews/service.py`
- Modify: `backend/src/gad/reviews/router.py`

- [ ] **Step 1: Test que falla**

Añadir a `backend/tests/test_pagination.py`:

```python
@pytest.mark.asyncio
async def test_reviews_pagination_returns_cursor(client, db_session):
    from gad.reviews.service import list_reviews_for_user
    # Smoke mínimo: el endpoint responde con formato paginado
    tokens = await register(
        db_session, RegisterIn(email="r@example.com", password="12345678", display_name="R")
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.get(f"/reviews?user_id={tokens.user_id}&limit=10", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "next_cursor" in body
```

(Añadir import de `reviews.router` al fixture `app` de test_pagination.py y registrar `reviews_router`.)

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_pagination.py::test_reviews_pagination_returns_cursor -v`
Expected: FAIL

- [ ] **Step 3: Modificar service**

En `backend/src/gad/reviews/service.py`, modificar `list_reviews_for_user`:

```python
async def list_reviews_for_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Review]:
    stmt = (
        select(Review)
        .where(Review.reviewee_id == user_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Review.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())
```

Añadir import `from datetime import datetime` ( Review usa TimestampMixin con created_at).

- [ ] **Step 4: Modificar router**

En `backend/src/gad/reviews/router.py`, cambiar la firma y response del endpoint de listado:

```python
from datetime import datetime

from gad.schemas.pagination import PaginatedOut

@router.get("/reviews", response_model=PaginatedOut[ReviewWithReviewer])
async def list_reviews_endpoint(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[ReviewWithReviewer]:
    reviews = await list_reviews_for_user(session, user_id, limit=limit, before=before)
    out = []
    for r in reviews:
        reviewer = (
            await session.execute(select(User).where(User.id == r.reviewer_id))
        ).scalar_one()
        out.append(
            ReviewWithReviewer(
                id=r.id, match_id=r.match_id, reviewer_id=r.reviewer_id,
                reviewee_id=r.reviewee_id, rating=r.rating, comment=r.comment,
                flag=r.flag, created_at=r.created_at,
                reviewer=ReviewerSummary(
                    id=reviewer.id, display_name=reviewer.display_name,
                    avatar_url=reviewer.avatar_url,
                    reputation_score=reviewer.reputation_score,
                    verification_level=reviewer.verification_level.value,
                ),
            )
        )
    next_cursor = out[-1].created_at.isoformat() if len(out) == limit and out else None
    return PaginatedOut[ReviewWithReviewer](items=out, next_cursor=next_cursor)
```

Añadir imports: `from fastapi import Query`, `PaginatedOut`.

- [ ] **Step 5: Correr test**

Run: `cd backend && uv run pytest tests/test_pagination.py::test_reviews_pagination_returns_cursor tests/test_smoke_phase5.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/reviews/service.py backend/src/gad/reviews/router.py backend/tests/test_pagination.py
git commit -m "feat(reviews): paginación por cursor"
```

---

## Task 4: Paginación en matches y applications

**Files:**
- Modify: `backend/src/gad/matching/service.py`
- Modify: `backend/src/gad/matching/router.py`

- [ ] **Step 1: Modificar services**

En `backend/src/gad/matching/service.py`, añadir params `limit` y `before` a las dos funciones de listado:

```python
async def list_my_applications(
    session: AsyncSession, user: User, *, limit: int = 50, before=None
) -> list[PlanApplication]:
    stmt = (
        select(PlanApplication)
        .where(PlanApplication.applicant_id == user.id)
        .order_by(PlanApplication.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(PlanApplication.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_my_matches(
    session: AsyncSession, user: User, *, limit: int = 50, before=None
) -> list[Match]:
    stmt = (
        select(Match)
        .join(MatchParticipant, MatchParticipant.match_id == Match.id)
        .where(MatchParticipant.user_id == user.id)
        .order_by(Match.started_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Match.started_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())
```

- [ ] **Step 2: Modificar router**

En `backend/src/gad/matching/router.py`, actualizar los endpoints `/me/applications` y `/matches`:

```python
from datetime import datetime
from gad.schemas.pagination import PaginatedOut

@router.get("/me/applications", response_model=PaginatedOut[ApplicationOut])
async def my_applications_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[ApplicationOut]:
    apps = await list_my_applications(session, current_user, limit=limit, before=before)
    items = [await _app_to_out(session, a) for a in apps]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[ApplicationOut](items=items, next_cursor=next_cursor)


@router.get("/matches", response_model=PaginatedOut[MatchOut])
async def my_matches_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[MatchOut]:
    matches = await list_my_matches(session, current_user, limit=limit, before=before)
    items = [await _match_to_out(session, m, current_user) for m in matches]
    next_cursor = items[-1].started_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[MatchOut](items=items, next_cursor=next_cursor)
```

Añadir imports `Query`, `datetime`, `PaginatedOut`.

- [ ] **Step 3: Smoke de matching**

Run: `cd backend && uv run pytest tests/test_smoke_phase2.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/matching/service.py backend/src/gad/matching/router.py
git commit -m "feat(matching): paginación por cursor en matches y applications"
```

---

## Task 5: Paginación en admin reports

**Files:**
- Modify: `backend/src/gad/admin/service.py`
- Modify: `backend/src/gad/admin/router.py`

- [ ] **Step 1: Modificar service**

En `backend/src/gad/admin/service.py`, añadir params a `list_reports_admin`:

```python
from datetime import datetime

async def list_reports_admin(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Report]:
    stmt = select(Report).order_by(Report.created_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(Report.status == status)
    if before is not None:
        stmt = stmt.where(Report.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())
```

- [ ] **Step 2: Modificar router**

En `backend/src/gad/admin/router.py`, actualizar el endpoint:

```python
from datetime import datetime
from fastapi import Query
from gad.schemas.pagination import PaginatedOut

@router.get("/reports", response_model=PaginatedOut[ReportOut])
async def list_reports_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[ReportOut]:
    reports = await list_reports_admin(session, status=status, limit=limit, before=before)
    items = [
        ReportOut(
            id=r.id, reporter_id=r.reporter_id, reported_id=r.reported_id,
            reason=r.reason, description=r.description, status=r.status,
            payload=r.payload, created_at=r.created_at,
        )
        for r in reports
    ]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[ReportOut](items=items, next_cursor=next_cursor)
```

- [ ] **Step 3: Smoke de admin**

Run: `cd backend && uv run pytest tests/test_admin.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/admin/service.py backend/src/gad/admin/router.py
git commit -m "feat(admin): paginación por cursor en listado de reports"
```

---

## Self-Review (Plan 3)

**Cobertura:**
- ✅ Schema genérico → Task 1
- ✅ Notifications → Task 2
- ✅ Reviews → Task 3
- ✅ Matches + applications → Task 4
- ✅ Admin reports → Task 5

**Placeholder scan:** sin placeholders; el patrón del cursor está en cada task.

**Type consistency:** `PaginatedOut[T]` se usa con cada tipo de output (`NotificationOut`, `ReviewWithReviewer`, `ApplicationOut`, `MatchOut`, `ReportOut`). El helper `next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None` es consistente.
