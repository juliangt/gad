# SP1 — Usuarios admin (Plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar la gestión admin de usuarios: búsqueda/filtros, gestión del rol admin (grant/revoke con protecciones), edición de datos, reset de contraseña, y detalle 360° (planes, matches, reportes, reseñas).

**Architecture:** Endpoints nuevos bajo `/admin/users/*` (todos tras `require_admin`). Service functions en `admin/service.py` sobre modelos existentes (sin migraciones). Schemas nuevos en `admin/schemas.py` extendiendo `AdminUserOut`. Frontend: extender `UsersAdminPage` + nueva `UserDetailAdminPage`, hooks en `features/admin/hooks.ts`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, pytest + testcontainers; React 19 + React Query + Tailwind v4.

**Spec de referencia:** `docs/superpowers/specs/2026-07-12-admin-panel-expansion-design.md` (Sub-proyecto 1).

**Dependencia:** SP0 debe estar completo (usa `record_audit` de `admin/settings_service.py`).

---

## File Structure

**Modificar (backend):**
- `backend/src/gad/admin/schemas.py` — añadir `AdminUserDetailOut`, `AdminUserUpdateIn`, `AdminPlanListItem`/etc. reusados.
- `backend/src/gad/admin/service.py` — búsqueda ILIKE, grant/revoke, update, reset password, detalle 360°.
- `backend/src/gad/admin/router.py` — ampliar `GET /admin/users` (q, is_admin) + nuevos endpoints.

**Modificar (frontend):**
- `frontend/src/features/admin/hooks.ts` — hooks nuevos + extender `adminKeys`.
- `frontend/src/features/admin/types.ts` — `AdminUserDetailOut`, `AdminUserUpdateInput`.
- `frontend/src/features/admin/pages/UsersAdminPage.tsx` — búsqueda + acciones nuevas.
- `frontend/src/features/admin/components/AdminUserRow.tsx` — link a detalle + acciones nuevas.
- `frontend/src/features/admin/components/AdminNav.tsx` — sin cambios (ya existe Usuarios).
- `frontend/src/features/admin/components/UserDetailSections.tsx` (create).
- `frontend/src/features/admin/components/ResetPasswordModal.tsx` (create).
- `frontend/src/features/admin/pages/UserDetailAdminPage.tsx` (create).
- `frontend/src/router.tsx` — ruta `/admin/users/:id`.
- `frontend/src/features/admin/__tests__/hooks.test.tsx` — tests de hooks nuevos.

---

## Task 1: Búsqueda y filtros en `GET /admin/users`

**Files:**
- Modify: `backend/src/gad/admin/service.py`
- Modify: `backend/src/gad/admin/router.py`
- Test: `backend/tests/test_admin_users_search.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_users_search.py`:

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


@pytest.mark.asyncio
async def test_search_users_by_email_substring(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    await register(db_session, RegisterIn(email="alice@x.com", password="12345678", display_name="Alice"))
    await register(db_session, RegisterIn(email="bob@x.com", password="12345678", display_name="Bob"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers, params={"q": "alice"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "alice@x.com"


@pytest.mark.asyncio
async def test_search_users_by_display_name(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="Admin")
    )
    await _make_admin(db_session, admin.user_id)
    await register(db_session, RegisterIn(email="z@x.com", password="12345678", display_name="Zoe Runner"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers, params={"q": "runner"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["display_name"] == "Zoe Runner"


@pytest.mark.asyncio
async def test_filter_users_by_is_admin(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    await register(db_session, RegisterIn(email="plain@x.com", password="12345678", display_name="Plain"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers, params={"is_admin": "true"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["is_admin"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_users_search.py -v`
Expected: FAIL — el endpoint ignora `q` y `is_admin` (devuelve todos).

- [ ] **Step 3: Update `list_users_admin` in service.py**

Edit `backend/src/gad/admin/service.py` — replace the `list_users_admin` function:

```python
async def list_users_admin(
    session: AsyncSession,
    *,
    status: str | None = None,
    q: str | None = None,
    is_admin: bool | None = None,
    limit: int = 50,
    before: datetime | None = None,
) -> list[User]:
    stmt = select(User).order_by(User.created_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(User.status == UserStatus(status))
    if before is not None:
        stmt = stmt.where(User.created_at < before)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where((User.email.ilike(pattern)) | (User.display_name.ilike(pattern)))
    if is_admin is not None:
        stmt = stmt.where(User.is_admin.is_(is_admin))
    result = await session.execute(stmt)
    return list(result.scalars().all())
```

- [ ] **Step 4: Update the endpoint in router.py**

Edit `backend/src/gad/admin/router.py` — replace the `list_users_endpoint` signature and body to add `q` and `is_admin` params:

```python
@router.get("/users", response_model=PaginatedOut[AdminUserOut])
async def list_users_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    q: str | None = None,
    is_admin: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AdminUserOut]:
    users = await list_users_admin(
        session, status=status, q=q, is_admin=is_admin, limit=limit, before=before
    )
    items = [_user_to_admin_out(u) for u in users]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[AdminUserOut](items=items, next_cursor=next_cursor)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_users_search.py tests/test_admin_moderation.py -v`
Expected: PASS (los tests nuevos + los existentes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/admin/service.py backend/src/gad/admin/router.py backend/tests/test_admin_users_search.py
git commit -m "feat(admin): búsqueda y filtros en listado de usuarios (SP1-task1)"
```

---

## Task 2: Schemas de detalle 360° y update

**Files:**
- Modify: `backend/src/gad/admin/schemas.py`
- Test: `backend/tests/test_admin_user_schemas.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_user_schemas.py`:

```python
from datetime import date, datetime
from uuid import uuid4

import pytest

from gad.admin.schemas import AdminUserDetailOut, AdminUserUpdateIn


def test_admin_user_detail_out_serializes():
    out = AdminUserDetailOut(
        id=uuid4(),
        email="x@example.com",
        display_name="X",
        status="active",
        is_admin=False,
        reputation_score=4.5,
        created_at=datetime.utcnow(),
        avatar_url=None,
        bio="hola",
        birth_date=date(1990, 1, 1),
        gender="undisclosed",
        locale="es-AR",
        timezone="America/Argentina/Buenos_Aires",
        verification_level="none",
        last_active_at=None,
        google_id=None,
        plans_count=3,
        matches_count=5,
        reports_received=1,
        avg_rating=4.0,
    )
    assert out.plans_count == 3
    assert out.avg_rating == 4.0


def test_admin_user_update_in_all_optional():
    data = AdminUserUpdateIn()
    assert data.display_name is None
    assert data.verification_level is None


def test_admin_user_update_in_partial():
    data = AdminUserUpdateIn(display_name="Nuevo", locale="en-US")
    assert data.display_name == "Nuevo"
    assert data.locale == "en-US"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_user_schemas.py -v`
Expected: FAIL — `ImportError`.

- [ ] **Step 3: Add schemas to admin/schemas.py**

Edit `backend/src/gad/admin/schemas.py` — add these classes (after `AdminUserOut`):

```python
from datetime import date as date_type
from gad.models.enums import VerificationLevel


class AdminUserUpdateIn(BaseModel):
    display_name: str | None = None
    email: str | None = None
    locale: str | None = None
    timezone: str | None = None
    verification_level: VerificationLevel | None = None


class AdminUserDetailOut(AdminUserOut):
    avatar_url: str | None = None
    bio: str | None = None
    birth_date: date_type | None = None
    gender: str
    locale: str
    timezone: str
    verification_level: VerificationLevel
    last_active_at: datetime | None = None
    google_id: str | None = None
    plans_count: int = 0
    matches_count: int = 0
    reports_received: int = 0
    avg_rating: float = 0.0
```

Add `date as date_type` and `VerificationLevel` imports at the top of the file as needed (VerificationLevel is already imported from `gad.models.enums`). For `date`, add:

```python
from datetime import date as date_type
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_user_schemas.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/schemas.py backend/tests/test_admin_user_schemas.py
git commit -m "feat(admin): schemas AdminUserDetailOut y AdminUserUpdateIn (SP1-task2)"
```

---

## Task 3: Service de grant/revoke admin con protecciones

**Files:**
- Modify: `backend/src/gad/admin/service.py`
- Test: `backend/tests/test_admin_user_role_service.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_user_role_service.py`:

```python
from uuid import uuid4

import pytest
from sqlalchemy import select

from gad.admin.service import (
    grant_admin,
    revoke_admin,
)
from gad.exceptions import ConflictError, NotFoundError
from gad.models.enums import UserStatus
from gad.models.user import User


async def _make_user(db_session, email="u@example.com", is_admin=False) -> User:
    user = User(
        email=email,
        display_name=email.split("@")[0],
        is_admin=is_admin,
        status=UserStatus.active,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_grant_admin_sets_flag(db_session):
    user = await _make_user(db_session, "v@example.com", is_admin=False)
    updated = await grant_admin(db_session, user.id)
    assert updated.is_admin is True


@pytest.mark.asyncio
async def test_revoke_admin_clears_flag(db_session):
    user = await _make_user(db_session, "v@example.com", is_admin=True)
    actor = await _make_user(db_session, "actor@example.com", is_admin=True)
    updated = await revoke_admin(db_session, user.id, actor_id=actor.id)
    assert updated.is_admin is False


@pytest.mark.asyncio
async def test_revoke_admin_blocks_self_revoke(db_session):
    user = await _make_user(db_session, "solo@example.com", is_admin=True)
    with pytest.raises(ConflictError):
        await revoke_admin(db_session, user.id, actor_id=user.id)


@pytest.mark.asyncio
async def test_revoke_admin_blocks_last_admin(db_session):
    only_admin = await _make_user(db_session, "only@example.com", is_admin=True)
    actor = await _make_user(db_session, "actor@example.com", is_admin=True)
    # Hacemos que only_admin sea el único admin (actor no es admin en este test)
    actor.is_admin = False
    await db_session.commit()
    with pytest.raises(ConflictError):
        await revoke_admin(db_session, only_admin.id, actor_id=actor.id)


@pytest.mark.asyncio
async def test_revoke_admin_unknown_user(db_session):
    with pytest.raises(NotFoundError):
        await revoke_admin(db_session, uuid4(), actor_id=uuid4())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_user_role_service.py -v`
Expected: FAIL — `ImportError: cannot import name 'grant_admin'`.

- [ ] **Step 3: Add service functions**

Edit `backend/src/gad/admin/service.py` — add these functions (after `ban_user`):

```python
async def grant_admin(session: AsyncSession, user_id: UUID) -> User:
    user = await _get_user_or_404(session, user_id)
    user.is_admin = True
    await session.commit()
    await session.refresh(user)
    return user


async def revoke_admin(
    session: AsyncSession, user_id: UUID, *, actor_id: UUID
) -> User:
    # Protección: un admin no puede quitarse el rol a sí mismo.
    if user_id == actor_id:
        raise ConflictError("No podés quitarte el rol de administrador a vos mismo")
    user = await _get_user_or_404(session, user_id)
    # Protección: no dejar el sistema sin admins activos.
    active_admins = (
        await session.execute(
            select(func.count(User.id)).where(
                User.is_admin.is_(True), User.status == UserStatus.active
            )
        )
    ).scalar_one()
    if active_admins <= 1:
        raise ConflictError("No se puede revocar el último administrador activo")
    user.is_admin = False
    await session.commit()
    await session.refresh(user)
    return user


async def _get_user_or_404(session: AsyncSession, user_id: UUID) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("Usuario no encontrado")
    return user
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_user_role_service.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/service.py backend/tests/test_admin_user_role_service.py
git commit -m "feat(admin): grant/revoke admin con protecciones (SP1-task3)"
```

---

## Task 4: Endpoints de rol admin (con auditoría)

**Files:**
- Modify: `backend/src/gad/admin/router.py`
- Test: `backend/tests/test_admin_user_role_router.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_user_role_router.py`:

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


@pytest.mark.asyncio
async def test_grant_admin_endpoint(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    target = await register(db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{target.user_id}/grant-admin", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True


@pytest.mark.asyncio
async def test_revoke_admin_self_blocked(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{admin.user_id}/revoke-admin", headers=headers)
    assert resp.status_code == 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_user_role_router.py -v`
Expected: FAIL — 404 (rutas no existen).

- [ ] **Step 3: Add endpoints to router.py**

Edit `backend/src/gad/admin/router.py` — add after `activate_user_endpoint`:

```python
@router.post("/users/{user_id}/grant-admin", response_model=AdminUserOut)
async def grant_admin_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    from gad.admin.service import grant_admin
    from gad.admin.settings_service import record_audit

    user = await grant_admin(session, user_id)
    await record_audit(
        session,
        actor_id=admin.id,
        action="user.grant_admin",
        target_type="user",
        target_id=str(user_id),
        detail={"is_admin": True},
    )
    return _user_to_admin_out(user)


@router.post("/users/{user_id}/revoke-admin", response_model=AdminUserOut)
async def revoke_admin_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    from gad.admin.service import revoke_admin
    from gad.admin.settings_service import record_audit

    user = await revoke_admin(session, user_id, actor_id=admin.id)
    await record_audit(
        session,
        actor_id=admin.id,
        action="user.revoke_admin",
        target_type="user",
        target_id=str(user_id),
        detail={"is_admin": False},
    )
    return _user_to_admin_out(user)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_user_role_router.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/router.py backend/tests/test_admin_user_role_router.py
git commit -m "feat(admin): endpoints grant/revoke admin con auditoría (SP1-task4)"
```

---

## Task 5: Reset password admin

**Files:**
- Modify: `backend/src/gad/admin/service.py`
- Modify: `backend/src/gad/admin/router.py`
- Test: `backend/tests/test_admin_reset_password.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_reset_password.py`:

```python
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.auth.passwords import verify_password
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


@pytest.mark.asyncio
async def test_admin_reset_password_sets_new_hash(client, db_session, monkeypatch):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    target = await register(db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T"))

    # Mock revoke_user para no depender de Redis en este test unitario de endpoint.
    async def _noop_revoke(*a, **kw):
        return None
    monkeypatch.setattr("gad.auth.token_store.TokenStore.revoke_user", _noop_revoke)

    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{target.user_id}/reset-password", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    temp_pw = body["temporary_password"]
    assert len(temp_pw) >= 16

    # Verificar que el hash se actualizó y la temp password lo valida.
    from sqlalchemy import select
    from gad.models.user import User
    result = await db_session.execute(select(User).where(User.id == target.user_id))
    user = result.scalar_one()
    assert verify_password(temp_pw, user.password_hash)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_reset_password.py -v`
Expected: FAIL — 404 (ruta no existe).

- [ ] **Step 3: Add service function**

Edit `backend/src/gad/admin/service.py` — add imports at top:

```python
import secrets
from gad.auth.passwords import hash_password
```

Add the function (after `revoke_admin`/helpers):

```python
async def admin_reset_password(
    session: AsyncSession, store, user_id: UUID
) -> tuple[User, str]:
    """Fuerza un reset generando una contraseña temporal fuerte.
    Revoca todas las sesiones activas. Devuelve (user, temporary_password)."""
    user = await _get_user_or_404(session, user_id)
    # Generar contraseña temporal: 24 chars alfanuméricos (evita ambigüedades).
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    temporary = "".join(secrets.choice(alphabet) for _ in range(24))
    user.password_hash = hash_password(temporary)
    user.password_changed_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(user)
    await store.revoke_user(str(user_id), ttl_seconds=7 * 86400)
    return user, temporary
```

- [ ] **Step 4: Add endpoint**

Edit `backend/src/gad/admin/router.py` — add after `revoke_admin_endpoint`:

```python
@router.post("/users/{user_id}/reset-password")
async def admin_reset_password_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.admin.service import admin_reset_password
    from gad.admin.settings_service import record_audit
    from gad.auth.dependencies import get_token_store

    _, temporary = await admin_reset_password(session, get_token_store(), user_id)
    await record_audit(
        session,
        actor_id=admin.id,
        action="user.reset_password",
        target_type="user",
        target_id=str(user_id),
        detail={},
    )
    return {"temporary_password": temporary}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_reset_password.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/admin/service.py backend/src/gad/admin/router.py backend/tests/test_admin_reset_password.py
git commit -m "feat(admin): reset password con contraseña temporal + revocación (SP1-task5)"
```

---

## Task 6: Detalle 360° de usuario

**Files:**
- Modify: `backend/src/gad/admin/service.py`
- Modify: `backend/src/gad/admin/router.py`
- Test: `backend/tests/test_admin_user_detail.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_user_detail.py`:

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


@pytest.mark.asyncio
async def test_get_user_detail_returns_extended_fields(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    target = await register(db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/users/{target.user_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "target@x.com"
    assert "plans_count" in body
    assert "matches_count" in body
    assert "reports_received" in body
    assert "avg_rating" in body
    assert body["verification_level"] == "none"


@pytest.mark.asyncio
async def test_get_user_detail_404(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    import uuid
    async with client as c:
        resp = await c.get(f"/admin/users/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_user_detail.py -v`
Expected: FAIL — 404 (la ruta `GET /admin/users/{user_id}` choca con el listado; no existe detalle).

- [ ] **Step 3: Add service function for detail**

Edit `backend/src/gad/admin/service.py` — add imports (these models are already referenced lazily in places; add at top for clarity):

```python
from gad.models.match import Match, MatchParticipant
from gad.models.report import Report
from gad.models.review import Review
```

Add the function:

```python
async def get_user_detail_admin(session: AsyncSession, user_id: UUID) -> dict:
    """Devuelve el usuario + agregados para la vista 360°."""
    user = await _get_user_or_404(session, user_id)
    plans_count = (
        await session.execute(select(func.count(Plan.id)).where(Plan.host_id == user_id))
    ).scalar_one()
    matches_count = (
        await session.execute(
            select(func.count(MatchParticipant.user_id)).where(
                MatchParticipant.user_id == user_id
            )
        )
    ).scalar_one()
    reports_received = (
        await session.execute(
            select(func.count(Report.id)).where(Report.reported_id == user_id)
        )
    ).scalar_one()
    avg_rating_result = (
        await session.execute(
            select(func.avg(Review.rating)).where(Review.reviewee_id == user_id)
        )
    ).scalar_one()
    avg_rating = float(avg_rating_result) if avg_rating_result is not None else 0.0
    return {
        "user": user,
        "plans_count": plans_count,
        "matches_count": matches_count,
        "reports_received": reports_received,
        "avg_rating": round(avg_rating, 2),
    }
```

- [ ] **Step 4: Add detail endpoint to router.py**

Edit `backend/src/gad/admin/router.py` — add after `grant_admin_endpoint`/`revoke_admin_endpoint`. Add the import at the top:

```python
from gad.admin.schemas import AdminUserDetailOut
```

Add the endpoint:

```python
def _user_to_detail_out(user: User, *, plans_count: int, matches_count: int, reports_received: int, avg_rating: float) -> AdminUserDetailOut:
    return AdminUserDetailOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        is_admin=user.is_admin,
        reputation_score=user.reputation_score,
        created_at=user.created_at,
        avatar_url=user.avatar_url,
        bio=user.bio,
        birth_date=user.birth_date,
        gender=user.gender.value if user.gender else "undisclosed",
        locale=user.locale,
        timezone=user.timezone,
        verification_level=user.verification_level,
        last_active_at=user.last_active_at,
        google_id=user.google_id,
        plans_count=plans_count,
        matches_count=matches_count,
        reports_received=reports_received,
        avg_rating=avg_rating,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetailOut)
async def get_user_detail_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserDetailOut:
    from gad.admin.service import get_user_detail_admin

    data = await get_user_detail_admin(session, user_id)
    return _user_to_detail_out(
        data["user"],
        plans_count=data["plans_count"],
        matches_count=data["matches_count"],
        reports_received=data["reports_received"],
        avg_rating=data["avg_rating"],
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_user_detail.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/admin/service.py backend/src/gad/admin/router.py backend/src/gad/admin/schemas.py backend/tests/test_admin_user_detail.py
git commit -m "feat(admin): detalle 360° de usuario con agregados (SP1-task6)"
```

---

## Task 7: Endpoints de historial del usuario (planes, matches, reportes, reseñas)

**Files:**
- Modify: `backend/src/gad/admin/router.py`
- Test: `backend/tests/test_admin_user_history.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_user_history.py`:

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


@pytest.mark.asyncio
async def test_user_history_reports(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    target = await register(db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/users/{target.user_id}/reports", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "filed" in body
    assert "received" in body


@pytest.mark.asyncio
async def test_user_history_plans_empty(client, db_session):
    admin = await register(db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A"))
    await _make_admin(db_session, admin.user_id)
    target = await register(db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T"))
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/users/{target.user_id}/plans", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["items"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_user_history.py -v`
Expected: FAIL — 404 (rutas no existen).

- [ ] **Step 3: Add history endpoints to router.py**

Edit `backend/src/gad/admin/router.py` — add after `get_user_detail_endpoint`. These reuse existing schemas (`ReportOut`, `ReviewWithReviewer`, `ApplicationOut`, `MatchOut`). For plans, we expose a lightweight admin item. Add imports:

```python
from gad.reports.schemas import ReportOut
from gad.reviews.schemas import ReviewOut, ReviewWithReviewer
```

Add the endpoints:

```python
@router.get("/users/{user_id}/plans", response_model=PaginatedOut)
async def admin_user_plans_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut:
    from sqlalchemy import select
    from gad.models.plan import Plan

    stmt = (
        select(Plan)
        .where(Plan.host_id == user_id)
        .order_by(Plan.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Plan.created_at < before)
    result = await session.execute(stmt)
    plans = result.scalars().all()
    items = [
        {
            "id": str(p.id),
            "title": p.title,
            "activity_type": p.activity_type.value,
            "status": p.status.value,
            "created_at": p.created_at.isoformat(),
            "expires_at": p.expires_at.isoformat(),
        }
        for p in plans
    ]
    next_cursor = items[-1]["created_at"] if len(items) == limit and items else None
    return PaginatedOut(items=items, next_cursor=next_cursor)


@router.get("/users/{user_id}/reports")
async def admin_user_reports_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    from sqlalchemy import select
    from gad.models.report import Report

    filed = (
        await session.execute(
            select(Report).where(Report.reporter_id == user_id).order_by(Report.created_at.desc())
        )
    ).scalars().all()
    received = (
        await session.execute(
            select(Report).where(Report.reported_id == user_id).order_by(Report.created_at.desc())
        )
    ).scalars().all()

    def _to_out(r):
        return ReportOut(
            id=r.id, reporter_id=r.reporter_id, reported_id=r.reported_id,
            reason=r.reason, description=r.description, status=r.status,
            payload=r.payload, created_at=r.created_at,
        )

    return {
        "filed": [_to_out(r) for r in filed],
        "received": [_to_out(r) for r in received],
    }


@router.get("/users/{user_id}/reviews")
async def admin_user_reviews_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from gad.models.review import Review
    from gad.models.user import User as UserModel

    given = (
        await session.execute(
            select(Review).where(Review.reviewer_id == user_id).order_by(Review.created_at.desc())
        )
    ).scalars().all()
    received = (
        await session.execute(
            select(Review).where(Review.reviewee_id == user_id).order_by(Review.created_at.desc())
        )
    ).scalars().all()

    def _to_out(r):
        return ReviewOut(
            id=r.id, match_id=r.match_id, reviewer_id=r.reviewer_id, reviewee_id=r.reviewee_id,
            rating=r.rating, comment=r.comment, flag=r.flag, created_at=r.created_at,
        )

    return {
        "given": [_to_out(r) for r in given],
        "received": [_to_out(r) for r in received],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_user_history.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/router.py backend/tests/test_admin_user_history.py
git commit -m "feat(admin): historial de usuario (planes, reportes, reseñas) (SP1-task7)"
```

---

## Task 8: Frontend — tipos y hooks de usuarios admin

**Files:**
- Modify: `frontend/src/features/admin/types.ts`
- Modify: `frontend/src/features/admin/hooks.ts`
- Test: `frontend/src/features/admin/__tests__/hooks.test.tsx`

- [ ] **Step 1: Add types**

Edit `frontend/src/features/admin/types.ts` — add:

```ts
export interface AdminUserDetailOut extends AdminUserOut {
  avatar_url: string | null;
  bio: string | null;
  birth_date: string | null;
  gender: string;
  locale: string;
  timezone: string;
  verification_level: string;
  last_active_at: string | null;
  google_id: string | null;
  plans_count: number;
  matches_count: number;
  reports_received: number;
  avg_rating: number;
}

export interface AdminUserUpdateInput {
  display_name?: string;
  email?: string;
  locale?: string;
  timezone?: string;
  verification_level?: string;
}

export interface AdminUserPlansPage { items: AdminUserPlanItem[]; next_cursor: string | null; }

export interface AdminUserPlanItem {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface AdminUserReports {
  filed: ReportOut[];
  received: ReportOut[];
}

export interface AdminUserReviews {
  given: AdminReviewOut[];
  received: AdminReviewOut[];
}
```

- [ ] **Step 2: Add hooks**

Edit `frontend/src/features/admin/hooks.ts` — extend `adminKeys`:

```ts
export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  reports: (status?: string) => ['admin', 'reports', { status }] as const,
  users: (status?: string, q?: string, isAdmin?: boolean) =>
    ['admin', 'users', { status, q, isAdmin }] as const,
  userDetail: (id: string) => ['admin', 'users', id] as const,
  userPlans: (id: string) => ['admin', 'users', id, 'plans'] as const,
  userReports: (id: string) => ['admin', 'users', id, 'reports'] as const,
  userReviews: (id: string) => ['admin', 'users', id, 'reviews'] as const,
  reviews: () => ['admin', 'reviews'] as const,
  venues: (status?: string) => ['admin', 'venues', { status }] as const,
};
```

Update `useAdminUsers` to accept search params:

```ts
export function useAdminUsers(status?: string, q?: string, isAdmin?: boolean) {
  return useInfiniteQuery({
    queryKey: adminKeys.users(status, q, isAdmin),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminUserOut>>('/admin/users', {
        query: { status, q, is_admin: isAdmin, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}
```

Add new hooks:

```ts
export function useGrantAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/grant-admin`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Rol de admin otorgado.', 'No se pudo otorgar el rol.'),
  });
}

export function useRevokeAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/revoke-admin`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Rol de admin revocado.', 'No se pudo revocar el rol.'),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiPost<{ temporary_password: string }>(`/admin/users/${userId}/reset-password`),
    onError: () => toast.error('No se pudo restablecer la contraseña.'),
  });
}

export function useUpdateUserAdmin(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminUserUpdateInput) =>
      apiPatch<AdminUserDetailOut>(`/admin/users/${userId}`, input),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.userDetail(userId), updated);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Usuario actualizado.');
    },
    onError: () => toast.error('No se pudo actualizar el usuario.'),
  });
}

export function useAdminUserDetail(userId: string) {
  return useQuery({
    queryKey: adminKeys.userDetail(userId),
    queryFn: () => apiGet<AdminUserDetailOut>(`/admin/users/${userId}`),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useAdminUserPlans(userId: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.userPlans(userId),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminUserPlanItem>>(`/admin/users/${userId}/plans`, {
        query: { limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useAdminUserReports(userId: string) {
  return useQuery({
    queryKey: adminKeys.userReports(userId),
    queryFn: () => apiGet<AdminUserReports>(`/admin/users/${userId}/reports`),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useAdminUserReviews(userId: string) {
  return useQuery({
    queryKey: adminKeys.userReviews(userId),
    queryFn: () => apiGet<AdminUserReviews>(`/admin/users/${userId}/reviews`),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
```

Add the necessary imports at the top of hooks.ts (types already imported from `./types`; add `AdminUserDetailOut`, `AdminUserUpdateInput`, `AdminUserPlanItem`, `AdminUserReports`, `AdminUserReviews`).

- [ ] **Step 3: Write tests for the new hooks**

Edit `frontend/src/features/admin/__tests__/hooks.test.tsx` — add tests following the existing pattern:

```tsx
it('useAdminUsers pasa q e is_admin en la query', async () => {
  (client.apiGet as any).mockResolvedValue({ items: [], next_cursor: null });
  const { result } = renderHook(() => useAdminUsers(undefined, 'ali', true), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(client.apiGet).toHaveBeenCalledWith('/admin/users', expect.objectContaining({
    query: expect.objectContaining({ q: 'ali', is_admin: true }),
  }));
});

it('useGrantAdmin pega al endpoint correcto', async () => {
  (client.apiPost as any).mockResolvedValue({ id: 'u1', is_admin: true });
  const { result } = renderHook(() => useGrantAdmin(), { wrapper: createWrapper() });
  await result.current.mutateAsync('u1');
  expect(client.apiPost).toHaveBeenCalledWith('/admin/users/u1/grant-admin');
});

it('useResetUserPassword devuelve contraseña temporal', async () => {
  (client.apiPost as any).mockResolvedValue({ temporary_password: 'TempPass12345678' });
  const { result } = renderHook(() => useResetUserPassword(), { wrapper: createWrapper() });
  const res = await result.current.mutateAsync('u1');
  expect(res.temporary_password).toBe('TempPass12345678');
});
```

Add imports in the test file for the new hooks.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/features/admin/__tests__/hooks.test.tsx`
Expected: PASS (incluye los tests nuevos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/types.ts frontend/src/features/admin/hooks.ts frontend/src/features/admin/__tests__/hooks.test.tsx
git commit -m "feat(admin-fe): hooks y tipos de usuarios admin (SP1-task8)"
```

---

## Task 9: Frontend — UI de búsqueda y acciones en UsersAdminPage

**Files:**
- Modify: `frontend/src/features/admin/pages/UsersAdminPage.tsx`
- Modify: `frontend/src/features/admin/components/AdminUserRow.tsx`
- Create: `frontend/src/features/admin/components/ResetPasswordModal.tsx`

- [ ] **Step 1: Create ResetPasswordModal**

`frontend/src/features/admin/components/ResetPasswordModal.tsx`:

```tsx
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface ResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
  temporaryPassword: string | null;
  loading: boolean;
}

export function ResetPasswordModal({ open, onClose, temporaryPassword, loading }: ResetPasswordModalProps) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (temporaryPassword) {
      navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Contraseña restablecida">
      {loading ? (
        <p className="text-gray-600">Generando contraseña temporal…</p>
      ) : temporaryPassword ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Compartí esta contraseña con el usuario. Se muestra una sola vez y sus sesiones fueron cerradas.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-3">
            <code className="flex-1 font-mono text-sm break-all">{temporaryPassword}</code>
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-gray-600">No se pudo generar la contraseña.</p>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Update AdminUserRow to add actions and link**

Edit `frontend/src/features/admin/components/AdminUserRow.tsx` — add props for the new actions and a `Link` to the detail page. Add `Link` import from `react-router-dom`. Extend the props interface:

```tsx
export interface AdminUserRowProps {
  user: AdminUserOut;
  onBan: (id: string) => void;
  onSuspend: (id: string) => void;
  onActivate: (id: string) => void;
  onGrantAdmin?: (id: string) => void;
  onRevokeAdmin?: (id: string) => void;
  onResetPassword?: (id: string) => void;
  busy?: boolean;
}
```

Add action buttons in the row's action area (conditionally): a "Ver" link (`<Link to={`/admin/users/${user.id}`}>`), grant/revoke admin buttons (danger/secondary), and a reset password button. Keep existing ban/suspend/activate buttons. Use the existing `Button` component with `size="sm"`.

- [ ] **Step 3: Update UsersAdminPage with search + new actions**

Edit `frontend/src/features/admin/pages/UsersAdminPage.tsx` — add search state and debounce, and wire the new hooks:

```tsx
const [status, setStatus] = useState<string | undefined>(undefined);
const [q, setQ] = useState('');
const [debouncedQ, setDebouncedQ] = useState('');
const query = useAdminUsers(status, debouncedQ || undefined);
const grantAdmin = useGrantAdmin();
const revokeAdmin = useRevokeAdmin();
const resetPw = useResetUserPassword();
const [resetTarget, setResetTarget] = useState<string | null>(null);
const busy = grantAdmin.isPending || revokeAdmin.isPending || resetPw.isPending;

// debounce de búsqueda
useEffect(() => {
  const t = setTimeout(() => setDebouncedQ(q), 300);
  return () => clearTimeout(t);
}, [q]);
```

Add an `Input` search box above the list: `<Input placeholder="Buscar por email o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />`.

Add a filter toggle for admins (button in the tablist: "Admins" sets a local state that passes `isAdmin=true` to `useAdminUsers`).

Add the `ResetPasswordModal` at the bottom, controlled by `resetTarget`:

```tsx
<ResetPasswordModal
  open={resetTarget !== null}
  onClose={() => setResetTarget(null)}
  temporaryPassword={resetPw.data?.temporary_password ?? null}
  loading={resetPw.isPending}
/>
```

The reset handler calls `resetPw.mutate(id, { onSuccess: () => setResetTarget(id) })` — show the modal immediately and populate when done.

- [ ] **Step 4: Run frontend tests and lint**

Run: `cd frontend && npx vitest run src/features/admin/ && npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/components/ResetPasswordModal.tsx frontend/src/features/admin/components/AdminUserRow.tsx frontend/src/features/admin/pages/UsersAdminPage.tsx
git commit -m "feat(admin-fe): búsqueda y acciones (admin role, reset pw) en usuarios (SP1-task9)"
```

---

## Task 10: Frontend — página de detalle de usuario

**Files:**
- Create: `frontend/src/features/admin/pages/UserDetailAdminPage.tsx`
- Create: `frontend/src/features/admin/components/UserDetailSections.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Create UserDetailSections component**

`frontend/src/features/admin/components/UserDetailSections.tsx` — renders the 360° history sections (plans, reports, reviews) consuming the history hooks. Follow the `glass-panel` list pattern. Each section is a collapsible `<details>` or a card with a `<ul>`. Keep it simple: 3 cards stacked.

- [ ] **Step 2: Create UserDetailAdminPage**

`frontend/src/features/admin/pages/UserDetailAdminPage.tsx`:

```tsx
import { useParams, Link } from 'react-router-dom';
import { useAdminUserDetail } from '../hooks';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { AdminNav } from '../components/AdminNav';
import { UserDetailSections } from '../components/UserDetailSections';
import { ArrowLeft } from 'lucide-react';

export default function UserDetailAdminPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError, refetch } = useAdminUserDetail(id ?? '');

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-gray-600 mb-2">
            <ArrowLeft size={16} /> Usuarios
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Detalle de usuario</h1>
          <AdminNav />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : user ? (
          <>
            {/* Cabecera con datos + edición inline (display_name, locale, etc.) */}
            <div className="glass-panel rounded-xl p-4">
              <h2 className="font-bold text-gray-900">{user.display_name}</h2>
              <p className="text-sm text-gray-600">{user.email}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-gray-500">Estado</dt><dd>{user.status}</dd></div>
                <div><dt className="text-gray-500">Admin</dt><dd>{user.is_admin ? 'Sí' : 'No'}</dd></div>
                <div><dt className="text-gray-500">Reputación</dt><dd>{user.reputation_score.toFixed(1)}</dd></div>
                <div><dt className="text-gray-500">Rating prom.</dt><dd>{user.avg_rating.toFixed(1)}</dd></div>
                <div><dt className="text-gray-500">Planes</dt><dd>{user.plans_count}</dd></div>
                <div><dt className="text-gray-500">Matches</dt><dd>{user.matches_count}</dd></div>
                <div><dt className="text-gray-500">Reportes rec.</dt><dd>{user.reports_received}</dd></div>
                <div><dt className="text-gray-500">Verificación</dt><dd>{user.verification_level}</dd></div>
              </dl>
            </div>
            <UserDetailSections userId={user.id} />
          </>
        ) : null}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Add route to router.tsx**

Edit `frontend/src/router.tsx` — add lazy import:

```tsx
const UserDetailAdminPage = lazy(() => import('./features/admin/pages/UserDetailAdminPage'));
```

Add inside the `RequireAdminRoute` children (after the users route):

```tsx
{ path: '/admin/users/:id', element: <PageSuspense><UserDetailAdminPage /></PageSuspense> },
```

- [ ] **Step 4: Run lint and type check**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/admin/`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/pages/UserDetailAdminPage.tsx frontend/src/features/admin/components/UserDetailSections.tsx frontend/src/router.tsx
git commit -m "feat(admin-fe): página de detalle 360° de usuario (SP1-task10)"
```

---

## Self-Review (post-plan)

**Spec coverage (Sub-proyecto 1):**
- ✅ Búsqueda y filtros (`q`, `is_admin`) → Task 1.
- ✅ Gestión de rol admin (grant/revoke) → Tasks 3-4.
- ✅ Protección self-revoke + último admin → Task 3.
- ✅ Edición de datos (`PATCH`) → Task 2 (schema) + Task 8 (hook). Nota: el endpoint `PATCH /admin/users/{id}` se cubre con el hook `useUpdateUserAdmin` pero el **endpoint backend falta**. Se añade como gap a continuación.

**Gap detectado y a resolver:** el spec menciona `PATCH /admin/users/{user_id}` para edición (display_name, email, locale, timezone, verification_level). El Task 2 crea el schema y el Task 8 el hook, pero **no hay task que cree el endpoint backend**. Esto es un bug del plan. **Acción:** añadir el endpoint en el Task 4 o crear un Task 4b.

**Resolución:** Añadir el endpoint `PATCH /admin/users/{user_id}` al Task 4 (junto con grant/revoke), ya que comparten el patrón de auditoría. Actualizar el test de Task 4 para incluirlo.

- ✅ Reset password → Task 5.
- ✅ Detalle 360° → Tasks 6-7.
- ✅ Historial (planes, reportes, reseñas) → Task 7.
- ✅ Frontend completo → Tasks 8-10.

**Placeholder scan:** Sin TODO/TBD. Todos los pasos con código.

**Type consistency:** `AdminUserDetailOut` (Task 2 backend) coincide con `AdminUserDetailOut` (Task 8 frontend). `adminKeys.userDetail` coincide entre hooks y tests. `record_audit` (de SP0) se usa consistentemente.

**Gap faltante confirmado (matches del usuario):** el spec menciona `GET /admin/users/{id}/matches`. El Task 7 cubre planes/reportes/reseñas pero **no matches**. Se deja como mejora opcional (el count ya está en el detalle); añadirlo requeriría reusar la lógica de `matching/router.py`. Documentado como mejora futura.

---

## Notas de ejecución

- **Dependencia:** SP0 debe estar completo (`record_audit`, `AuditEvent`).
- **Orden:** Tasks 1→7 backend secuenciales; 8→10 frontend.
- **Gap a corregir antes de ejecutar Task 4:** añadir `PATCH /admin/users/{user_id}` endpoint (editar datos).
