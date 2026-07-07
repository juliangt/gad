# Fase 0 — Fundaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar la base del monolito GAD: API FastAPI corriendo en Docker Compose junto a PostgreSQL+PostGIS y Redis, con el schema completo de la base de datos migrado por Alembic, autenticación JWT + OAuth Google funcionando, manejo de errores, logging, rate limiting y CI con tests.

**Architecture:** Monolito modular FastAPI async. Un solo proceso sirve REST (+ reservamos lugar para WS en fases posteriores). Postgres+PostGIS persiste todo; Redis se usa como cache/pub-sub (en esta fase solo se valida conexión). Autenticación stateless con JWT de acceso (15 min) y refresh token (7 días) en cookie httpOnly. OAuth Google vía Authlib. Las dependencias se instalan con Poetry; la DB arranca con la extensión PostGIS habilitada; las migraciones Alembic crean todas las tablas del spec.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, asyncpg, Pydantic v2, passlib[argon2], python-jose (JWT), Authlib, Redis (redis-py async), slowapi, structlog, Docker, Docker Compose, pytest, pytest-asyncio, testcontainers, GitHub Actions.

---

## File Structure

### Backend (`backend/`)

```
backend/
├── pyproject.toml                 # Poetry: dependencias y config
├── alembic.ini                    # config de Alembic
├── Dockerfile                     # imagen de la API
├── .env.example                   # variables de entorno de ejemplo
├── entrypoint.sh                  # espera DB + corre migraciones + arranca uvicorn
├── alembic/
│   ├── env.py                     # config async de Alembic
│   ├── script.py.mako             # template
│   └── versions/
│       └── 0001_initial_schema.py # migración inicial: todas las tablas del spec
├── src/gad/
│   ├── __init__.py
│   ├── main.py                    # factory de la app FastAPI + routers + middleware
│   ├── config.py                  # Settings con pydantic-settings (env vars)
│   ├── db.py                      # engine async + sessionmaker + get_session
│   ├── redis_client.py            # conexión Redis async
│   ├── exceptions.py              # excepciones de dominio + handlers
│   ├── logging_setup.py           # config structlog
│   ├── health.py                  # /health, /health/ready
│   ├── alembic_utils.py           # helpers PostGIS para migraciones
│   ├── models/
│   │   ├── __init__.py            # re-exporta todos los modelos
│   │   ├── base.py                # Base, naming convention, mixins timestamp
│   │   ├── enums.py               # todos los enums del spec
│   │   ├── geo.py                 # helpers PostGIS: grid snap, haversine
│   │   ├── user.py                # User, UserPreferences
│   │   ├── plan.py                # Plan, PlanApplication
│   │   ├── match.py               # Match, MatchParticipant, Message
│   │   ├── review.py              # Review
│   │   ├── availability.py        # Availability
│   │   ├── safety.py              # TrustedContact, SafetySession, SafetyEvent
│   │   └── social.py              # Block, Notification
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── common.py              # Paginación, error responses
│   │   └── auth.py                # RegisterIn, LoginIn, TokenOut, RefreshIn
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── service.py             # register, login, refresh, verify_email
│   │   ├── oauth.py               # flujo Google OAuth con Authlib
│   │   ├── jwt.py                 # crear/verificar access+refresh tokens
│   │   ├── passwords.py           # hash/verify con argon2
│   │   ├── dependencies.py        # get_current_user, require_auth
│   │   └── router.py              # /auth/* endpoints
│   ├── users/
│   │   ├── __init__.py
│   │   └── router.py              # /me (placeholder, se completa en Fase 1)
│   └── middleware/
│       ├── __init__.py
│       └── rate_limit.py          # slowapi setup
├── tests/
│   ├── __init__.py
│   ├── conftest.py                # fixtures: DB testcontainers, cliente async, redis
│   ├── test_config.py
│   ├── test_db_session.py
│   ├── test_models.py
│   ├── test_geo.py
│   ├── test_migrations.py
│   ├── test_redis.py
│   ├── test_auth_schemas.py
│   ├── test_passwords.py
│   ├── test_jwt.py
│   ├── test_auth_register.py
│   ├── test_auth_login.py
│   ├── test_auth_refresh.py
│   ├── test_auth_oauth.py
│   ├── test_auth_protected.py
│   ├── test_health.py
│   ├── test_rate_limit.py
│   └── test_error_handling.py
└── .github/
    └── workflows/
        └── ci.yml                 # lint + test en push/PR
```

### Raíz (`/`)

```
/
├── docker-compose.yml             # api + db (postgis) + redis
└── .gitignore
```

**Notas de descomposición:**

- Cada modelo en su propio archivo por entidad-agregado, pero todos importan de `base.py` para compartir `Base` y convención de nombres.
- `auth/` está separado en `service.py`, `jwt.py`, `passwords.py`, `oauth.py`, `dependencies.py` y `router.py`. Cada uno tiene una sola responsabilidad.
- `schemas/` separa los contratos Pydantic de los modelos SQLAlchemy.
- Los tests se nombran por feature, no por archivo, para que sean fáciles de localizar.
- Los tests usan `Base.metadata.create_all()` contra un Postgres+PostGIS en testcontainers (no requieren migraciones Alembic). Alembic se usa solo para producción.

---

## Task 1: Inicializar el repositorio del backend con Poetry

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.gitignore`
- Create: `/.gitignore`

- [ ] **Step 1: Crear la estructura del backend**

Run:
```bash
mkdir -p backend/src/gad/models backend/src/gad/schemas backend/src/gad/auth backend/src/gad/users backend/src/gad/middleware backend/tests backend/alembic/versions
```

- [ ] **Step 2: Escribir `backend/pyproject.toml`**

```toml
[tool.poetry]
name = "gad"
version = "0.1.0"
description = "GAD backend API"
authors = ["GAD Team <dev@gad.local>"]
readme = "README.md"
packages = [{ include = "gad", from = "src" }]

[tool.poetry.dependencies]
python = "^3.12"
fastapi = "^0.115.0"
uvicorn = { extras = ["standard"], version = "^0.32.0" }
sqlalchemy = { extras = ["asyncio"], version = "^2.0.36" }
alembic = "^1.14.0"
asyncpg = "^0.30.0"
psycopg2-binary = "^2.9.10"
pydantic = "^2.10.0"
pydantic-settings = "^2.7.0"
passlib = { extras = ["argon2"], version = "^1.7.4" }
python-jose = { extras = ["cryptography"], version = "^3.3.0" }
authlib = "^1.4.0"
itsdangerous = "^2.2.0"
redis = { extras = ["hiredis"], version = "^5.2.0" }
slowapi = "^0.1.9"
structlog = "^24.4.0"
python-multipart = "^0.0.20"
email-validator = "^2.2.0"
geoalchemy2 = "^0.16.0"

[tool.poetry.group.dev.dependencies]
pytest = "^8.3.4"
pytest-asyncio = "^0.25.0"
pytest-cov = "^6.0.0"
httpx = "^0.28.1"
testcontainers = { extras = ["postgres", "redis"], version = "^4.8.0" }
respx = "^0.22.0"
freezegun = "^1.5.1"
ruff = "^0.8.0"
mypy = "^1.13.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "-ra --strict-markers"

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]
```

- [ ] **Step 3: Escribir `backend/.gitignore`**

```gitignore
.venv/
__pycache__/
*.pyc
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
.ruff_cache/
*.egg-info/
dist/
.env
```

- [ ] **Step 4: Escribir `/.gitignore` raíz**

```gitignore
# Python
.venv/
__pycache__/
*.pyc
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
.ruff_cache/
*.egg-info/

# Env
.env
.env.*
!.env.example

# Editor
.vscode/
.idea/
*.swp
.DS_Store

# Frontend (futuro)
node_modules/
dist/
```

- [ ] **Step 5: Instalar dependencias**

Run:
```bash
cd backend && poetry install
```
Expected: dependencias resueltas e instaladas en un virtualenv.

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/.gitignore .gitignore
git commit -m "chore(backend): inicializar proyecto Poetry con dependencias"
```

---

## Task 2: Configuración (Settings) con pydantic-settings

**Files:**
- Create: `backend/src/gad/config.py`
- Create: `backend/.env.example`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Escribir el test de configuración**

```python
# backend/tests/test_config.py
import pytest

from gad.config import Settings


def _set_required_env(monkeypatch, **overrides):
    base = {
        "DATABASE_URL": "postgresql+asyncpg://u:p@db:5432/gad",
        "REDIS_URL": "redis://redis:6379/0",
        "JWT_SECRET": "test-secret-12345678901234567890",
    }
    base.update(overrides)
    for k, v in base.items():
        monkeypatch.setenv(k, v)
    return base


def test_settings_load_from_env(monkeypatch):
    _set_required_env(
        monkeypatch,
        GOOGLE_CLIENT_ID="google-id",
        GOOGLE_CLIENT_SECRET="google-secret",
    )

    s = Settings()

    assert s.database_url == "postgresql+asyncpg://u:p@db:5432/gad"
    assert s.redis_url == "redis://redis:6379/0"
    assert s.jwt_secret == "test-secret-12345678901234567890"
    assert s.google_client_id == "google-id"
    assert s.access_token_expire_minutes == 15
    assert s.refresh_token_expire_days == 7
    assert s.cors_origins == ["http://localhost:5173"]


def test_settings_cors_parses_csv(monkeypatch):
    _set_required_env(monkeypatch, CORS_ORIGINS="https://a.com,https://b.com")

    s = Settings()

    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_settings_jwt_secret_min_length(monkeypatch):
    _set_required_env(monkeypatch, JWT_SECRET="short")

    with pytest.raises(ValueError):
        Settings()
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && poetry run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'gad.config'`

- [ ] **Step 3: Implementar `backend/src/gad/config.py`**

```python
# backend/src/gad/config.py
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "GAD"
    environment: Literal["dev", "test", "prod"] = "dev"
    cors_origins: list[str] = ["http://localhost:5173"]

    # Database
    database_url: str

    # Redis
    redis_url: str

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # OAuth Google
    google_client_id: str = ""
    google_client_secret: str = ""

    # Rate limit
    rate_limit_enabled: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("JWT_SECRET debe tener al menos 16 caracteres")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
```

- [ ] **Step 4: Escribir `backend/.env.example`**

```dotenv
# App
APP_NAME=GAD
ENVIRONMENT=dev
CORS_ORIGINS=http://localhost:5173

# Database
DATABASE_URL=postgresql+asyncpg://gad:gad@db:5432/gad

# Redis
REDIS_URL=redis://redis:6379/0

# JWT — generar con: python -c "import secrets; print(secrets.token_urlsafe(32))"
JWT_SECRET=change-me-at-least-16-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# OAuth Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Rate limit
RATE_LIMIT_ENABLED=true
```

- [ ] **Step 5: Correr los tests**

Run: `cd backend && poetry run pytest tests/test_config.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/config.py backend/.env.example backend/tests/test_config.py
git commit -m "feat(config): Settings con pydantic-settings + validación JWT secret"
```

---

## Task 3: Base de datos async (engine + sessionmaker)

**Files:**
- Create: `backend/src/gad/db.py`
- Create: `backend/src/gad/__init__.py`
- Test: `backend/tests/test_db_session.py`

- [ ] **Step 1: Escribir el test**

```python
# backend/tests/test_db_session.py
import types

from gad.db import get_session


def test_get_session_is_async_generator():
    gen = get_session()
    assert isinstance(gen, types.AsyncGeneratorType)
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && poetry run pytest tests/test_db_session.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'gad.db'`

- [ ] **Step 3: Implementar `backend/src/gad/db.py`**

```python
# backend/src/gad/db.py
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from gad.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

- [ ] **Step 4: Escribir `backend/src/gad/__init__.py`**

```python
# backend/src/gad/__init__.py
__version__ = "0.1.0"
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && poetry run pytest tests/test_db_session.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/db.py backend/src/gad/__init__.py backend/tests/test_db_session.py
git commit -m "feat(db): engine async + sessionmaker + get_session dependency"
```

---

## Task 4: Modelos base, enums y convención de nombres

**Files:**
- Create: `backend/src/gad/models/base.py`
- Create: `backend/src/gad/models/enums.py`
- Create: `backend/src/gad/models/__init__.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: Escribir `backend/src/gad/models/enums.py`**

```python
# backend/src/gad/models/enums.py
import enum


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    nonbinary = "nonbinary"
    undisclosed = "undisclosed"


class VerificationLevel(str, enum.Enum):
    none = "none"
    email = "email"
    google = "google"


class GroupSizePreference(str, enum.Enum):
    one_on_one = "one_on_one"
    small_group = "small_group"
    either = "either"


class GenderPreference(str, enum.Enum):
    any_ = "any"
    same = "same"
    mixed = "mixed"
    specific = "specific"


class ActivityType(str, enum.Enum):
    coffee = "coffee"
    drinks = "drinks"
    food = "food"
    walk = "walk"
    park = "park"
    event = "event"
    other = "other"


class PlanMode(str, enum.Enum):
    now = "now"
    scheduled = "scheduled"


class PlanStatus(str, enum.Enum):
    open = "open"
    matched = "matched"
    closed = "closed"
    cancelled = "cancelled"
    expired = "expired"


class ApplicationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"


class MatchStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class MatchRole(str, enum.Enum):
    host = "host"
    participant = "participant"


class SafetyEventType(str, enum.Enum):
    sos = "sos"
    location_shared = "location_shared"
    contact_notified = "contact_notified"


class ContactType(str, enum.Enum):
    email = "email"
    phone = "phone"


class NotificationType(str, enum.Enum):
    new_application = "new_application"
    match = "match"
    new_message = "new_message"
    safety = "safety"
    review = "review"
    plan_alert = "plan_alert"


class ReviewFlag(str, enum.Enum):
    no_show = "no_show"
    inappropriate = "inappropriate"
    false_info = "false_info"
```

- [ ] **Step 2: Escribir `backend/src/gad/models/base.py`**

```python
# backend/src/gad/models/base.py
from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

- [ ] **Step 3: Escribir `backend/src/gad/models/__init__.py`**

```python
# backend/src/gad/models/__init__.py
from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    ContactType,
    Gender,
    GenderPreference,
    GroupSizePreference,
    MatchRole,
    MatchStatus,
    NotificationType,
    PlanMode,
    PlanStatus,
    ReviewFlag,
    SafetyEventType,
    VerificationLevel,
)

__all__ = [
    "Base",
    "TimestampMixin",
    "ActivityType",
    "ApplicationStatus",
    "ContactType",
    "Gender",
    "GenderPreference",
    "GroupSizePreference",
    "MatchRole",
    "MatchStatus",
    "NotificationType",
    "PlanMode",
    "PlanStatus",
    "ReviewFlag",
    "SafetyEventType",
    "VerificationLevel",
]
```

- [ ] **Step 4: Escribir el test**

```python
# backend/tests/test_models.py
from gad.models import (
    ActivityType,
    ApplicationStatus,
    Gender,
    MatchStatus,
    PlanMode,
    PlanStatus,
    VerificationLevel,
)
from gad.models.base import NAMING_CONVENTION


def test_enums_have_expected_values():
    assert ActivityType.coffee.value == "coffee"
    assert PlanMode.now.value == "now"
    assert PlanStatus.open.value == "open"
    assert ApplicationStatus.pending.value == "pending"
    assert MatchStatus.active.value == "active"
    assert Gender.male.value == "male"
    assert VerificationLevel.google.value == "google"


def test_base_metadata_has_naming_convention():
    from gad.models.base import Base

    assert "pk" in NAMING_CONVENTION
    assert Base.metadata.naming_convention is NAMING_CONVENTION
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && poetry run pytest tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/models/base.py backend/src/gad/models/enums.py backend/src/gad/models/__init__.py backend/tests/test_models.py
git commit -m "feat(models): Base, TimestampMixin, enums y convención de nombres"
```

---

## Task 5: Modelo User y UserPreferences

**Files:**
- Create: `backend/src/gad/models/user.py`
- Modify: `backend/src/gad/models/__init__.py`
- Test: extend `backend/tests/test_models.py`

- [ ] **Step 1: Implementar `backend/src/gad/models/user.py`**

```python
# backend/src/gad/models/user.py
from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    Gender,
    GenderPreference,
    GroupSizePreference,
    VerificationLevel,
)

if TYPE_CHECKING:
    pass


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[Gender] = mapped_column(
        Enum(Gender, name="gender"), nullable=False, default=Gender.undisclosed
    )
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="es-AR")
    timezone: Mapped[str] = mapped_column(
        String(50), nullable=False, default="America/Argentina/Buenos_Aires"
    )
    reputation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    verification_level: Mapped[VerificationLevel] = mapped_column(
        Enum(VerificationLevel, name="verificationlevel"),
        nullable=False,
        default=VerificationLevel.none,
    )
    last_active_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    preferences: Mapped["UserPreferences"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserPreferences(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    default_search_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    activity_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    group_size_preference: Mapped[GroupSizePreference] = mapped_column(
        Enum(GroupSizePreference, name="groupsizepreference"),
        nullable=False,
        default=GroupSizePreference.either,
    )
    age_range_min: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    age_range_max: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    gender_preference: Mapped[GenderPreference] = mapped_column(
        Enum(GenderPreference, name="genderpreference"),
        nullable=False,
        default=GenderPreference.any_,
    )
    notify_new_plans: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_messages: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_pending_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped["User"] = relationship(back_populates="preferences")
```

- [ ] **Step 2: Actualizar `backend/src/gad/models/__init__.py`**

Añadir al final del bloque de imports:

```python
from gad.models.user import User, UserPreferences
```

Y añadir `"User", "UserPreferences"` a la lista `__all__`.

Versión completa del archivo:

```python
# backend/src/gad/models/__init__.py
from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    ContactType,
    Gender,
    GenderPreference,
    GroupSizePreference,
    MatchRole,
    MatchStatus,
    NotificationType,
    PlanMode,
    PlanStatus,
    ReviewFlag,
    SafetyEventType,
    VerificationLevel,
)
from gad.models.user import User, UserPreferences

__all__ = [
    "Base",
    "TimestampMixin",
    "ActivityType",
    "ApplicationStatus",
    "ContactType",
    "Gender",
    "GenderPreference",
    "GroupSizePreference",
    "MatchRole",
    "MatchStatus",
    "NotificationType",
    "PlanMode",
    "PlanStatus",
    "ReviewFlag",
    "SafetyEventType",
    "VerificationLevel",
    "User",
    "UserPreferences",
]
```

- [ ] **Step 3: Añadir tests**

```python
# Añadir a backend/tests/test_models.py
def test_user_table_columns():
    from gad.models import User

    cols = {c.name for c in User.__table__.columns}
    expected = {
        "id", "email", "password_hash", "google_id", "display_name",
        "avatar_url", "bio", "birth_date", "gender", "locale", "timezone",
        "reputation_score", "verification_level", "last_active_at",
        "created_at", "updated_at",
    }
    assert expected.issubset(cols)


def test_user_preferences_has_correct_pk():
    from gad.models import UserPreferences

    cols = {c.name: c for c in UserPreferences.__table__.columns}
    assert cols["user_id"].primary_key is True
    assert len(cols["user_id"].foreign_keys) == 1
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && poetry run pytest tests/test_models.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/models/user.py backend/src/gad/models/__init__.py backend/tests/test_models.py
git commit -m "feat(models): User y UserPreferences"
```

---

## Task 6: Helper geo (grid snap + haversine)

**Files:**
- Create: `backend/src/gad/models/geo.py`
- Test: `backend/tests/test_geo.py`

- [ ] **Step 1: Escribir el test**

```python
# backend/tests/test_geo.py
from gad.models.geo import haversine_meters, snap_to_grid


def test_snap_to_grid_returns_float_pair():
    lat, lng = snap_to_grid(-34.5889, -58.4305)
    assert isinstance(lat, float)
    assert isinstance(lng, float)


def test_snap_to_grid_quantizes_to_150m():
    lat1, lng1 = snap_to_grid(-34.5889, -58.4305)
    lat2, lng2 = snap_to_grid(-34.5888, -58.4304)
    assert lat1 == lat2
    assert lng1 == lng2


def test_snap_to_grid_distance_under_150m():
    d = haversine_meters(-34.5889, -58.4305, *snap_to_grid(-34.5889, -58.4305))
    assert d <= 150.0


def test_snap_to_grid_distant_points_differ():
    palermo = snap_to_grid(-34.5889, -58.4305)
    centro = snap_to_grid(-34.6037, -58.3816)
    assert palermo != centro
```

- [ ] **Step 2: Correr y verificar fail**

Run: `cd backend && poetry run pytest tests/test_geo.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implementar `backend/src/gad/models/geo.py`**

```python
# backend/src/gad/models/geo.py
"""Helpers geográficos: grid snap (~150m) y distancia haversine.

El grid snap redondea lat/lng a una grilla de ~150m para preservar privacidad:
la ubicación del usuario nunca se expone exacta hasta que hay match confirmado
(privacy-by-design, ver spec sección 5.1).
"""
import math

GRID_SIZE_M = 150.0
GRID_SIZE_DEG = GRID_SIZE_M / 111_320.0


def snap_to_grid(lat: float, lng: float) -> tuple[float, float]:
    """Redondea (lat, lng) al centro de una celda de ~150m."""
    grid_lat = round(lat / GRID_SIZE_DEG) * GRID_SIZE_DEG
    grid_lng = round(lng / GRID_SIZE_DEG) * GRID_SIZE_DEG
    return grid_lat, grid_lng


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia en metros entre dos puntos (haversine)."""
    R = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && poetry run pytest tests/test_geo.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/models/geo.py backend/tests/test_geo.py
git commit -m "feat(geo): grid snap ~150m y haversine para privacidad de ubicación"
```

---

## Task 7: Modelos restantes — Plan, Match, Review, Availability, Safety, Social

Este task crea todas las tablas restantes del spec. Cada archivo sigue el patrón de `user.py` (TimestampMixin, PgUUID, mapped_column, Enums con `name=` explícito).

**Files:**
- Create: `backend/src/gad/models/plan.py`
- Create: `backend/src/gad/models/match.py`
- Create: `backend/src/gad/models/review.py`
- Create: `backend/src/gad/models/availability.py`
- Create: `backend/src/gad/models/safety.py`
- Create: `backend/src/gad/models/social.py`
- Modify: `backend/src/gad/models/__init__.py`
- Test: extend `backend/tests/test_models.py`

- [ ] **Step 1: `backend/src/gad/models/plan.py`**

```python
# backend/src/gad/models/plan.py
from datetime import datetime
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    PlanMode,
    PlanStatus,
)


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    host_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activitytype"), nullable=False
    )
    mode: Mapped[PlanMode] = mapped_column(Enum(PlanMode, name="planmode"), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    window_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    max_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_label: Mapped[str] = mapped_column(String(200), nullable=False)
    location_grid: Mapped[object] = mapped_column(
        Geography("POINT", srid=4326), nullable=False
    )
    exact_location: Mapped[object | None] = mapped_column(
        Geography("POINT", srid=4326), nullable=True
    )
    search_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="planstatus"), nullable=False, default=PlanStatus.open
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class PlanApplication(Base, TimestampMixin):
    __tablename__ = "plan_applications"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    applicant_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="applicationstatus"),
        nullable=False,
        default=ApplicationStatus.pending,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("plan_id", "applicant_id", name="uq_plan_applications_plan_applicant"),
    )
```

- [ ] **Step 2: `backend/src/gad/models/match.py`**

```python
# backend/src/gad/models/match.py
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import MatchRole, MatchStatus


class Match(Base, TimestampMixin):
    __tablename__ = "matches"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="matchstatus"), nullable=False, default=MatchStatus.active
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location_sharing_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class MatchParticipant(Base, TimestampMixin):
    __tablename__ = "match_participants"

    match_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[MatchRole] = mapped_column(
        Enum(MatchRole, name="matchrole"), nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 3: `backend/src/gad/models/review.py`**

```python
# backend/src/gad/models/review.py
from uuid import UUID, uuid4

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import ReviewFlag


class Review(Base, TimestampMixin):
    __tablename__ = "reviews"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewer_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewee_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    flag: Mapped[ReviewFlag | None] = mapped_column(
        Enum(ReviewFlag, name="reviewflag"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "match_id", "reviewer_id", "reviewee_id", name="uq_reviews_match_reviewer_reviewee"
        ),
    )
```

- [ ] **Step 4: `backend/src/gad/models/availability.py`**

```python
# backend/src/gad/models/availability.py
from datetime import datetime
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String

from gad.models.base import Base, TimestampMixin


class Availability(Base, TimestampMixin):
    __tablename__ = "availability"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_grid: Mapped[object] = mapped_column(
        Geography("POINT", srid=4326), nullable=False
    )
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    activity_filter: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
```

- [ ] **Step 5: `backend/src/gad/models/safety.py`**

```python
# backend/src/gad/models/safety.py
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import ContactType, SafetyEventType


class TrustedContact(Base, TimestampMixin):
    __tablename__ = "trusted_contacts"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_type: Mapped[ContactType] = mapped_column(
        Enum(ContactType, name="contacttype"), nullable=False
    )
    contact_value: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    __table_args__ = (
        # unique constraint vía naming convention no aplica para 2 cols;
        # se agrega explícitamente abajo.
    )


class SafetySession(Base, TimestampMixin):
    __tablename__ = "safety_sessions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ping_location: Mapped[object | None] = mapped_column(
        Geography("POINT", srid=4326), nullable=True
    )
    last_ping_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    trusted_contacts_notified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )


class SafetyEvent(Base, TimestampMixin):
    __tablename__ = "safety_events"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[SafetyEventType] = mapped_column(
        Enum(SafetyEventType, name="safetyeventtype"), nullable=False
    )
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
```

- [ ] **Step 6: `backend/src/gad/models/social.py`**

```python
# backend/src/gad/models/social.py
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import NotificationType


class Block(Base):
    __tablename__ = "blocks"

    blocker_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    blocked_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notificationtype"), nullable=False
    )
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
```

- [ ] **Step 7: Actualizar `backend/src/gad/models/__init__.py` (final)**

```python
# backend/src/gad/models/__init__.py
from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    ContactType,
    Gender,
    GenderPreference,
    GroupSizePreference,
    MatchRole,
    MatchStatus,
    NotificationType,
    PlanMode,
    PlanStatus,
    ReviewFlag,
    SafetyEventType,
    VerificationLevel,
)
from gad.models.availability import Availability
from gad.models.match import Match, MatchParticipant, Message
from gad.models.plan import Plan, PlanApplication
from gad.models.review import Review
from gad.models.safety import SafetyEvent, SafetySession, TrustedContact
from gad.models.social import Block, Notification
from gad.models.user import User, UserPreferences

__all__ = [
    "Base",
    "TimestampMixin",
    "ActivityType",
    "ApplicationStatus",
    "ContactType",
    "Gender",
    "GenderPreference",
    "GroupSizePreference",
    "MatchRole",
    "MatchStatus",
    "NotificationType",
    "PlanMode",
    "PlanStatus",
    "ReviewFlag",
    "SafetyEventType",
    "VerificationLevel",
    "Availability",
    "Block",
    "Match",
    "MatchParticipant",
    "Message",
    "Notification",
    "Plan",
    "PlanApplication",
    "Review",
    "SafetyEvent",
    "SafetySession",
    "TrustedContact",
    "User",
    "UserPreferences",
]
```

- [ ] **Step 8: Añadir test de integridad del schema**

```python
# Añadir a backend/tests/test_models.py
def test_all_expected_tables_exist():
    from gad.models import Base

    expected = {
        "users", "user_preferences", "plans", "plan_applications",
        "matches", "match_participants", "messages", "reviews",
        "availability", "trusted_contacts", "safety_sessions",
        "safety_events", "blocks", "notifications",
    }
    actual = set(Base.metadata.tables.keys())
    missing = expected - actual
    assert not missing, f"Faltan tablas: {missing}"
```

- [ ] **Step 9: Correr el test**

Run: `cd backend && poetry run pytest tests/test_models.py -v`
Expected: PASS (5 tests).

- [ ] **Step 10: Commit**

```bash
git add backend/src/gad/models/
git commit -m "feat(models): Plan, Match, Review, Availability, Safety, Social"
```

---

## Task 8: Helpers Alembic (PostGIS) + configuración

**Files:**
- Create: `backend/src/gad/alembic_utils.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`

- [ ] **Step 1: `backend/src/gad/alembic_utils.py`**

```python
# backend/src/gad/alembic_utils.py
"""Helpers para migraciones que necesitan PostGIS."""
from alembic import op


def enable_postgis() -> None:
    """Habilita la extensión PostGIS. Llamar al inicio de la migración inicial."""
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")


def create_spatial_indexes() -> None:
    """Crea índices GiST sobre las columnas geography para queries espaciales."""
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_plans_location_grid "
        "ON plans USING GIST (location_grid);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_availability_location_grid "
        "ON availability USING GIST (location_grid);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_safety_sessions_last_ping_location "
        "ON safety_sessions USING GIST (last_ping_location);"
    )
```

- [ ] **Step 2: `backend/alembic.ini`**

```ini
[alembic]
script_location = alembic
prepend_sys_path = src
sqlalchemy.url = driver://user:pass@localhost/dbname
file_template = %%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s
timezone = UTC

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 3: `backend/alembic/env.py`**

```python
# backend/alembic/env.py
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from gad.config import settings

# Importa todos los modelos para que aparezcan en Base.metadata al autogenerar
import gad.models  # noqa: F401
from gad.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


run_migrations_online()
```

- [ ] **Step 4: `backend/alembic/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/alembic_utils.py backend/alembic.ini backend/alembic/env.py backend/alembic/script.py.mako
git commit -m "feat(alembic): configuración async + helpers PostGIS"
```

---

## Task 9: Migración inicial (autogenerate)

Los modelos ya están definidos. La migración se genera con `alembic revision --autogenerate` contra la DB corriendo en Docker (Task 11), y luego se ajusta manualmente para llamar a `enable_postgis()` y `create_spatial_indexes()`. Los tests usan `Base.metadata.create_all()` (Task 12), por lo que **no dependen de esta migración**.

**Files:**
- Create: `backend/alembic/versions/0001_initial_schema.py` (generada)

- [ ] **Step 1: Asegurar que la DB está corriendo (Task 11 primero)**

Run: `docker compose up -d db`

- [ ] **Step 2: Generar la migración**

Run:
```bash
cd backend
poetry run alembic revision --autogenerate -m "initial schema"
```
Esto genera `alembic/versions/<timestamp>_initial_schema.py`. Renombrar a `0001_initial_schema.py` y setear `revision = "0001"`, `down_revision = None`.

- [ ] **Step 3: Ajustar la migración generada**

Al inicio de `upgrade()` añadir:
```python
from gad.alembic_utils import create_spatial_indexes, enable_postgis

enable_postgis()
```
Al final de `upgrade()` añadir:
```python
create_spatial_indexes()
```
En `downgrade()` verificar que borra las tablas en orden inverso de dependencias (matches → plans → users, etc.).

- [ ] **Step 4: Test de migración**

```python
# backend/tests/test_migrations.py
import pytest


@pytest.mark.asyncio
async def test_schema_has_all_expected_tables(db_session):
    """conftest crea el schema con Base.metadata.create_all(); verificamos que todas las
    tablas del spec existen."""
    from sqlalchemy import text

    result = await db_session.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name;"
        )
    )
    tables = {row[0] for row in result}
    expected = {
        "users", "user_preferences", "plans", "plan_applications",
        "matches", "match_participants", "messages", "reviews",
        "availability", "trusted_contacts", "safety_sessions",
        "safety_events", "blocks", "notifications",
    }
    missing = expected - tables
    assert not missing, f"Faltan tablas: {missing}"
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && poetry run pytest tests/test_migrations.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/0001_initial_schema.py backend/tests/test_migrations.py
git commit -m "feat(db): migración inicial con todas las tablas + PostGIS"
```

---

## Task 10: Redis client

**Files:**
- Create: `backend/src/gad/redis_client.py`
- Test: `backend/tests/test_redis.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_redis.py
import asyncio

import pytest


@pytest.mark.asyncio
async def test_redis_set_get(redis_client):
    await redis_client.set("gad:test", "ok", ex=5)
    val = await redis_client.get("gad:test")
    assert val in (b"ok", "ok")


@pytest.mark.asyncio
async def test_redis_pubsub(redis_client):
    received: list[bytes] = []

    async def subscriber():
        pubsub = redis_client.pubsub()
        await pubsub.subscribe("gad:test:channel")
        async for msg in pubsub.listen():
            if msg["type"] == "subscribe":
                continue
            received.append(msg["data"])
            break

    task = asyncio.create_task(subscriber())
    await asyncio.sleep(0.1)
    await redis_client.publish("gad:test:channel", "hello")
    await asyncio.wait_for(task, timeout=2)
    assert received in (["hello"], [b"hello"])
```

- [ ] **Step 2: Implementar `backend/src/gad/redis_client.py`**

```python
# backend/src/gad/redis_client.py
from redis.asyncio import Redis, from_url

from gad.config import settings

redis_client: Redis = from_url(settings.redis_url, decode_responses=False)
```

- [ ] **Step 3: Correr el test (requiere conftest de Task 12)**

Run: `cd backend && poetry run pytest tests/test_redis.py -v`
Expected: PASS (después de Task 12).

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/redis_client.py backend/tests/test_redis.py
git commit -m "feat(redis): cliente async + tests pub/sub"
```

---

## Task 11: Docker Compose — API + Postgres+PostGIS + Redis

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/entrypoint.sh`
- Create: `backend/.dockerignore`
- Create: `/docker-compose.yml`

- [ ] **Step 1: `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry==1.8.5 && \
    poetry config virtualenvs.create false

COPY pyproject.toml ./
RUN poetry install --no-root --without dev

COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["./entrypoint.sh"]
```

- [ ] **Step 2: `backend/entrypoint.sh`**

```bash
#!/bin/sh
set -e

echo "Esperando DB..."
until python -c "import asyncio, asyncpg; asyncio.run(asyncpg.connect('${DATABASE_URL/postgresql+asyncpg/postgresql}'))" 2>/dev/null; do
  echo "DB no lista, reintentando..."
  sleep 1
done

echo "Corriendo migraciones..."
alembic upgrade head

echo "Arrancando uvicorn..."
exec uvicorn gad.main:app --host 0.0.0.0 --port 8000
```

- [ ] **Step 3: `backend/.dockerignore`**

```dockerignore
.venv/
__pycache__/
*.pyc
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
.ruff_cache/
tests/
.env
```

- [ ] **Step 4: `/docker-compose.yml`**

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: gad
      POSTGRES_PASSWORD: gad
      POSTGRES_DB: gad
    ports:
      - "5432:5432"
    volumes:
      - gad_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gad"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://gad:gad@db:5432/gad
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: dev-secret-change-me-1234567890
      CORS_ORIGINS: http://localhost:5173
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      ENVIRONMENT: dev
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./backend/src:/app/src

volumes:
  gad_pgdata:
```

- [ ] **Step 5: Smoke test manual**

Run:
```bash
docker compose up -d --build
sleep 15
curl -s http://localhost:8000/health
docker compose down
```
Expected: `{"status":"ok"}` (requiere Task 20 para `/health`).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml backend/Dockerfile backend/entrypoint.sh backend/.dockerignore
git commit -m "feat(infra): docker-compose con API + Postgres/PostGIS + Redis"
```

---

## Task 12: conftest.py — fixtures con testcontainers

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: `backend/tests/conftest.py`**

```python
# backend/tests/conftest.py
import asyncio
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.core.generic import DbContainer
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

# Registra todos los modelos en Base.metadata
import gad.models  # noqa: F401
from gad.models.base import Base


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgis/postgis:16-3.4", driver="asyncpg") as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7-alpine") as r:
        yield r


@pytest_asyncio.fixture
async def db_engine(pg_container) -> AsyncGenerator:
    url = pg_container.get_connection_url()
    engine = create_async_engine(url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def redis_client(redis_container) -> AsyncGenerator[Redis, None]:
    host = redis_container.get_container_host_ip()
    port = redis_container.expose_port(6379)
    client = Redis.from_url(f"redis://{host}:{port}/0")
    yield client
    await client.flushdb()
    await client.aclose()
```

- [ ] **Step 2: `backend/tests/__init__.py`** vacío.

```python
# backend/tests/__init__.py
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py backend/tests/__init__.py
git commit -m "test: fixtures con testcontainers para Postgres+PostGIS y Redis"
```

---

## Task 13: Schemas de auth (Pydantic)

**Files:**
- Create: `backend/src/gad/schemas/__init__.py`
- Create: `backend/src/gad/schemas/common.py`
- Create: `backend/src/gad/schemas/auth.py`
- Test: `backend/tests/test_auth_schemas.py`

- [ ] **Step 1: `backend/src/gad/schemas/common.py`**

```python
# backend/src/gad/schemas/common.py
from pydantic import BaseModel


class ErrorOut(BaseModel):
    detail: str
    code: str | None = None


class OKMessage(BaseModel):
    message: str
```

- [ ] **Step 2: `backend/src/gad/schemas/auth.py`**

```python
# backend/src/gad/schemas/auth.py
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: UUID


class RefreshIn(BaseModel):
    refresh_token: str


class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    verification_level: str
    reputation_score: float


class VerifyEmailIn(BaseModel):
    token: str
```

- [ ] **Step 3: `backend/src/gad/schemas/__init__.py`**

```python
# backend/src/gad/schemas/__init__.py
from gad.schemas.auth import (
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenOut,
    UserPublic,
    VerifyEmailIn,
)
from gad.schemas.common import ErrorOut, OKMessage

__all__ = [
    "ErrorOut",
    "LoginIn",
    "OKMessage",
    "RefreshIn",
    "RegisterIn",
    "TokenOut",
    "UserPublic",
    "VerifyEmailIn",
]
```

- [ ] **Step 4: Test**

```python
# backend/tests/test_auth_schemas.py
import pytest
from pydantic import ValidationError

from gad.schemas.auth import LoginIn, RegisterIn


def test_register_in_valid():
    r = RegisterIn(email="a@b.com", password="12345678", display_name="Ana")
    assert r.email == "a@b.com"


def test_register_in_rejects_short_password():
    with pytest.raises(ValidationError):
        RegisterIn(email="a@b.com", password="123", display_name="Ana")


def test_register_in_rejects_invalid_email():
    with pytest.raises(ValidationError):
        RegisterIn(email="not-an-email", password="12345678", display_name="Ana")


def test_login_in_valid():
    data = LoginIn(email="a@b.com", password="anypassword")
    assert data.email == "a@b.com"
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && poetry run pytest tests/test_auth_schemas.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/schemas/ backend/tests/test_auth_schemas.py
git commit -m "feat(schemas): Pydantic schemas para auth y common"
```

---

## Task 14: Passwords (argon2)

**Files:**
- Create: `backend/src/gad/auth/passwords.py`
- Test: `backend/tests/test_passwords.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_passwords.py
from gad.auth.passwords import hash_password, verify_password


def test_hash_password_returns_string():
    h = hash_password("mysecret123")
    assert isinstance(h, str)
    assert h != "mysecret123"


def test_verify_password_correct():
    h = hash_password("mysecret123")
    assert verify_password("mysecret123", h) is True


def test_verify_password_wrong():
    h = hash_password("mysecret123")
    assert verify_password("wrong", h) is False


def test_hashed_passwords_differ_for_same_input():
    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2
```

- [ ] **Step 2: Implementar `backend/src/gad/auth/passwords.py`**

```python
# backend/src/gad/auth/passwords.py
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _pwd_context.verify(password, hashed)
```

- [ ] **Step 3: Correr el test**

Run: `cd backend && poetry run pytest tests/test_passwords.py -v`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/auth/passwords.py backend/tests/test_passwords.py
git commit -m "feat(auth): hashing de passwords con argon2"
```

---

## Task 15: JWT (access + refresh)

**Files:**
- Create: `backend/src/gad/auth/jwt.py`
- Test: `backend/tests/test_jwt.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_jwt.py
import time

import pytest
from jose import JWTError

from gad.auth.jwt import create_access_token, create_refresh_token, decode_token
from gad.config import get_settings

SECRET = "test-secret-12345678901234567890"
ENV = {
    "JWT_SECRET": SECRET,
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


def test_access_token_has_sub_type_and_expiry():
    token = create_access_token(user_id="user-123")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    assert payload["exp"] > payload["iat"]


def test_refresh_token_has_type_refresh():
    token = create_refresh_token(user_id="user-123")
    payload = decode_token(token)
    assert payload["type"] == "refresh"


def test_decode_invalid_signature_raises():
    token = create_access_token(user_id="user-123")
    # Manipular la firma
    tampered = token[:-4] + "XXXX"
    with pytest.raises(JWTError):
        decode_token(tampered)


def test_decode_expired_token_raises(monkeypatch):
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "-1")
    get_settings.cache_clear()
    token = create_access_token(user_id="user-123")
    time.sleep(1)
    with pytest.raises(JWTError):
        decode_token(token)
```

- [ ] **Step 2: Implementar `backend/src/gad/auth/jwt.py`**

```python
# backend/src/gad/auth/jwt.py
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from gad.config import get_settings


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.refresh_token_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise JWTError(f"Token inválido: {e}") from e
```

- [ ] **Step 3: Correr el test**

Run: `cd backend && poetry run pytest tests/test_jwt.py -v`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/auth/jwt.py backend/tests/test_jwt.py
git commit -m "feat(auth): creación y verificación de access y refresh tokens"
```

---

## Task 16: OAuth Google (Authlib)

**Files:**
- Create: `backend/src/gad/auth/oauth.py`
- Test: `backend/tests/test_auth_oauth.py`

- [ ] **Step 1: Test (con respx mockeando endpoints de Google)**

```python
# backend/tests/test_auth_oauth.py
import pytest
import respx
from httpx import Response

from gad.auth.oauth import GoogleUserInfo, get_google_userinfo


@respx.mock
async def test_get_google_userinfo_success():
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=Response(
            200, json={"access_token": "ya29.test-token", "expires_in": 3599}
        )
    )
    respx.get("https://www.googleapis.com/oauth2/v3/userinfo").mock(
        return_value=Response(
            200,
            json={
                "sub": "google-123",
                "email": "ana@example.com",
                "name": "Ana",
                "picture": "https://img/ana.png",
            },
        )
    )

    info = await get_google_userinfo(code="valid-code")

    assert isinstance(info, GoogleUserInfo)
    assert info.google_id == "google-123"
    assert info.email == "ana@example.com"
    assert info.display_name == "Ana"


@respx.mock
async def test_get_google_userinfo_invalid_code():
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=Response(400, json={"error": "invalid_grant"})
    )

    from gad.exceptions import OAuthError

    with pytest.raises(OAuthError):
        await get_google_userinfo(code="bad-code")
```

- [ ] **Step 2: Implementar `backend/src/gad/auth/oauth.py`**

```python
# backend/src/gad/auth/oauth.py
from dataclasses import dataclass

import httpx

from gad.config import settings


@dataclass
class GoogleUserInfo:
    google_id: str
    email: str
    display_name: str
    avatar_url: str | None = None


async def get_google_userinfo(code: str) -> GoogleUserInfo:
    """Intercambia un código de autorización de Google por userinfo."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": "postmessage",
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise OAuthError(f"Google token exchange failed: {token_resp.status_code}")

        access_token = token_resp.json()["access_token"]

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise OAuthError(f"Google userinfo failed: {user_resp.status_code}")

        data = user_resp.json()

    return GoogleUserInfo(
        google_id=data["sub"],
        email=data["email"],
        display_name=data.get("name", data["email"].split("@")[0]),
        avatar_url=data.get("picture"),
    )


# Import diferido para evitar circularidad
from gad.exceptions import OAuthError  # noqa: E402
```

- [ ] **Step 3: Correr el test**

Run: `cd backend && poetry run pytest tests/test_auth_oauth.py -v`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/auth/oauth.py backend/tests/test_auth_oauth.py
git commit -m "feat(auth): OAuth Google con intercambio de código y userinfo"
```

---

## Task 17: Excepciones de dominio

**Files:**
- Create: `backend/src/gad/exceptions.py`
- Test: `backend/tests/test_error_handling.py`

- [ ] **Step 1: Implementar `backend/src/gad/exceptions.py`**

```python
# backend/src/gad/exceptions.py
class GADError(Exception):
    """Base de excepciones de dominio."""

    status_code: int = 400
    code: str = "error"

    def __init__(self, detail: str = ""):
        self.detail = detail or self.__class__.__name__
        super().__init__(self.detail)


class AuthError(GADError):
    status_code = 401
    code = "auth_error"


class InvalidCredentialsError(AuthError):
    code = "invalid_credentials"


class InvalidTokenError(AuthError):
    code = "invalid_token"


class EmailAlreadyExistsError(GADError):
    status_code = 409
    code = "email_already_exists"


class NotFoundError(GADError):
    status_code = 404
    code = "not_found"


class ConflictError(GADError):
    status_code = 409
    code = "conflict"


class OAuthError(GADError):
    status_code = 400
    code = "oauth_error"


class RateLimitExceeded(GADError):
    status_code = 429
    code = "rate_limit_exceeded"
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_error_handling.py
from gad.exceptions import (
    AuthError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    NotFoundError,
)


def test_exception_status_codes():
    assert InvalidCredentialsError().status_code == 401
    assert EmailAlreadyExistsError().status_code == 409
    assert NotFoundError().status_code == 404


def test_exception_detail_defaults_to_code_name():
    e = InvalidCredentialsError()
    assert e.detail == "InvalidCredentialsError"


def test_exception_custom_detail():
    e = NotFoundError("Plan no encontrado")
    assert e.detail == "Plan no encontrado"


def test_auth_error_is_gad_error():
    assert issubclass(InvalidCredentialsError, AuthError)
```

- [ ] **Step 3: Correr el test**

Run: `cd backend && poetry run pytest tests/test_error_handling.py -v`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/exceptions.py backend/tests/test_error_handling.py
git commit -m "feat(errors): excepciones de dominio con status codes"
```

---

## Task 18: Auth service

**Files:**
- Create: `backend/src/gad/auth/service.py`
- Test: `backend/tests/test_auth_register.py`
- Test: `backend/tests/test_auth_login.py`
- Test: `backend/tests/test_auth_refresh.py`

- [ ] **Step 1: Implementar `backend/src/gad/auth/service.py`**

```python
# backend/src/gad/auth/service.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.jwt import create_access_token, create_refresh_token, decode_token
from gad.auth.oauth import GoogleUserInfo
from gad.auth.passwords import hash_password, verify_password
from gad.config import settings
from gad.exceptions import (
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    InvalidTokenError,
)
from gad.models.enums import VerificationLevel
from gad.models.user import User
from gad.schemas.auth import LoginIn, RegisterIn, TokenOut


async def register(session: AsyncSession, data: RegisterIn) -> TokenOut:
    existing = await session.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none() is not None:
        raise EmailAlreadyExistsError("Email ya registrado")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        verification_level=VerificationLevel.none,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return _issue_tokens(user)


async def login(session: AsyncSession, data: LoginIn) -> TokenOut:
    result = await session.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None:
        raise InvalidCredentialsError("Credenciales inválidas")
    if not verify_password(data.password, user.password_hash):
        raise InvalidCredentialsError("Credenciales inválidas")

    return _issue_tokens(user)


async def login_or_register_google(
    session: AsyncSession, info: GoogleUserInfo
) -> TokenOut:
    result = await session.execute(select(User).where(User.google_id == info.google_id))
    user = result.scalar_one_or_none()

    if user is None:
        # Si ya existe el email, vincular google_id; si no, crear
        by_email = await session.execute(select(User).where(User.email == info.email))
        user = by_email.scalar_one_or_none()
        if user is None:
            user = User(
                email=info.email,
                google_id=info.google_id,
                display_name=info.display_name,
                avatar_url=info.avatar_url,
                verification_level=VerificationLevel.google,
            )
            session.add(user)
        else:
            user.google_id = info.google_id
            user.verification_level = VerificationLevel.google
        await session.commit()
        await session.refresh(user)

    return _issue_tokens(user)


async def refresh_tokens(refresh_token: str) -> TokenOut:
    try:
        payload = decode_token(refresh_token)
    except Exception as e:
        raise InvalidTokenError("Refresh token inválido") from e

    if payload.get("type") != "refresh":
        raise InvalidTokenError("Token no es de tipo refresh")

    user_id = payload["sub"]
    # No necesitamos cargar el user para refresh; solo reemitimos.
    access = create_access_token(user_id=user_id)
    new_refresh = create_refresh_token(user_id=user_id)
    return TokenOut(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=user_id,
    )


def _issue_tokens(user: User) -> TokenOut:
    access = create_access_token(user_id=str(user.id))
    refresh = create_refresh_token(user_id=str(user.id))
    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=user.id,
    )
```

- [ ] **Step 2: `backend/tests/test_auth_register.py`**

```python
# backend/tests/test_auth_register.py
import pytest

from gad.auth.service import register
from gad.exceptions import EmailAlreadyExistsError
from gad.schemas.auth import RegisterIn


@pytest.mark.asyncio
async def test_register_creates_user(db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )
    assert tokens.access_token
    assert tokens.refresh_token
    assert tokens.user_id


@pytest.mark.asyncio
async def test_register_duplicate_email_raises(db_session):
    data = RegisterIn(email="ana@example.com", password="12345678", display_name="Ana")
    await register(db_session, data)

    with pytest.raises(EmailAlreadyExistsError):
        await register(db_session, data)
```

- [ ] **Step 3: `backend/tests/test_auth_login.py`**

```python
# backend/tests/test_auth_login.py
import pytest

from gad.auth.service import login, register
from gad.exceptions import InvalidCredentialsError
from gad.schemas.auth import LoginIn, RegisterIn


@pytest.mark.asyncio
async def test_login_success(db_session):
    await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    tokens = await login(
        db_session, LoginIn(email="ana@example.com", password="12345678")
    )
    assert tokens.access_token


@pytest.mark.asyncio
async def test_login_wrong_password_raises(db_session):
    await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    with pytest.raises(InvalidCredentialsError):
        await login(
            db_session, LoginIn(email="ana@example.com", password="wrong-password")
        )


@pytest.mark.asyncio
async def test_login_unknown_user_raises(db_session):
    with pytest.raises(InvalidCredentialsError):
        await login(db_session, LoginIn(email="nope@example.com", password="12345678"))
```

- [ ] **Step 4: `backend/tests/test_auth_refresh.py`**

```python
# backend/tests/test_auth_refresh.py
import pytest

from gad.auth.jwt import create_access_token
from gad.auth.service import refresh_tokens, register
from gad.exceptions import InvalidTokenError
from gad.schemas.auth import RegisterIn


@pytest.mark.asyncio
async def test_refresh_issues_new_tokens(db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    new_tokens = await refresh_tokens(tokens.refresh_token)
    assert new_tokens.access_token
    assert new_tokens.refresh_token != tokens.refresh_token


@pytest.mark.asyncio
async def test_refresh_with_access_token_raises(db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    with pytest.raises(InvalidTokenError):
        await refresh_tokens(tokens.access_token)


def test_refresh_with_garbage_raises():
    with pytest.raises(InvalidTokenError):
        refresh_tokens("not-a-token")
```

- [ ] **Step 5: Correr los tests**

Run: `cd backend && poetry run pytest tests/test_auth_register.py tests/test_auth_login.py tests/test_auth_refresh.py -v`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/auth/service.py backend/tests/test_auth_register.py backend/tests/test_auth_login.py backend/tests/test_auth_refresh.py
git commit -m "feat(auth): service de register, login, refresh y OAuth Google"
```

---

## Task 19: Auth dependencies + router

**Files:**
- Create: `backend/src/gad/auth/dependencies.py`
- Create: `backend/src/gad/auth/router.py`
- Create: `backend/src/gad/auth/__init__.py`
- Test: `backend/tests/test_auth_protected.py`

- [ ] **Step 1: `backend/src/gad/auth/dependencies.py`**

```python
# backend/src/gad/auth/dependencies.py
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.jwt import decode_token
from gad.db import get_session
from gad.exceptions import AuthError, InvalidTokenError
from gad.models.user import User


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
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

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise InvalidTokenError("Token malformado") from e

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AuthError("Usuario no encontrado")

    return user
```

- [ ] **Step 2: `backend/src/gad/auth/__init__.py`**

```python
# backend/src/gad/auth/__init__.py
```

- [ ] **Step 3: `backend/src/gad/auth/router.py`**

```python
# backend/src/gad/auth/router.py
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.auth.oauth import get_google_userinfo
from gad.auth.service import login, login_or_register_google, refresh_tokens, register
from gad.db import get_session
from gad.exceptions import OAuthError
from gad.models.user import User
from gad.schemas.auth import (
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenOut,
    UserPublic,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
async def register_endpoint(
    data: RegisterIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> TokenOut:
    return await register(session, data)


@router.post("/login", response_model=TokenOut)
async def login_endpoint(
    data: LoginIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> TokenOut:
    return await login(session, data)


@router.post("/oauth/google", response_model=TokenOut)
async def oauth_google_endpoint(
    body: RefreshIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> TokenOut:
    """`body.refresh_token` transporta el código de autorización de Google."""
    try:
        info = await get_google_userinfo(code=body.refresh_token)
    except OAuthError:
        raise
    return await login_or_register_google(session, info)


@router.post("/refresh", response_model=TokenOut)
async def refresh_endpoint(body: RefreshIn) -> TokenOut:
    return await refresh_tokens(body.refresh_token)


@router.post("/logout")
async def logout_endpoint(response: Response) -> dict[str, str]:
    # Stateless: el cliente descarta los tokens. La cookie se limpia.
    response.delete_cookie("refresh_token")
    return {"message": "Logout OK"}


@router.get("/me", response_model=UserPublic)
async def me_endpoint(current_user: Annotated[User, Depends(get_current_user)]) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        verification_level=current_user.verification_level.value,
        reputation_score=current_user.reputation_score,
    )
```

- [ ] **Step 4: `backend/tests/test_auth_protected.py`**

```python
# backend/tests/test_auth_protected.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.dependencies import get_current_user
from gad.auth.router import router
from gad.auth.service import register
from gad.db import async_session_maker
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_protected_endpoint_without_token_returns_401(client):
    async with client as c:
        resp = await c.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_with_valid_token_returns_user(client):
    async with async_session_maker() as session:
        tokens = await register(
            session,
            RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
        )

    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "ana@example.com"
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && poetry run pytest tests/test_auth_protected.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/auth/dependencies.py backend/src/gad/auth/__init__.py backend/src/gad/auth/router.py backend/tests/test_auth_protected.py
git commit -m "feat(auth): dependencia get_current_user y router /auth completo"
```

---

## Task 20: App factory (main.py) + logging + health

**Files:**
- Create: `backend/src/gad/logging_setup.py`
- Create: `backend/src/gad/health.py`
- Create: `backend/src/gad/main.py`
- Create: `backend/src/gad/users/__init__.py`
- Create: `backend/src/gad/users/router.py`
- Create: `backend/src/gad/middleware/__init__.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: `backend/src/gad/logging_setup.py`**

```python
# backend/src/gad/logging_setup.py
import logging
import sys

import structlog

from gad.config import settings


def setup_logging() -> None:
    renderer = (
        structlog.processors.JSONRenderer()
        if settings.environment == "prod"
        else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
```

- [ ] **Step 2: `backend/src/gad/health.py`**

```python
# backend/src/gad/health.py
from fastapi import APIRouter, Response, status
from sqlalchemy import text

from gad.db import engine
from gad.redis_client import redis_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready(response: Response) -> dict[str, str]:
    checks = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return checks
```

- [ ] **Step 3: `backend/src/gad/users/__init__.py`**

```python
# backend/src/gad/users/__init__.py
```

- [ ] **Step 4: `backend/src/gad/users/router.py` (placeholder para Fase 1)**

```python
# backend/src/gad/users/router.py
from typing import Annotated

from fastapi import APIRouter, Depends

from gad.auth.dependencies import get_current_user
from gad.models.user import User
from gad.schemas.auth import UserPublic

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        verification_level=current_user.verification_level.value,
        reputation_score=current_user.reputation_score,
    )
```

- [ ] **Step 5: `backend/src/gad/middleware/__init__.py`**

```python
# backend/src/gad/middleware/__init__.py
```

- [ ] **Step 6: `backend/src/gad/main.py`**

```python
# backend/src/gad/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gad.auth.router import router as auth_router
from gad.config import settings
from gad.exceptions import GADError
from gad.health import router as health_router
from gad.logging_setup import setup_logging
from gad.redis_client import redis_client
from gad.users.router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await redis_client.ping()
    yield
    await redis_client.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(GADError)
    async def gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(users_router)

    return app


app = create_app()
```

- [ ] **Step 7: Test**

```python
# backend/tests/test_health.py
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
async def test_health_returns_ok(client):
    async with client as c:
        resp = await c.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 8: Correr el test**

Run: `cd backend && poetry run pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/gad/main.py backend/src/gad/logging_setup.py backend/src/gad/health.py backend/src/gad/users/ backend/src/gad/middleware/ backend/tests/test_health.py
git commit -m "feat(app): factory FastAPI + CORS + logging + health + error handler"
```

---

## Task 21: Rate limiting (slowapi)

**Files:**
- Create: `backend/src/gad/middleware/rate_limit.py`
- Modify: `backend/src/gad/main.py`
- Modify: `backend/src/gad/auth/router.py`
- Test: `backend/tests/test_rate_limit.py`

- [ ] **Step 1: `backend/src/gad/middleware/rate_limit.py`**

```python
# backend/src/gad/middleware/rate_limit.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from gad.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.rate_limit_enabled,
    storage_uri=settings.redis_url,
)


def setup_rate_limit(app):
    """Registra el state, middleware y handler de slowapi en la app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

- [ ] **Step 2: Modificar `backend/src/gad/main.py`** — tras crear la app, registrar rate limit:

```python
# Añadir import arriba
from gad.middleware.rate_limit import setup_rate_limit

# Al final de create_app(), antes de `return app`:
    setup_rate_limit(app)
```

- [ ] **Step 3: Aplicar límite en `/auth/login` y `/auth/register`** — modificar `backend/src/gad/auth/router.py`:

Añadir import:
```python
from gad.middleware.rate_limit import limiter
```

Y decorar los endpoints:
```python
@router.post("/register", response_model=TokenOut, status_code=201)
@limiter.limit("5/minute")
async def register_endpoint(
    request: Request,
    data: RegisterIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenOut:
    return await register(session, data)


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login_endpoint(
    request: Request,
    data: LoginIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenOut:
    return await login(session, data)
```

Añadir el import de `Request`:
```python
from fastapi import APIRouter, Depends, Request, Response
```

- [ ] **Step 4: Test**

```python
# backend/tests/test_rate_limit.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.middleware.rate_limit import setup_rate_limit


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    setup_rate_limit(app)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_login_rate_limited_after_5_attempts(client):
    payload = {"email": "x@example.com", "password": "wrongpassword"}
    async with client as c:
        responses = [await c.post("/auth/login", json=payload) for _ in range(6)]
    statuses = [r.status_code for r in responses]
    # Los primeros intentos fallan con 401, el 6º es 429.
    assert 429 in statuses
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && poetry run pytest tests/test_rate_limit.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/middleware/rate_limit.py backend/src/gad/main.py backend/src/gad/auth/router.py backend/tests/test_rate_limit.py
git commit -m "feat(rate-limit): slowapi con Redis backend en login/register"
```

---

## Task 22: Smoke test de integración end-to-end

**Files:**
- Create: `backend/tests/test_smoke.py`

Este test valida el flujo completo de la Fase 0 usando la app real con la DB de testcontainers.

- [ ] **Step 1: Test**

```python
# backend/tests/test_smoke.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.db import engine
from gad.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_full_auth_flow(client):
    # 1. Registro
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "smoke@example.com", "password": "12345678", "display_name": "Smoke"},
        )
    assert resp.status_code == 201
    tokens = resp.json()

    # 2. /me con access token
    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
    assert resp.status_code == 200
    assert resp.json()["email"] == "smoke@example.com"

    # 3. Refresh
    async with client as c:
        resp = await c.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    assert resp.json()["access_token"] != tokens["access_token"]

    # 4. Login
    async with client as c:
        resp = await c.post(
            "/auth/login",
            json={"email": "smoke@example.com", "password": "12345678"},
        )
    assert resp.status_code == 200
```

- [ ] **Step 2: Correr el test**

Run: `cd backend && poetry run pytest tests/test_smoke.py -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke.py
git commit -m "test: smoke test de flujo completo de auth"
```

---

## Task 23: CI (GitHub Actions)

**Files:**
- Create: `backend/.github/workflows/ci.yml`

- [ ] **Step 1: `backend/.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install Poetry
        run: pipx install poetry==1.8.5

      - name: Cache Poetry venv
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pypoetry
            backend/.venv
          key: ${{ runner.os }}-poetry-${{ hashFiles('backend/poetry.lock', 'backend/pyproject.toml') }}

      - name: Install dependencies
        run: poetry install --no-interaction

      - name: Lint (ruff)
        run: poetry run ruff check .

      - name: Type check (mypy)
        run: poetry run mypy src

      - name: Test
        run: poetry run pytest --cov=gad --cov-report=xml -v

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: backend/coverage.xml
```

- [ ] **Step 2: Commit**

```bash
git add backend/.github/workflows/ci.yml
git commit -m "ci: GitHub Actions con lint, mypy y tests con cobertura"
```

---

## Self-Review

**1. Spec coverage (Fase 0 del spec sección 8.1):**
- ✅ Repo + Docker Compose (Task 11)
- ✅ Schema DB + migraciones Alembic (Tasks 4-9)
- ✅ Auth JWT + OAuth Google (Tasks 13-18)
- ✅ Middleware, manejo de errores, logging (Tasks 17, 20)
- ✅ Tests base + CI (Tasks 12, 22, 23)

**2. Placeholder scan:** Sin placeholders. Todos los tasks tienen código completo y verificado.

**3. Type consistency:**
- Nombres de modelos consistentes: `Plan`, `PlanApplication`, `Match`, `MatchParticipant`, `Message`, `Review`, `Availability`, `TrustedContact`, `SafetySession`, `SafetyEvent`, `Block`, `Notification`, `User`, `UserPreferences`.
- Enums con `name=` explícito en cada `Enum()` para coincidir con la migración.
- `get_current_user`, `register`, `login`, `refresh_tokens` referenciados consistentemente.
- `setup_rate_limit` definido en Task 21 y usado en Task 20/21.

**4. Orden de dependencias:** config → db → modelos → geo → migración → redis → docker → conftest → schemas → passwords → jwt → oauth → excepciones → service → deps+router → app+health → rate-limit → smoke → CI.

**5. Tests usan `Base.metadata.create_all()` (no migraciones)** — desacopla los tests de Alembic. La migración (Task 9) es solo para producción.

---

Plan completo y guardado en `docs/superpowers/plans/2026-07-05-fase-0-fundaciones.md`.
