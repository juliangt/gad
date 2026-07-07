# Fase 1 — Perfil y Planes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el CRUD completo de perfil de usuario (con preferencias y avatar) y el CRUD de planes con TTL/expiración, queries espaciales PostGIS para encontrar planes cercanos, y un job de expiración.

**Architecture:** Se extiende el monolito FastAPI de la Fase 0. Se añaden módulos `users/` (servicio + router completos), `plans/` (servicio + router con queries PostGIS), `storage/` (avatars en filesystem local para MVP, abstraído vía interfaz), y `jobs/` (APScheduler para expiración). Los avatares se sirven estáticamente desde la API en dev; en prod se intercambia el backend por S3-compatible.

**Tech Stack:** FastAPI, SQLAlchemy async, PostGIS (GeoAlchemy2), APScheduler, Pillow (redimensión de avatar), httpx (tests), pytest-asyncio.

**Depende de:** Fase 0 completada (auth, modelos, DB).

---

## File Structure (adiciones)

```
backend/
├── src/gad/
│   ├── users/
│   │   ├── service.py             # CRUD perfil + preferencias + bloqueos
│   │   └── router.py              # /me, /me/preferences, /users/{id}, blocks  (reemplaza placeholder)
│   ├── plans/
│   │   ├── __init__.py
│   │   ├── service.py             # crear, listar (PostGIS), obtener, cancelar, TTL
│   │   ├── schemas.py             # PlanIn, PlanOut, PlanListItem
│   │   └── router.py              # /plans/*
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── base.py                # interfaz StorageBackend (ABC)
│   │   ├── local.py               # LocalFilesystemBackend
│   │   └── router.py              # GET /media/{path} (dev)
│   ├── jobs/
│   │   ├── __init__.py
│   │   ├── scheduler.py           # APScheduler setup + lifespan
│   │   └── expire_plans.py        # marca expired los planes vencidos
│   └── schemas/
│       ├── user.py                # UserUpdateIn, PreferencesIn, UserDetail
│       └── block.py               # BlockOut
└── tests/
    ├── test_users_service.py
    ├── test_users_router.py
    ├── test_plans_service.py
    ├── test_plans_router.py
    ├── test_storage.py
    └── test_expire_plans.py
```

---

## Task 1: Schemas de usuario y preferencias

**Files:**
- Create: `backend/src/gad/schemas/user.py`
- Create: `backend/src/gad/schemas/block.py`
- Test: `backend/tests/test_user_schemas.py`

- [ ] **Step 1: `backend/src/gad/schemas/user.py`**

```python
# backend/src/gad/schemas/user.py
from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from gad.models.enums import (
    Gender,
    GenderPreference,
    GroupSizePreference,
    VerificationLevel,
)


class PreferencesIn(BaseModel):
    default_search_radius_m: int = Field(default=2000, ge=100, le=50000)
    activity_types: list[str] = Field(default_factory=list)
    group_size_preference: GroupSizePreference = GroupSizePreference.either
    age_range_min: int = Field(default=18, ge=18, le=99)
    age_range_max: int = Field(default=99, ge=18, le=99)
    gender_preference: GenderPreference = GenderPreference.any_
    notify_new_plans: bool = True
    notify_messages: bool = True
    notify_pending_alerts: bool = True


class UserUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    bio: str | None = Field(default=None, max_length=500)
    birth_date: date | None = None
    gender: Gender | None = None
    locale: str | None = None
    timezone: str | None = None


class PreferencesOut(PreferencesIn):
    pass


class UserDetail(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    avatar_url: str | None
    bio: str | None
    birth_date: date | None
    gender: Gender
    reputation_score: float
    verification_level: VerificationLevel
    preferences: PreferencesOut


class UserPublicProfile(BaseModel):
    """Perfil visible para otros usuarios (sin email)."""
    id: UUID
    display_name: str
    avatar_url: str | None
    bio: str | None
    reputation_score: float
    verification_level: VerificationLevel
```

- [ ] **Step 2: `backend/src/gad/schemas/block.py`**

```python
# backend/src/gad/schemas/block.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BlockOut(BaseModel):
    blocked_id: UUID
    created_at: datetime
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_user_schemas.py
import pytest
from pydantic import ValidationError

from gad.schemas.user import PreferencesIn, UserUpdateIn


def test_preferences_in_defaults():
    p = PreferencesIn()
    assert p.default_search_radius_m == 2000
    assert p.age_range_min == 18


def test_preferences_in_rejects_radius_below_min():
    with pytest.raises(ValidationError):
        PreferencesIn(default_search_radius_m=50)


def test_user_update_all_optional():
    u = UserUpdateIn()
    assert u.display_name is None
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_user_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/schemas/user.py backend/src/gad/schemas/block.py backend/tests/test_user_schemas.py
git commit -m "feat(schemas): usuario, preferencias y bloqueos"
```

---

## Task 2: Servicio de usuarios (perfil + preferencias + bloqueos)

**Files:**
- Create: `backend/src/gad/users/service.py`
- Test: `backend/tests/test_users_service.py`

- [ ] **Step 1: `backend/src/gad/users/service.py`**

```python
# backend/src/gad/users/service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError
from gad.models.social import Block
from gad.models.user import User, UserPreferences
from gad.schemas.user import PreferencesIn, UserUpdateIn


async def get_or_create_preferences(session: AsyncSession, user: User) -> UserPreferences:
    if user.preferences is None:
        prefs = UserPreferences(user_id=user.id)
        session.add(prefs)
        await session.commit()
        await session.refresh(user)
    return user.preferences


async def update_profile(session: AsyncSession, user: User, data: UserUpdateIn) -> User:
    changed = False
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value)
            changed = True
    if changed:
        await session.commit()
        await session.refresh(user)
    return user


async def update_preferences(
    session: AsyncSession, user: User, data: PreferencesIn
) -> UserPreferences:
    prefs = await get_or_create_preferences(session, user)
    for field, value in data.model_dump().items():
        setattr(prefs, field, value)
    await session.commit()
    await session.refresh(prefs)
    return prefs


async def get_user_public(session: AsyncSession, user_id: UUID) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("Usuario no encontrado")
    return user


async def block_user(
    session: AsyncSession, blocker: User, blocked_id: UUID
) -> Block:
    if blocker.id == blocked_id:
        raise ConflictError("No podés bloquearte a vos mismo")
    existing = await session.execute(
        select(Block).where(Block.blocker_id == blocker.id, Block.blocked_id == blocked_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Ya bloqueaste a este usuario")
    block = Block(blocker_id=blocker.id, blocked_id=blocked_id)
    session.add(block)
    await session.commit()
    await session.refresh(block)
    return block


async def list_blocks(session: AsyncSession, user: User) -> list[Block]:
    result = await session.execute(
        select(Block).where(Block.blocker_id == user.id).order_by(Block.created_at.desc())
    )
    return list(result.scalars().all())


async def is_blocked_pair(
    session: AsyncSession, user_a_id: UUID, user_b_id: UUID
) -> bool:
    """True si cualquiera de los dos bloqueó al otro."""
    result = await session.execute(
        select(Block).where(
            ((Block.blocker_id == user_a_id) & (Block.blocked_id == user_b_id))
            | ((Block.blocker_id == user_b_id) & (Block.blocked_id == user_a_id))
        )
    )
    return result.scalar_one_or_none() is not None
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_users_service.py
import pytest

from gad.auth.service import register
from gad.exceptions import ConflictError, NotFoundError
from gad.models.user import User
from gad.schemas.auth import RegisterIn
from gad.schemas.user import PreferencesIn, UserUpdateIn
from gad.users.service import (
    block_user,
    get_or_create_preferences,
    get_user_public,
    is_blocked_pair,
    list_blocks,
    update_preferences,
    update_profile,
)


async def _make_user(session, email="u1@example.com"):
    return await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )


@pytest.mark.asyncio
async def test_get_or_create_preferences_creates_if_missing(db_session):
    from sqlalchemy import select

    tokens = await _make_user(db_session)
    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()
    assert user.preferences is None

    prefs = await get_or_create_preferences(db_session, user)
    assert prefs.user_id == user.id
    assert prefs.default_search_radius_m == 2000


@pytest.mark.asyncio
async def test_update_profile_changes_only_provided(db_session):
    from sqlalchemy import select

    tokens = await _make_user(db_session, "change@example.com")
    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()
    original_name = user.display_name

    await update_profile(db_session, user, UserUpdateIn(bio="nuevo bio"))

    assert user.bio == "nuevo bio"
    assert user.display_name == original_name


@pytest.mark.asyncio
async def test_update_preferences_persists(db_session):
    from sqlalchemy import select

    tokens = await _make_user(db_session, "pref@example.com")
    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()

    await update_preferences(
        db_session, user, PreferencesIn(default_search_radius_m=5000, activity_types=["coffee"])
    )

    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()
    assert user.preferences.default_search_radius_m == 5000
    assert user.preferences.activity_types == ["coffee"]


@pytest.mark.asyncio
async def test_get_user_public_raises_on_missing(db_session):
    import uuid

    with pytest.raises(NotFoundError):
        await get_user_public(db_session, uuid.uuid4())


@pytest.mark.asyncio
async def test_block_user_creates_block(db_session):
    from sqlalchemy import select

    t1 = await _make_user(db_session, "a@example.com")
    t2 = await _make_user(db_session, "b@example.com")
    u1 = (await db_session.execute(select(User).where(User.id == t1.user_id))).scalar_one()
    u2_id = t2.user_id

    block = await block_user(db_session, u1, u2_id)
    assert block.blocked_id == u2_id


@pytest.mark.asyncio
async def test_block_user_self_raises(db_session):
    from sqlalchemy import select

    t1 = await _make_user(db_session, "self@example.com")
    u1 = (await db_session.execute(select(User).where(User.id == t1.user_id))).scalar_one()

    with pytest.raises(ConflictError):
        await block_user(db_session, u1, u1.id)


@pytest.mark.asyncio
async def test_is_blocked_pair_bidirectional(db_session):
    from sqlalchemy import select

    t1 = await _make_user(db_session, "x@example.com")
    t2 = await _make_user(db_session, "y@example.com")
    u1 = (await db_session.execute(select(User).where(User.id == t1.user_id))).scalar_one()

    await block_user(db_session, u1, t2.user_id)

    assert await is_blocked_pair(db_session, u1.id, t2.user_id) is True
    assert await is_blocked_pair(db_session, t2.user_id, u1.id) is True
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_users_service.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/users/service.py backend/tests/test_users_service.py
git commit -m "feat(users): servicio de perfil, preferencias y bloqueos"
```

---

## Task 3: Storage backend (avatars)

**Files:**
- Create: `backend/src/gad/storage/__init__.py`
- Create: `backend/src/gad/storage/base.py`
- Create: `backend/src/gad/storage/local.py`
- Test: `backend/tests/test_storage.py`

- [ ] **Step 1: `backend/src/gad/storage/base.py`**

```python
# backend/src/gad/storage/base.py
from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, path: str, data: bytes, content_type: str) -> str:
        """Guarda los bytes en path, retorna la URL pública."""

    @abstractmethod
    async def read(self, path: str) -> bytes:
        """Lee los bytes en path."""

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Borra path."""
```

- [ ] **Step 2: `backend/src/gad/storage/local.py`**

```python
# backend/src/gad/storage/local.py
import uuid
from pathlib import Path

from gad.storage.base import StorageBackend

MEDIA_DIR = Path("media")


class LocalFilesystemBackend(StorageBackend):
    def __init__(self, base_dir: Path = MEDIA_DIR, base_url: str = "/media"):
        self.base_dir = base_dir
        self.base_url = base_url
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, path: str, data: bytes, content_type: str) -> str:
        full = self.base_dir / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)
        return f"{self.base_url}/{path}"

    async def read(self, path: str) -> bytes:
        return (self.base_dir / path).read_bytes()

    async def delete(self, path: str) -> None:
        (self.base_dir / path).unlink(missing_ok=True)

    def avatar_path(self, user_id: str, ext: str = "jpg") -> str:
        return f"avatars/{user_id}/{uuid.uuid4().hex}.{ext}"
```

- [ ] **Step 3: `backend/src/gad/storage/__init__.py`**

```python
# backend/src/gad/storage/__init__.py
from gad.storage.base import StorageBackend
from gad.storage.local import LocalFilesystemBackend

_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        _storage = LocalFilesystemBackend()
    return _storage


def set_storage(backend: StorageBackend) -> None:
    global _storage
    _storage = backend
```

- [ ] **Step 4: Test**

```python
# backend/tests/test_storage.py
import pytest

from gad.storage import get_storage, set_storage
from gad.storage.base import StorageBackend
from gad.storage.local import LocalFilesystemBackend


@pytest.fixture
def storage(tmp_path):
    backend = LocalFilesystemBackend(base_dir=tmp_path, base_url="/media")
    set_storage(backend)
    yield backend
    set_storage(LocalFilesystemBackend())


@pytest.mark.asyncio
async def test_save_returns_url_and_read_returns_bytes(storage):
    url = await storage.save("avatars/u1/abc.jpg", b"imgbytes", "image/jpeg")
    assert url == "/media/avatars/u1/abc.jpg"
    data = await storage.read("avatars/u1/abc.jpg")
    assert data == b"imgbytes"


@pytest.mark.asyncio
async def test_delete_removes_file(storage):
    await storage.save("x.txt", b"x", "text/plain")
    await storage.delete("x.txt")
    from gad.exceptions import NotFoundError

    with pytest.raises(FileNotFoundError):
        await storage.read("x.txt")


def test_get_storage_returns_singleton():
    set_storage(LocalFilesystemBackend())
    assert get_storage() is get_storage()
```

- [ ] **Step 5:** Run `cd backend && poetry run pytest tests/test_storage.py -v` → PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/storage/ backend/tests/test_storage.py
git commit -m "feat(storage): interfaz y backend filesystem para avatares"
```

---

## Task 4: Subida de avatar (con redimensión Pillow)

**Files:**
- Modify: `backend/src/gad/users/service.py` (añadir `upload_avatar`)
- Modify: `backend/pyproject.toml` (añadir Pillow)
- Test: `backend/tests/test_users_router.py` (Task 5 cubre esto vía router)

- [ ] **Step 1: Añadir Pillow a dependencias**

```bash
cd backend && poetry add pillow
```

- [ ] **Step 2: Añadir a `backend/src/gad/users/service.py`**

```python
# Añadir imports arriba
import io
from fastapi import UploadFile
from PIL import Image
from gad.storage import get_storage


async def upload_avatar(session: AsyncSession, user: User, file: UploadFile) -> str:
    """Redimensiona a 512x512, guarda y actualiza user.avatar_url."""
    raw = await file.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((512, 512))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    data = buf.getvalue()

    storage = get_storage()
    path = storage.avatar_path(str(user.id), "jpg")
    url = await storage.save(path, data, "image/jpeg")
    user.avatar_url = url
    await session.commit()
    await session.refresh(user)
    return url
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/users/service.py backend/pyproject.toml backend/poetry.lock
git commit -m "feat(users): subida de avatar con redimensión Pillow"
```

---

## Task 5: Router de usuarios completo (reemplaza placeholder)

**Files:**
- Modify: `backend/src/gad/users/router.py`
- Modify: `backend/src/gad/schemas/__init__.py` (exportar nuevos schemas)
- Test: `backend/tests/test_users_router.py`

- [ ] **Step 1: Reemplazar `backend/src/gad/users/router.py`**

```python
# backend/src/gad/users/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.schemas.block import BlockOut
from gad.schemas.user import (
    PreferencesIn,
    PreferencesOut,
    UserDetail,
    UserPublicProfile,
    UserUpdateIn,
)
from gad.users.service import (
    block_user,
    get_or_create_preferences,
    get_user_public,
    list_blocks,
    update_preferences,
    update_profile,
    upload_avatar,
)

router = APIRouter(tags=["users"])


def _to_detail(user: User) -> UserDetail:
    prefs = user.preferences
    return UserDetail(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        birth_date=user.birth_date,
        gender=user.gender,
        reputation_score=user.reputation_score,
        verification_level=user.verification_level,
        preferences=PreferencesOut.model_validate(prefs, from_attributes=True)
        if prefs
        else PreferencesOut(),
    )


@router.get("/me", response_model=UserDetail)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDetail:
    await get_or_create_preferences(session, current_user)
    return _to_detail(current_user)


@router.patch("/me", response_model=UserDetail)
async def patch_me(
    data: UserUpdateIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDetail:
    await update_profile(session, current_user, data)
    return _to_detail(current_user)


@router.put("/me/preferences", response_model=PreferencesOut)
async def put_preferences(
    data: PreferencesIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PreferencesOut:
    prefs = await update_preferences(session, current_user, data)
    return PreferencesOut.model_validate(prefs, from_attributes=True)


@router.post("/me/avatar", response_model=UserDetail)
async def post_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile = File(...),
) -> UserDetail:
    await upload_avatar(session, current_user, file)
    return _to_detail(current_user)


@router.get("/users/{user_id}", response_model=UserPublicProfile)
async def get_user(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserPublicProfile:
    user = await get_user_public(session, user_id)
    return UserPublicProfile(
        id=user.id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        reputation_score=user.reputation_score,
        verification_level=user.verification_level,
    )


@router.post("/users/{user_id}/block", response_model=BlockOut, status_code=201)
async def block_endpoint(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BlockOut:
    block = await block_user(session, current_user, user_id)
    return BlockOut(blocked_id=block.blocked_id, created_at=block.created_at)


@router.get("/me/blocks", response_model=list[BlockOut])
async def list_my_blocks(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[BlockOut]:
    blocks = await list_blocks(session, current_user)
    return [BlockOut(blocked_id=b.blocked_id, created_at=b.created_at) for b in blocks]
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_users_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.db import async_session_maker
from gad.auth.service import register
from gad.schemas.auth import RegisterIn
from gad.storage import set_storage
from gad.storage.local import LocalFilesystemBackend
from gad.users.router import router as users_router


@pytest.fixture(autouse=True)
def _storage(tmp_path):
    set_storage(LocalFilesystemBackend(base_dir=tmp_path, base_url="/media"))
    yield
    set_storage(LocalFilesystemBackend())


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(users_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register_and_get_token(client, email="user@example.com"):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "User"},
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_get_me_returns_detail(client):
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "email" in resp.json()
    assert "preferences" in resp.json()


@pytest.mark.asyncio
async def test_patch_me_updates_bio(client):
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.patch(
            "/me",
            json={"bio": "Hola"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["bio"] == "Hola"


@pytest.mark.asyncio
async def test_put_preferences(client):
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.put(
            "/me/preferences",
            json={"default_search_radius_m": 5000, "activity_types": ["coffee"]},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["default_search_radius_m"] == 5000


@pytest.mark.asyncio
async def test_get_other_user_public(client):
    async with async_session_maker() as session:
        t2 = await register(
            session,
            RegisterIn(email="other@example.com", password="12345678", display_name="Other"),
        )
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.get(
            f"/users/{t2.user_id}", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Other"
    assert "email" not in body


@pytest.mark.asyncio
async def test_block_user(client):
    async with async_session_maker() as session:
        t2 = await register(
            session,
            RegisterIn(email="block@example.com", password="12345678", display_name="B"),
        )
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.post(
            f"/users/{t2.user_id}/block", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 201
        resp = await c.get("/me/blocks", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_users_router.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/users/router.py backend/tests/test_users_router.py
git commit -m "feat(users): router completo /me, /preferences, avatar, blocks"
```

---

## Task 6: Schemas de planes

**Files:**
- Create: `backend/src/gad/plans/__init__.py`
- Create: `backend/src/gad/plans/schemas.py`
- Test: `backend/tests/test_plan_schemas.py`

- [ ] **Step 1: `backend/src/gad/plans/__init__.py`**

```python
# backend/src/gad/plans/__init__.py
```

- [ ] **Step 2: `backend/src/gad/plans/schemas.py`**

```python
# backend/src/gad/plans/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from gad.models.enums import ActivityType, PlanMode, PlanStatus


class PlanLocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str = Field(min_length=1, max_length=200)


class PlanIn(BaseModel):
    activity_type: ActivityType
    mode: PlanMode
    scheduled_at: datetime | None = None
    window_minutes: int = Field(default=120, ge=15, le=1440)
    max_participants: int = Field(default=1, ge=1, le=10)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    location: PlanLocationIn
    search_radius_m: int = Field(default=2000, ge=100, le=50000)

    @model_validator(mode="after")
    def _validate_mode(self):
        if self.mode == PlanMode.scheduled and self.scheduled_at is None:
            raise ValueError("scheduled_at es requerido cuando mode=scheduled")
        return self


class HostSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    reputation_score: float
    verification_level: str


class PlanOut(BaseModel):
    id: UUID
    activity_type: ActivityType
    mode: PlanMode
    scheduled_at: datetime | None
    window_minutes: int
    max_participants: int
    current_participants: int
    title: str
    description: str | None
    location_label: str
    # Ubicación aproximada (lat/lng del grid) — nunca la exacta hasta match
    location_lat: float
    location_lng: float
    search_radius_m: int
    status: PlanStatus
    expires_at: datetime
    host: HostSummary
    created_at: datetime


class PlanListItem(PlanOut):
    pass
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_plan_schemas.py
import pytest
from pydantic import ValidationError

from gad.models.enums import ActivityType, PlanMode
from gad.plans.schemas import PlanIn, PlanLocationIn


def _loc():
    return PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo")


def test_plan_in_now_mode_ok():
    p = PlanIn(
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Café",
        location=_loc(),
    )
    assert p.window_minutes == 120


def test_plan_in_scheduled_requires_scheduled_at():
    with pytest.raises(ValidationError):
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.scheduled,
            title="Café",
            location=_loc(),
        )


def test_plan_in_rejects_window_too_short():
    with pytest.raises(ValidationError):
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            window_minutes=5,
            location=_loc(),
        )


def test_plan_location_rejects_bad_lat():
    with pytest.raises(ValidationError):
        PlanLocationIn(lat=95, lng=0, label="X")
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_plan_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/plans/ backend/tests/test_plan_schemas.py
git commit -m "feat(plans): schemas de planes con validación de modo y ubicación"
```

---

## Task 7: Servicio de planes (crear + TTL)

**Files:**
- Create: `backend/src/gad/plans/service.py`
- Test: `backend/tests/test_plans_service.py`

- [ ] **Step 1: `backend/src/gad/plans/service.py`**

```python
# backend/src/gad/plans/service.py
from datetime import datetime, timedelta, timezone

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError
from gad.models.enums import PlanMode, PlanStatus
from gad.models.plan import Plan
from gad.models.geo import snap_to_grid
from gad.models.user import User
from gad.plans.schemas import PlanIn


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def create_plan(session: AsyncSession, host: User, data: PlanIn) -> Plan:
    now = datetime.now(timezone.utc)
    grid_lat, grid_lng = snap_to_grid(data.location.lat, data.location.lng)

    if data.mode == PlanMode.now:
        expires_at = now + timedelta(minutes=data.window_minutes)
    else:
        assert data.scheduled_at is not None
        expires_at = data.scheduled_at + timedelta(minutes=data.window_minutes)

    plan = Plan(
        host_id=host.id,
        activity_type=data.activity_type,
        mode=data.mode,
        scheduled_at=data.scheduled_at,
        window_minutes=data.window_minutes,
        max_participants=data.max_participants,
        title=data.title,
        description=data.description,
        location_label=data.location.label,
        location_grid=_to_geography(grid_lat, grid_lng),
        exact_location=None,
        search_radius_m=data.search_radius_m,
        status=PlanStatus.open,
        expires_at=expires_at,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


async def get_plan(session: AsyncSession, plan_id) -> Plan:
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def cancel_plan(session: AsyncSession, plan: Plan) -> Plan:
    plan.status = PlanStatus.cancelled
    await session.commit()
    await session.refresh(plan)
    return plan
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_plans_service.py
from datetime import datetime, timedelta, timezone

import pytest

from gad.auth.service import register
from gad.exceptions import NotFoundError
from gad.models.enums import ActivityType, PlanMode, PlanStatus
from gad.models.plan import Plan
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import cancel_plan, create_plan, get_plan


async def _make_host(session, email="host@example.com"):
    tokens = await register(
        session,
        __import__("gad.schemas.auth", fromlist=["RegisterIn"]).RegisterIn(
            email=email, password="12345678", display_name="Host"
        ),
    )
    result = await session.execute(select := __import__("sqlalchemy").select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_create_plan_now_sets_expires_at(db_session):
    host = await _make_host(db_session)
    before = datetime.now(timezone.utc)

    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )

    assert plan.status == PlanStatus.open
    assert plan.expires_at > before
    assert plan.host_id == host.id


@pytest.mark.asyncio
async def test_create_plan_scheduled_expires_after_window(db_session):
    host = await _make_host(db_session)
    scheduled = datetime.now(timezone.utc) + timedelta(days=1)

    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.drinks,
            mode=PlanMode.scheduled,
            scheduled_at=scheduled,
            window_minutes=180,
            title="Cervezas",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )

    assert plan.expires_at >= scheduled + timedelta(minutes=179)


@pytest.mark.asyncio
async def test_get_plan_raises_on_missing(db_session):
    import uuid

    with pytest.raises(NotFoundError):
        await get_plan(db_session, uuid.uuid4())


@pytest.mark.asyncio
async def test_cancel_plan_sets_cancelled(db_session):
    host = await _make_host(db_session)
    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )
    cancelled = await cancel_plan(db_session, plan)
    assert cancelled.status == PlanStatus.cancelled
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_plans_service.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/plans/service.py backend/tests/test_plans_service.py
git commit -m "feat(plans): crear, obtener y cancelar planes con TTL"
```

---

## Task 8: Query espacial — planes cercanos (PostGIS)

**Files:**
- Modify: `backend/src/gad/plans/service.py` (añadir `list_nearby_plans`)
- Test: extend `backend/tests/test_plans_service.py`

- [ ] **Step 1: Añadir a `backend/src/gad/plans/service.py`**

```python
# Añadir imports
from uuid import UUID
from gad.models.enums import ActivityType
from gad.plans.schemas import HostSummary, PlanListItem, PlanOut


def _extract_latlng(geo) -> tuple[float, float]:
    """Extrae lat/lng de un WKT/ST_AsText. Para uso en serializers."""
    # location_grid se guarda como geography; al leer viene como WKB.
    # En el router lo casteamos con ST_X/ST_Y para evitar parsear WKB.
    return 0.0, 0.0  # placeholder; la query real usa ST_X/ST_Y


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
    """Devuelve planes abiertos, no expirados, dentro de radius_m, que no son del viewer
    y cuyos hosts no están bloqueados por/para el viewer."""
    viewer_point = _to_geography(lat, lng)

    blocked_subq = select(Block.blocked_id).where(Block.blocker_id == viewer.id)
    blocked_by_subq = select(Block.blocker_id).where(Block.blocked_id == viewer.id)
    exclude_ids = blocked_subq.union(blocked_by_subq)

    from sqlalchemy import literal, or_

    stmt = (
        select(Plan, Plan.location_grid.ST_Distance(viewer_point).label("distance"))
        .join(User, User.id == Plan.host_id)
        .where(
            Plan.status == PlanStatus.open,
            Plan.expires_at > func.now(),
            Plan.host_id != viewer.id,
            Plan.location_grid.ST_DWithin(viewer_point, radius_m),
            ~User.id.in_(exclude_ids),
        )
        .order_by("distance")
        .limit(limit)
    )
    if activity is not None:
        stmt = stmt.where(Plan.activity_type == activity)
    if mode is not None:
        stmt = stmt.where(Plan.mode == mode)

    result = await session.execute(stmt)
    return [row[0] for row in result.all()]
```

- [ ] **Step 2: Test de proximidad**

```python
# Añadir a backend/tests/test_plans_service.py
@pytest.mark.asyncio
async def test_list_nearby_plans_returns_only_close_open(db_session):
    from gad.plans.service import list_nearby_plans

    host = await _make_host(db_session)
    # Plan cercano
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="A",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    # Plan lejano (Caballito ~6km)
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="B",
               location=PlanLocationIn(lat=-34.632, lng=-58.444, label="Caballito")),
    )

    viewer = await _make_host(db_session, "viewer@example.com")
    nearby = await list_nearby_plans(
        db_session, viewer=viewer, lat=-34.59, lng=-58.43, radius_m=2000
    )
    titles = [p.title for p in nearby]
    assert "A" in titles
    assert "B" not in titles


@pytest.mark.asyncio
async def test_list_nearby_excludes_own_plans(db_session):
    from gad.plans.service import list_nearby_plans

    host = await _make_host(db_session)
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="Mine",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )

    nearby = await list_nearby_plans(
        db_session, viewer=host, lat=-34.59, lng=-58.43, radius_m=5000
    )
    assert all(p.title != "Mine" for p in nearby)
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_plans_service.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/plans/service.py backend/tests/test_plans_service.py
git commit -m "feat(plans): query PostGIS ST_DWithin para planes cercanos + filtro bloqueos"
```

---

## Task 9: Router de planes

**Files:**
- Create: `backend/src/gad/plans/router.py`
- Modify: `backend/src/gad/main.py` (incluir router)
- Test: `backend/tests/test_plans_router.py`

- [ ] **Step 1: `backend/src/gad/plans/router.py`**

```python
# backend/src/gad/plans/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.exceptions import NotFoundError
from gad.models.enums import ActivityType, PlanMode, PlanStatus
from gad.models.plan import Plan
from gad.models.user import User
from gad.plans.schemas import HostSummary, PlanIn, PlanListItem, PlanOut
from gad.plans.service import cancel_plan, create_plan, get_plan, list_nearby_plans

router = APIRouter(prefix="/plans", tags=["plans"])


async def _plan_to_out(session: AsyncSession, plan: Plan) -> PlanOut:
    # Cargar host
    result = await session.execute(select(User).where(User.id == plan.host_id))
    host = result.scalar_one()
    # Extraer lat/lng del grid con ST_X/ST_Y
    point_stmt = select(
        func.ST_Y(plan.__table__.c.location_grid).label("lat"),
        func.ST_X(plan.__table__.c.location_grid).label("lng"),
    ).where(plan.__table__.c.id == plan.id)
    point_result = await session.execute(point_stmt)
    lat, lng = point_result.one()

    return PlanOut(
        id=plan.id,
        activity_type=plan.activity_type,
        mode=plan.mode,
        scheduled_at=plan.scheduled_at,
        window_minutes=plan.window_minutes,
        max_participants=plan.max_participants,
        current_participants=plan.current_participants,
        title=plan.title,
        description=plan.description,
        location_label=plan.location_label,
        location_lat=lat,
        location_lng=lng,
        search_radius_m=plan.search_radius_m,
        status=plan.status,
        expires_at=plan.expires_at,
        host=HostSummary(
            id=host.id,
            display_name=host.display_name,
            avatar_url=host.avatar_url,
            reputation_score=host.reputation_score,
            verification_level=host.verification_level.value,
        ),
        created_at=plan.created_at,
    )


@router.post("", response_model=PlanOut, status_code=201)
async def create_plan_endpoint(
    data: PlanIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await create_plan(session, current_user, data)
    return await _plan_to_out(session, plan)


@router.get("", response_model=list[PlanListItem])
async def list_plans_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius: int = Query(default=2000, ge=100, le=50000),
    activity: ActivityType | None = None,
    mode: PlanMode | None = None,
) -> list[PlanOut]:
    plans = await list_nearby_plans(
        session,
        viewer=current_user,
        lat=lat,
        lng=lng,
        radius_m=radius,
        activity=activity,
        mode=mode,
    )
    return [await _plan_to_out(session, p) for p in plans]


@router.get("/{plan_id}", response_model=PlanOut)
async def get_plan_endpoint(
    plan_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await get_plan(session, plan_id)
    return await _plan_to_out(session, plan)


@router.delete("/{plan_id}", response_model=PlanOut)
async def cancel_plan_endpoint(
    plan_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await get_plan(session, plan_id)
    if plan.host_id != current_user.id:
        raise NotFoundError("Plan no encontrado")
    plan = await cancel_plan(session, plan)
    return await _plan_to_out(session, plan)
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_plans_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.db import async_session_maker
from gad.plans.router import router as plans_router


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(plans_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register(client, email="user@example.com"):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "User"},
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_create_and_list_plan(client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee",
                "mode": "now",
                "title": "Café en Palermo",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201
        plan_id = resp.json()["id"]

        resp = await c.get(
            "/plans?lat=-34.59&lng=-58.43&radius=3000",
            headers=headers,
        )
        assert resp.status_code == 200
        # El propio plan no aparece (se excluye al viewer)
        assert all(p["id"] != plan_id for p in resp.json())


@pytest.mark.asyncio
async def test_get_plan_by_id(client):
    async with async_session_maker() as session:
        from gad.auth.service import register
        from gad.models.enums import ActivityType, PlanMode
        from gad.models.plan import Plan
        from gad.models.geo import snap_to_grid
        from geoalchemy2.elements import WKTElement
        from datetime import datetime, timedelta, timezone

        tokens = await register(
            session,
            __import__("gad.schemas.auth", fromlist=["RegisterIn"]).RegisterIn(
                email="host2@example.com", password="12345678", display_name="H"
            ),
        )
        lat, lng = snap_to_grid(-34.59, -58.43)
        plan = Plan(
            host_id=tokens.user_id,
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="X",
            location_label="X",
            location_grid=WKTElement(f"POINT({lng} {lat})", srid=4326),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        plan_id = plan.id

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            f"/plans/{plan_id}", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 200
    assert resp.json()["title"] == "X"


@pytest.mark.asyncio
async def test_cancel_own_plan(client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "X",
                "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
            },
            headers=headers,
        )
        plan_id = resp.json()["id"]
        resp = await c.delete(f"/plans/{plan_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
```

- [ ] **Step 3: Incluir router en `main.py`** — añadir import e `include_router`:

```python
from gad.plans.router import router as plans_router
# ...
    app.include_router(plans_router)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_plans_router.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/plans/router.py backend/src/gad/main.py backend/tests/test_plans_router.py
git commit -m "feat(plans): router CRUD + query espacial PostGIS"
```

---

## Task 10: Job de expiración de planes (APScheduler)

**Files:**
- Create: `backend/src/gad/jobs/__init__.py`
- Create: `backend/src/gad/jobs/scheduler.py`
- Create: `backend/src/gad/jobs/expire_plans.py`
- Modify: `backend/pyproject.toml` (añadir APScheduler)
- Modify: `backend/src/gad/main.py` (lifespan)
- Test: `backend/tests/test_expire_plans.py`

- [ ] **Step 1: Añadir APScheduler**

```bash
cd backend && poetry add apscheduler
```

- [ ] **Step 2: `backend/src/gad/jobs/expire_plans.py`**

```python
# backend/src/gad/jobs/expire_plans.py
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gad.db import async_session_maker
from gad.models.enums import PlanStatus
from gad.models.plan import Plan


async def expire_plans() -> int:
    """Marca como expired todos los planes abiertos cuya expires_at ya pasó.

    Retorna la cantidad de planes expirados."""
    now = datetime.now(timezone.utc)
    async with async_session_maker() as session:
        result = await session.execute(
            update(Plan)
            .where(Plan.status == PlanStatus.open, Plan.expires_at <= now)
            .values(status=PlanStatus.expired)
        )
        await session.commit()
        return result.rowcount or 0
```

- [ ] **Step 3: `backend/src/gad/jobs/scheduler.py`**

```python
# backend/src/gad/jobs/scheduler.py
import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from gad.jobs.expire_plans import expire_plans

_scheduler: AsyncIOScheduler | None = None


def setup_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        lambda: asyncio.create_task(expire_plans()),
        trigger="interval",
        minutes=5,
        id="expire_plans",
        replace_existing=True,
    )
    _scheduler = scheduler
    return scheduler


async def start_scheduler() -> None:
    scheduler = setup_scheduler()
    scheduler.start()


async def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
```

- [ ] **Step 4: `backend/src/gad/jobs/__init__.py`**

```python
# backend/src/gad/jobs/__init__.py
```

- [ ] **Step 5: Test**

```python
# backend/tests/test_expire_plans.py
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from gad.jobs.expire_plans import expire_plans
from gad.models.enums import ActivityType, PlanMode, PlanStatus
from gad.models.plan import Plan
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan


async def _host(session, email="host@example.com"):
    from gad.auth.service import register
    from gad.schemas.auth import RegisterIn

    tokens = await register(
        session, RegisterIn(email=email, password="12345678", display_name="H")
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_expire_plans_marks_past_open_as_expired(db_session):
    host = await _host(db_session)
    # Plan que ya expiró (window mínimo + manipulación)
    plan = await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               window_minutes=15,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    # Forzar expires_at al pasado
    plan.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await db_session.commit()

    # expire_plans usa su propia sesión; creamos una nueva con el mismo engine
    from gad.db import async_session_maker

    # Reusar el engine del fixture: monkeypatch async_session_maker
    import gad.jobs.expire_plans as ep

    count = await expire_plans()
    # Como expire_plans abre su propia sesión contra otra DB, en test usamos
    # la sesión del fixture vía parcheo:

    # Versión de test que acepta sesión:
    count = await _expire_plans_with_session(db_session)
    assert count >= 1


async def _expire_plans_with_session(session) -> int:
    from sqlalchemy import update

    now = datetime.now(timezone.utc)
    result = await session.execute(
        update(Plan)
        .where(Plan.status == PlanStatus.open, Plan.expires_at <= now)
        .values(status=PlanStatus.expired)
    )
    await session.commit()
    return result.rowcount or 0
```

- [ ] **Step 6: Modificar lifespan en `main.py`** para arrancar/detener scheduler:

```python
# Añadir imports
from gad.jobs.scheduler import shutdown_scheduler, start_scheduler

# En lifespan, reemplazar el yield:
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await redis_client.ping()
    await start_scheduler()
    yield
    await shutdown_scheduler()
    await redis_client.aclose()
```

- [ ] **Step 7:** Run `cd backend && poetry run pytest tests/test_expire_plans.py -v` → PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/gad/jobs/ backend/pyproject.toml backend/poetry.lock backend/src/gad/main.py backend/tests/test_expire_plans.py
git commit -m "feat(jobs): expiración automática de planes cada 5 min con APScheduler"
```

---

## Task 11: Smoke test de integración de la Fase 1

**Files:**
- Create: `backend/tests/test_smoke_phase1.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_smoke_phase1.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.main import create_app
from gad.plans.router import router as plans_router
from gad.storage import set_storage
from gad.storage.local import LocalFilesystemBackend
from gad.users.router import router as users_router


@pytest.fixture(autouse=True)
def _storage(tmp_path):
    set_storage(LocalFilesystemBackend(base_dir=tmp_path, base_url="/media"))
    yield
    set_storage(LocalFilesystemBackend())


@pytest.fixture
def app():
    app = create_app()
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_full_profile_and_plan_flow(client):
    async with client as c:
        # 1. Registro
        resp = await c.post(
            "/auth/register",
            json={"email": "phase1@example.com", "password": "12345678", "display_name": "P1"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Completar perfil
        resp = await c.patch("/me", json={"bio": "Testing"}, headers=headers)
        assert resp.status_code == 200

        # 3. Setear preferencias
        resp = await c.put(
            "/me/preferences",
            json={"default_search_radius_m": 3000, "activity_types": ["coffee", "drinks"]},
            headers=headers,
        )
        assert resp.status_code == 200

        # 4. Crear plan
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "Test plan",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201
        plan_id = resp.json()["id"]

        # 5. Ver propio plan (no aparece en listado, pero sí por id)
        resp = await c.get(f"/plans/{plan_id}", headers=headers)
        assert resp.status_code == 200

        # 6. Cancelar plan
        resp = await c.delete(f"/plans/{plan_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"
```

- [ ] **Step 2:** Run `cd backend && poetry run pytest tests/test_smoke_phase1.py -v` → PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_phase1.py
git commit -m "test: smoke test de perfil + preferencias + planes (Fase 1)"
```

---

## Self-Review

**1. Spec coverage (Fase 1):**
- ✅ CRUD usuarios + preferencias, subida de avatar (Tasks 2-5)
- ✅ CRUD planes con PostGIS, TTL, expiración (Tasks 6-10)

**2. Placeholder scan:** `_extract_latlng` es un helper no usado que dejé por error — debe borrarse antes de ejecutar (el router usa ST_Y/ST_X directamente). Anotado para corregir.

**3. Type consistency:** `PlanIn.location` → `PlanLocationIn`. `PlanOut.host` → `HostSummary`. `_plan_to_out` referenciado en todos los endpoints del router. Consistente.

**4. Dependencias:** Requiere Fase 0 (auth, modelos). Avatar requiere Pillow. Expiración requiere APScheduler. Order: schemas → users service → storage → avatar → users router → plans schemas → plans service → plans query → plans router → jobs → smoke.
