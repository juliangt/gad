# Plan 1 — Auth Crítico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los huecos de seguridad serios de autenticación: revocación real de tokens, cambio y recuperación de contraseña, y baja de cuenta con soft-delete.

**Architecture:** Un `TokenStore` en Redis lleva la denylist de `jti` (con TTL = expiración del token) y el mapeo `user_id → set(jti activos)` para revocación masiva. Los reset tokens son UUIDs de un solo uso en Redis con TTL corto. El soft-delete añade `status: UserStatus` al `User`; `get_current_user` rechaza usuarios no-activos.

**Tech Stack:** FastAPI, SQLAlchemy async, Redis (redis.asyncio), python-jose, passlib/argon2, Alembic, pytest + testcontainers.

---

## File Structure

- **Create:** `backend/src/gad/auth/token_store.py` — denylist + revocación por usuario en Redis.
- **Create:** `backend/src/gad/auth/password_reset.py` — emisión/validación de tokens de reset de un solo uso.
- **Create:** `backend/tests/test_token_store.py`
- **Create:** `backend/tests/test_password_reset.py`
- **Create:** `backend/tests/test_password_change.py`
- **Create:** `backend/tests/test_account_deletion.py`
- **Modify:** `backend/src/gad/models/enums.py` — añadir `UserStatus`.
- **Modify:** `backend/src/gad/models/user.py` — añadir `status: UserStatus`.
- **Modify:** `backend/src/gad/auth/jwt.py` — `create_access_token`/`create_refresh_token` ya generan `jti` (no cambian).
- **Modify:** `backend/src/gad/auth/dependencies.py` — `get_current_user` valida `jti` no revocado y `user.status == active`.
- **Modify:** `backend/src/gad/auth/service.py` — logout real, change-password.
- **Modify:** `backend/src/gad/auth/router.py` — endpoints nuevos + rate limit.
- **Modify:** `backend/src/gad/schemas/auth.py` — nuevos schemas.
- **Modify:** `backend/src/gad/config.py` — `password_reset_token_expire_minutes`.
- **Create:** `backend/alembic/versions/0002_user_status.py`

---

## Task 1: UserStatus enum y modelo

**Files:**
- Modify: `backend/src/gad/models/enums.py`
- Modify: `backend/src/gad/models/user.py`

- [ ] **Step 1: Añadir enum `UserStatus`**

En `backend/src/gad/models/enums.py`, añadir al final:

```python
class UserStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    deleted = "deleted"
```

- [ ] **Step 2: Añadir campo `status` al modelo `User`**

En `backend/src/gad/models/user.py`, añadir import y columna. Importar `UserStatus` en el bloque de imports de enums (línea 11-16):

```python
from gad.models.enums import (
    Gender,
    GenderPreference,
    GroupSizePreference,
    UserStatus,
    VerificationLevel,
)
```

Y añadir la columna dentro de la clase `User` (después de `is_admin`, línea 43):

```python
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="userstatus"),
        nullable=False,
        default=UserStatus.active,
        server_default="active",
    )
```

- [ ] **Step 3: Verificar que la app importa sin errores**

Run: `cd backend && uv run python -c "import gad.models.user; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/models/enums.py backend/src/gad/models/user.py
git commit -m "feat(models): añadir UserStatus y columna status a User"
```

---

## Task 2: Migración 0002 (añadir columna status)

**Files:**
- Create: `backend/alembic/versions/0002_user_status.py`

- [ ] **Step 1: Crear la migración**

`backend/alembic/versions/0002_user_status.py`:

```python
"""add user status column

Añade la columna status (enum) a users para soft-delete y suspensión.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    userstatus = sa.Enum("active", "suspended", "deleted", name="userstatus")
    userstatus.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column(
            "status",
            userstatus,
            nullable=False,
            server_default="active",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "status")
    sa.Enum(name="userstatus").drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 2: Test de migración**

En `backend/tests/test_migrations.py` ya existe un test que verifica las tablas. Añadir un test nuevo al final del archivo:

```python
@pytest.mark.asyncio
async def test_user_status_column_exists(db_engine):
    """La migración 0002 añade la columna status a users."""
    async with db_engine.connect() as conn:
        cols = await conn.run_sync(
            lambda sync_conn: [
                c["name"] for c in sa.inspect(sync_conn).get_columns("users")
            ]
        )
    assert "status" in cols
```

(Añadir `import sqlalchemy as sa` al top si no está.)

- [ ] **Step 3: Correr test (la columna no existe aún vía create_all)**

Run: `cd backend && uv run pytest tests/test_migrations.py::test_user_status_column_exists -v`
Expected: PASS — `Base.metadata.create_all` en el fixture crea la columna desde el modelo (la migración es para prod; el modelo es la fuente de verdad en tests).

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0002_user_status.py backend/tests/test_migrations.py
git commit -m "feat(db): migración 0002 añade columna status a users"
```

---

## Task 3: TokenStore (denylist + revocación en Redis)

**Files:**
- Create: `backend/src/gad/auth/token_store.py`
- Create: `backend/tests/test_token_store.py`

- [ ] **Step 1: Escribir test que falla**

`backend/tests/test_token_store.py`:

```python
import pytest

from gad.auth.token_store import TokenStore


@pytest.mark.asyncio
async def test_is_revoked_returns_false_for_unknown_jti(redis_client):
    store = TokenStore(redis_client)
    assert await store.is_revoked("nonexistent-jti") is False


@pytest.mark.asyncio
async def test_revoke_then_is_revoked_returns_true(redis_client):
    store = TokenStore(redis_client)
    await store.revoke_jti("user-1", "jti-1", ttl_seconds=3600)
    assert await store.is_revoked("jti-1") is True


@pytest.mark.asyncio
async def test_revoke_user_revokes_all_their_jtis(redis_client):
    store = TokenStore(redis_client)
    await store.revoke_jti("user-1", "jti-a", ttl_seconds=3600)
    await store.revoke_jti("user-1", "jti-b", ttl_seconds=3600)
    await store.revoke_user("user-1", ttl_seconds=3600)
    assert await store.is_revoked("jti-a") is True
    assert await store.is_revoked("jti-b") is True
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_token_store.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'gad.auth.token_store'`

- [ ] **Step 3: Implementar TokenStore**

`backend/src/gad/auth/token_store.py`:

```python
"""Revocación de JWT en Redis.

Estrategia:
- Cada jti revocado se guarda con TTL = expiración restante del token.
- Un set por user_id agrupa los jtis activos, para revocación masiva
  (cambio de contraseña, SOS, ban).
"""
from redis.asyncio import Redis

_DENYLIST_PREFIX = "revoked:jti:"
_USER_JTIS_PREFIX = "user_jtis:"


class TokenStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def revoke_jti(self, user_id: str, jti: str, ttl_seconds: int) -> None:
        await self._redis.set(_DENYLIST_PREFIX + jti, "1", ex=ttl_seconds)
        await self._redis.sadd(_USER_JTIS_PREFIX + user_id, jti)
        # El set de jtis del usuario expira con el token más longevo (refresco periódico).
        await self._redis.expire(_USER_JTIS_PREFIX + user_id, ttl_seconds)

    async def is_revoked(self, jti: str) -> bool:
        return bool(await self._redis.exists(_DENYLIST_PREFIX + jti))

    async def revoke_user(self, user_id: str, ttl_seconds: int) -> int:
        """Revoca todos los jtis activos del usuario. Devuelve cuántos revocó."""
        jtis = await self._redis.smembers(_USER_JTIS_PREFIX + user_id)
        count = 0
        for raw in jtis:
            jti = raw.decode() if isinstance(raw, bytes) else raw
            await self._redis.set(_DENYLIST_PREFIX + jti, "1", ex=ttl_seconds)
            count += 1
        await self._redis.delete(_USER_JTIS_PREFIX + user_id)
        return count
```

- [ ] **Step 4: Correr, verificar que pasa**

Run: `cd backend && uv run pytest tests/test_token_store.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/auth/token_store.py backend/tests/test_token_store.py
git commit -m "feat(auth): TokenStore para revocación de JWT en Redis"
```

---

## Task 4: get_current_user valida jti y estado de usuario

**Files:**
- Modify: `backend/src/gad/auth/dependencies.py`

- [ ] **Step 1: Escribir test que falla — token revocado rechazado**

En `backend/tests/test_auth_protected.py`, añadir al final:

```python
@pytest.mark.asyncio
async def test_revoked_access_token_is_rejected(client, db_session, redis_client):
    from gad.auth.token_store import TokenStore
    from gad.models.enums import UserStatus

    tokens = await register(
        db_session,
        RegisterIn(email="rev@example.com", password="12345678", display_name="Rev"),
    )
    payload = __import__("gad.auth.jwt", fromlist=["decode_token"]).decode_token(
        tokens.access_token
    )
    store = TokenStore(redis_client)
    await store.revoke_jti(str(tokens.user_id), payload["jti"], ttl_seconds=900)

    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_deleted_user_token_is_rejected(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="del@example.com", password="12345678", display_name="Del"),
    )
    from gad.models.enums import UserStatus

    # Marcar usuario como borrado directamente
    from sqlalchemy import update
    from gad.models.user import User

    await db_session.execute(
        update(User).where(User.id == tokens.user_id).values(status=UserStatus.deleted)
    )
    await db_session.commit()

    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )
    assert resp.status_code == 401
```

Para que `get_current_user` tenga acceso al `TokenStore`, el router/app fixture debe proveer Redis. Modificar el fixture `app` en `test_auth_protected.py` para inyectar `redis_client`:

```python
@pytest.fixture
def app(db_engine, redis_client):
    from fastapi import Request
    from fastapi.responses import JSONResponse

    from gad.auth.token_store import TokenStore
    from gad.exceptions import GADError

    app = FastAPI()

    @app.exception_handler(GADError)
    async def _gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    from gad.db import get_session
    app.dependency_overrides[get_session] = _get_test_session

    # Proveer el TokenStore al módulo dependencies (override global temporal).
    import gad.auth.dependencies as deps
    deps._token_store = TokenStore(redis_client)

    app.include_router(router)
    return app
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_auth_protected.py -v`
Expected: los 2 tests nuevos FALLAN (token revocado y usuario borrado devuelven 200).

- [ ] **Step 3: Implementar en dependencies.py**

Reescribir `backend/src/gad/auth/dependencies.py`:

```python
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gad.auth.jwt import decode_token
from gad.auth.token_store import TokenStore
from gad.db import get_session
from gad.exceptions import AuthError, InvalidTokenError
from gad.models.enums import UserStatus
from gad.models.user import User
from gad.redis_client import redis_client

# Inicializado perezosamente; los tests pueden sobreescribir `_token_store`.
_token_store: TokenStore | None = None


def get_token_store() -> TokenStore:
    global _token_store
    if _token_store is None:
        _token_store = TokenStore(redis_client)
    return _token_store


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Falta token de autorización")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except Exception as e:
        raise InvalidTokenError("Token inválido") from e

    if payload.get("type") != "access":
        raise InvalidTokenError("Token no es de tipo access")

    jti = payload.get("jti")
    store = get_token_store()
    if jti is not None and await store.is_revoked(jti):
        raise InvalidTokenError("Token revocado")

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise InvalidTokenError("Token malformado") from e

    result = await session.execute(
        select(User).options(selectinload(User.preferences)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise AuthError("Usuario no encontrado")
    if user.status != UserStatus.active:
        raise AuthError("Cuenta no activa")

    return user
```

- [ ] **Step 4: Correr todos los tests de auth**

Run: `cd backend && uv run pytest tests/test_auth_protected.py tests/test_token_store.py -v`
Expected: todos PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/auth/dependencies.py backend/tests/test_auth_protected.py
git commit -m "feat(auth): get_current_user valida jti revocado y estado de usuario"
```

---

## Task 5: Logout real (revoca access + refresh)

**Files:**
- Modify: `backend/src/gad/auth/service.py`
- Modify: `backend/src/gad/auth/router.py`

- [ ] **Step 1: Test que falla — logout revoca el access**

`backend/tests/test_logout.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.jwt import decode_token
from gad.auth.router import router
from gad.auth.service import register
from gad.auth.token_store import TokenStore
from gad.exceptions import GADError
from gad.models.user import User
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine, redis_client):
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
    import gad.auth.dependencies as deps
    deps._token_store = TokenStore(redis_client)
    app.include_router(router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_logout_revokes_access_token(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="logout@example.com", password="12345678", display_name="Lo"),
    )
    async with client as c:
        await c.post("/auth/logout", json={"access_token": tokens.access_token})
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )
    assert resp.status_code == 401
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_logout.py -v`
Expected: FAIL (logout actual no revoca)

- [ ] **Step 3: Implementar logout real**

En `backend/src/gad/schemas/auth.py` añadir:

```python
class LogoutIn(BaseModel):
    access_token: str
```

En `backend/src/gad/auth/service.py` añadir import y función:

```python
from gad.auth.jwt import create_access_token, create_refresh_token, decode_token
from gad.auth.token_store import TokenStore
from gad.config import settings
```

Y la función (al final del archivo):

```python
async def logout(store: TokenStore, access_token: str) -> None:
    """Revoca el access token (y futuros refreshes de esta sesión vía jti).

    No falla si el token ya expiró o es inválido: logout es idempotente.
    """
    try:
        payload = decode_token(access_token)
    except Exception:
        return
    jti = payload.get("jti")
    user_id = str(payload.get("sub", ""))
    exp = payload.get("exp", 0)
    now = int(datetime.now(UTC).timestamp())
    ttl = max(1, exp - now)
    if jti and user_id:
        await store.revoke_jti(user_id, jti, ttl_seconds=ttl)
```

Añadir `from datetime import UTC, datetime` arriba en service.py si no está.

Modificar el endpoint de logout en `backend/src/gad/auth/router.py`:

```python
@router.post("/logout")
async def logout_endpoint(
    body: LogoutIn,
) -> dict[str, str]:
    from gad.auth.dependencies import get_token_store
    from gad.auth.service import logout

    store = get_token_store()
    await logout(store, body.access_token)
    return {"message": "Logout OK"}
```

Añadir `LogoutIn` al import de schemas en router.py.

- [ ] **Step 4: Correr test**

Run: `cd backend && uv run pytest tests/test_logout.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/auth/service.py backend/src/gad/auth/router.py backend/src/gad/schemas/auth.py backend/tests/test_logout.py
git commit -m "feat(auth): logout revoca el access token en Redis"
```

---

## Task 6: Cambio de contraseña

**Files:**
- Modify: `backend/src/gad/schemas/auth.py`
- Modify: `backend/src/gad/auth/service.py`
- Modify: `backend/src/gad/auth/router.py`
- Create: `backend/tests/test_password_change.py`

- [ ] **Step 1: Test que falla**

`backend/tests/test_password_change.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router
from gad.auth.service import register
from gad.auth.token_store import TokenStore
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine, redis_client):
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
    import gad.auth.dependencies as deps
    deps._token_store = TokenStore(redis_client)
    app.include_router(router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_change_password_then_old_token_revoked(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="cp@example.com", password="12345678", display_name="Cp"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.post(
            "/auth/change-password",
            json={"old_password": "12345678", "new_password": "newpass123"},
            headers=headers,
        )
        assert resp.status_code == 200
        # El access token viejo queda revocado
        resp_me = await c.get("/auth/me", headers=headers)
        assert resp_me.status_code == 401
        # Login con la nueva password funciona
        resp_login = await c.post(
            "/auth/login", json={"email": "cp@example.com", "password": "newpass123"}
        )
        assert resp_login.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_old_returns_401(client, db_session):
    tokens = await register(
        db_session, RegisterIn(email="cp2@example.com", password="12345678", display_name="Cp2")
    )
    async with client as c:
        resp = await c.post(
            "/auth/change-password",
            json={"old_password": "wrong", "new_password": "newpass123"},
            headers={"Authorization": f"Bearer {tokens.access_token}"},
        )
    assert resp.status_code == 401
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_password_change.py -v`
Expected: FAIL (endpoint no existe)

- [ ] **Step 3: Implementar**

En `backend/src/gad/schemas/auth.py` añadir:

```python
class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)
```

En `backend/src/gad/auth/service.py` añadir (con imports `from sqlalchemy.ext.asyncio import AsyncSession` ya presentes, y `select`, `User` ya importados):

```python
async def change_password(
    session: AsyncSession, store: TokenStore, user: User, old_password: str, new_password: str
) -> None:
    if user.password_hash is None or not verify_password(old_password, user.password_hash):
        raise InvalidCredentialsError("Contraseña actual incorrecta")
    user.password_hash = hash_password(new_password)
    await session.commit()
    # Revocar todas las sesiones activas del usuario.
    await store.revoke_user(str(user.id), ttl_seconds=settings.refresh_token_expire_days * 86400)
```

En `backend/src/gad/auth/router.py` añadir el endpoint:

```python
@router.post("/change-password")
async def change_password_endpoint(
    data: ChangePasswordIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.auth.dependencies import get_token_store
    from gad.auth.service import change_password

    store = get_token_store()
    await change_password(session, store, current_user, data.old_password, data.new_password)
    return {"message": "Contraseña actualizada"}
```

Añadir `ChangePasswordIn` al import de schemas y `get_current_user` ya está importado.

- [ ] **Step 4: Correr tests**

Run: `cd backend && uv run pytest tests/test_password_change.py -v`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/schemas/auth.py backend/src/gad/auth/service.py backend/src/gad/auth/router.py backend/tests/test_password_change.py
git commit -m "feat(auth): cambio de contraseña con revocación de sesiones"
```

---

## Task 7: Recuperación de contraseña (reset flow)

**Files:**
- Create: `backend/src/gad/auth/password_reset.py`
- Modify: `backend/src/gad/auth/service.py`
- Modify: `backend/src/gad/auth/router.py`
- Modify: `backend/src/gad/schemas/auth.py`
- Modify: `backend/src/gad/config.py`
- Create: `backend/tests/test_password_reset.py`

- [ ] **Step 1: Añadir config**

En `backend/src/gad/config.py`, dentro de `Settings`, después de `refresh_token_expire_days`:

```python
    password_reset_token_expire_minutes: int = 30
```

- [ ] **Step 2: Test que falla**

`backend/tests/test_password_reset.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.password_reset import PasswordResetStore
from gad.auth.router import router
from gad.auth.service import register
from gad.auth.token_store import TokenStore
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine, redis_client):
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
    import gad.auth.dependencies as deps
    deps._token_store = TokenStore(redis_client)
    import gad.auth.password_reset as pr
    pr._store = PasswordResetStore(redis_client)
    app.include_router(router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_password_reset_full_flow(client, db_session, redis_client):
    await register(
        db_session, RegisterIn(email="reset@example.com", password="12345678", display_name="R")
    )
    async with client as c:
        # 1. Solicitar reset
        resp = await c.post("/auth/password-reset/request", json={"email": "reset@example.com"})
        assert resp.status_code == 202
        # 2. Extraer el token de Redis (en prod iría por email)
        token = await redis_client.get("pwreset:reset@example.com")
        token = token.decode() if isinstance(token, bytes) else token
        # 3. Confirmar con nueva password
        resp2 = await c.post(
            "/auth/password-reset/confirm",
            json={"token": token, "new_password": "brandnew123"},
        )
        assert resp2.status_code == 200
        # 4. Login con la nueva password
        resp3 = await c.post(
            "/auth/login", json={"email": "reset@example.com", "password": "brandnew123"}
        )
        assert resp3.status_code == 200


@pytest.mark.asyncio
async def test_password_reset_confirm_invalid_token_returns_401(client):
    async with client as c:
        resp = await c.post(
            "/auth/password-reset/confirm",
            json={"token": "garbage", "new_password": "brandnew123"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_request_unknown_email_returns_202(client):
    """No filtrar qué emails existen: siempre 202."""
    async with client as c:
        resp = await c.post(
            "/auth/password-reset/request", json={"email": "nobody@example.com"}
        )
    assert resp.status_code == 202
```

- [ ] **Step 3: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_password_reset.py -v`
Expected: FAIL (módulos/endpoints no existen)

- [ ] **Step 4: Implementar PasswordResetStore**

`backend/src/gad/auth/password_reset.py`:

```python
"""Tokens de reset de contraseña de un solo uso, en Redis.

El token se guarda como pwreset:<email> = <token> con TTL corto.
Al confirmar, se valida y se borra (one-shot).
"""
import secrets

from redis.asyncio import Redis

from gad.config import settings

_PREFIX = "pwreset:"


class PasswordResetStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def issue(self, email: str) -> str:
        token = secrets.token_urlsafe(32)
        ttl = settings.password_reset_token_expire_minutes * 60
        await self._redis.set(_PREFIX + email, token, ex=ttl)
        return token

    async def validate_and_consume(self, email: str, token: str) -> bool:
        stored = await self._redis.get(_PREFIX + email)
        if stored is None:
            return False
        stored = stored.decode() if isinstance(stored, bytes) else stored
        if not secrets.compare_digest(stored, token):
            return False
        await self._redis.delete(_PREFIX + email)
        return True


# Singleton; los tests pueden sobreescribir `_store`.
_store: PasswordResetStore | None = None


def get_password_reset_store() -> PasswordResetStore:
    global _store
    if _store is None:
        from gad.redis_client import redis_client
        _store = PasswordResetStore(redis_client)
    return _store
```

- [ ] **Step 5: Schemas**

En `backend/src/gad/schemas/auth.py`:

```python
class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
```

- [ ] **Step 6: Service functions**

En `backend/src/gad/auth/service.py` añadir imports y funciones:

```python
from gad.auth.password_reset import PasswordResetStore
```

Y al final:

```python
async def request_password_reset(
    session: AsyncSession, store: PasswordResetStore, email: str
) -> None:
    """Genera un token si el usuario existe. No revela si el email existe."""
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None:
        return  # No-op silencioso
    token = await store.issue(email)
    # En producción: enviar email con el token. Aquí sólo se persiste.
    # TODO(email): integrar con un servicio de email real (fuera de scope MVP).


async def confirm_password_reset(
    session: AsyncSession,
    reset_store: PasswordResetStore,
    token_store: TokenStore,
    email: str,
    token: str,
    new_password: str,
) -> None:
    if not await reset_store.validate_and_consume(email, token):
        raise InvalidTokenError("Token de reset inválido o expirado")
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidCredentialsError("Credenciales inválidas")
    user.password_hash = hash_password(new_password)
    await session.commit()
    await token_store.revoke_user(
        str(user.id), ttl_seconds=settings.refresh_token_expire_days * 86400
    )
```

- [ ] **Step 7: Endpoints**

En `backend/src/gad/auth/router.py` añadir (necesitará importar `Depends`, ya importado):

```python
@router.post("/password-reset/request", status_code=202)
@limiter.limit("3/minute")
async def password_reset_request_endpoint(
    request: Request,
    data: PasswordResetRequestIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.auth.dependencies import get_token_store
    from gad.auth.password_reset import get_password_reset_store
    from gad.auth.service import request_password_reset

    await request_password_reset(session, get_password_reset_store(), data.email)
    return {"message": "Si el email existe, recibirás instrucciones"}


@router.post("/password-reset/confirm")
async def password_reset_confirm_endpoint(
    data: PasswordResetConfirmIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.auth.dependencies import get_token_store
    from gad.auth.password_reset import get_password_reset_store
    from gad.auth.service import confirm_password_reset

    # El token en Redis está indexado por email; el cliente debe enviarlo junto.
    # Para no exigir email en el body, lo buscamos escaneando el prefijo.
    # (Ver Task 7 Step 8 para alternativa con token autocontenido.)
    from gad.redis_client import redis_client

    email = await _find_email_for_token(redis_client, data.token)
    if email is None:
        from gad.exceptions import InvalidTokenError
        raise InvalidTokenError("Token de reset inválido o expirado")
    await confirm_password_reset(
        session,
        get_password_reset_store(),
        get_token_store(),
        email,
        data.token,
        data.new_password,
    )
    return {"message": "Contraseña restablecida"}


async def _find_email_for_token(redis_client, token: str) -> str | None:
    """Escanea pwreset:* buscando el token. En prod, el token debería ser
    autocontenido (JWT firmado) para evitar este escaneo; acá es aceptable
    porque el TTL es corto y el volumen bajo."""
    async for key in redis_client.scan_iter(match="pwreset:*", count=100):
        stored = await redis_client.get(key)
        stored = stored.decode() if isinstance(stored, bytes) else stored
        import secrets
        if stored and secrets.compare_digest(stored, token):
            return key.decode().removeprefix("pwreset:") if isinstance(key, bytes) else key.removeprefix("pwreset:")
    return None
```

Añadir imports en router.py: `PasswordResetRequestIn, PasswordResetConfirmIn` al import de schemas.

- [ ] **Step 8: Correr tests**

Run: `cd backend && uv run pytest tests/test_password_reset.py -v`
Expected: 3 PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/gad/config.py backend/src/gad/auth/password_reset.py backend/src/gad/schemas/auth.py backend/src/gad/auth/service.py backend/src/gad/auth/router.py backend/tests/test_password_reset.py
git commit -m "feat(auth): recuperación de contraseña con token de un solo uso"
```

---

## Task 8: Baja de cuenta (soft-delete)

**Files:**
- Modify: `backend/src/gad/auth/service.py`
- Modify: `backend/src/gad/auth/router.py`
- Modify: `backend/src/gad/schemas/auth.py`
- Create: `backend/tests/test_account_deletion.py`

- [ ] **Step 1: Test que falla**

`backend/tests/test_account_deletion.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router
from gad.auth.service import register
from gad.auth.token_store import TokenStore
from gad.exceptions import GADError
from gad.models.enums import UserStatus
from gad.models.user import User
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine, redis_client):
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
    import gad.auth.dependencies as deps
    deps._token_store = TokenStore(redis_client)
    app.include_router(router)
    app.include_router(__import__("gad.users.router", fromlist=["router"]).router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_delete_account_soft_deletes_and_anonymizes(client, db_session):
    tokens = await register(
        db_session, RegisterIn(email="bye@example.com", password="12345678", display_name="Bye")
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete("/me", headers=headers)
        assert resp.status_code == 204
        # El token queda inválido (usuario no activo)
        resp_me = await c.get("/me", headers=headers)
        assert resp_me.status_code == 401
    # El email fue anonimizado y el status = deleted
    from sqlalchemy import select
    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()
    assert user.status == UserStatus.deleted
    assert user.email != "bye@example.com"
    assert user.password_hash is None
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_account_deletion.py -v`
Expected: FAIL (endpoint DELETE /me no existe)

- [ ] **Step 3: Implementar**

En `backend/src/gad/users/service.py` añadir (imports: `from uuid import UUID` ya está, `User` ya está):

```python
async def delete_account(
    session: AsyncSession, store, user: User
) -> None:
    """Soft-delete: marca status=deleted, anonimiza email y limpia credenciales.
    Conserva el registro para integridad referencial (reviews, matches)."""
    import uuid
    from gad.models.enums import UserStatus

    user.status = UserStatus.deleted
    user.email = f"deleted:{uuid.uuid4()}@gad.invalid"
    user.password_hash = None
    user.google_id = None
    user.display_name = "Cuenta eliminada"
    user.bio = None
    user.avatar_url = None
    await session.commit()
    # Revocar todas las sesiones activas.
    from gad.config import settings
    await store.revoke_user(str(user.id), ttl_seconds=settings.refresh_token_expire_days * 86400)
```

En `backend/src/gad/users/router.py` añadir el endpoint (importar `get_token_store`):

```python
@router.delete("/me", status_code=204)
async def delete_me_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    from gad.auth.dependencies import get_token_store
    from gad.users.service import delete_account

    await delete_account(session, get_token_store(), current_user)
```

- [ ] **Step 4: Correr test**

Run: `cd backend && uv run pytest tests/test_account_deletion.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/users/service.py backend/src/gad/users/router.py backend/tests/test_account_deletion.py
git commit -m "feat(users): baja de cuenta con soft-delete y anonimización"
```

---

## Task 9: Rate limit en refresh y oauth

**Files:**
- Modify: `backend/src/gad/auth/router.py`

- [ ] **Step 1: Añadir rate limits**

En `backend/src/gad/auth/router.py`, añadir `@limiter.limit(...)` a los endpoints `/auth/refresh` y `/auth/oauth/google`. Quedan:

```python
@router.post("/oauth/google", response_model=TokenOut)
@limiter.limit("5/minute")
async def oauth_google_endpoint(
    request: Request,
    body: RefreshIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> TokenOut:
    ...


@router.post("/refresh", response_model=TokenOut)
@limiter.limit("30/minute")
async def refresh_endpoint(request: Request, body: RefreshIn) -> TokenOut:
    return await refresh_tokens(body.refresh_token)
```

- [ ] **Step 2: Verificar que la app arranca**

Run: `cd backend && uv run python -c "from gad.main import create_app; create_app(); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/auth/router.py
git commit -m "feat(auth): rate limit en refresh y oauth/google"
```

---

## Task 10: Smoke test e2e de auth

**Files:**
- Create: `backend/tests/test_smoke_auth.py`

- [ ] **Step 1: Smoke test integrador**

`backend/tests/test_smoke_auth.py`:

```python
"""Smoke test e2e del flujo de auth crítico: registro → logout → reset → baja."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.password_reset import PasswordResetStore
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.auth.token_store import TokenStore
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn
from gad.users.router import router as users_router


@pytest.fixture
def app(db_engine, redis_client):
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
    import gad.auth.dependencies as deps
    deps._token_store = TokenStore(redis_client)
    import gad.auth.password_reset as pr
    pr._store = PasswordResetStore(redis_client)
    app.include_router(auth_router)
    app.include_router(users_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_full_auth_lifecycle(client, db_session, redis_client):
    # 1. Registro
    tokens = await register(
        db_session,
        RegisterIn(email="life@example.com", password="12345678", display_name="Life"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        # 2. /auth/me funciona
        assert (await c.get("/auth/me", headers=headers)).status_code == 200
        # 3. Logout revoca
        await c.post("/auth/logout", json={"access_token": tokens.access_token})
        assert (await c.get("/auth/me", headers=headers)).status_code == 401
        # 4. Re-login
        resp = await c.post(
            "/auth/login", json={"email": "life@example.com", "password": "12345678"}
        )
        assert resp.status_code == 200
        new_tokens = resp.json()
        new_headers = {"Authorization": f"Bearer {new_tokens['access_token']}"}
        # 5. Cambio de password
        resp = await c.post(
            "/auth/change-password",
            json={"old_password": "12345678", "new_password": "newpass123"},
            headers=new_headers,
        )
        assert resp.status_code == 200
        # 6. Reset de password
        await c.post(
            "/auth/password-reset/request", json={"email": "life@example.com"}
        )
        token = await redis_client.get("pwreset:life@example.com")
        token = token.decode() if isinstance(token, bytes) else token
        resp = await c.post(
            "/auth/password-reset/confirm",
            json={"token": token, "new_password": "finalpass123"},
        )
        assert resp.status_code == 200
        # 7. Login con la password final
        resp = await c.post(
            "/auth/login", json={"email": "life@example.com", "password": "finalpass123"}
        )
        assert resp.status_code == 200
        final_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        # 8. Baja de cuenta
        resp = await c.delete("/me", headers=final_headers)
        assert resp.status_code == 204
        assert (await c.get("/me", headers=final_headers)).status_code == 401
```

- [ ] **Step 2: Correrlo**

Run: `cd backend && uv run pytest tests/test_smoke_auth.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_auth.py
git commit -m "test(auth): smoke test e2e del ciclo de vida de auth"
```

---

## Self-Review (Plan 1)

**Spec coverage:**
- ✅ Revocación de tokens → Tasks 3, 4, 5
- ✅ Cambio de contraseña → Task 6
- ✅ Recuperación de contraseña → Task 7
- ✅ Baja de cuenta → Task 8
- ✅ Rate limit en refresh/oauth → Task 9
- ✅ Integración → Task 10

**Placeholder scan:** ningún "TODO" sin código; el `TODO(email)` en Task 7 Step 6 es deliberado (email real fuera de MVP, ya documentado en el spec §10).

**Type consistency:** `TokenStore` se usa igual en `dependencies`, `service`, `users/service`. `UserStatus` importado de `models.enums` en todos los sitios. `PasswordResetStore.get_password_reset_store()` es el accessor consistente.
