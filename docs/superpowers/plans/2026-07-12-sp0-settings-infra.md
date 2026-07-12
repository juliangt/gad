# SP0 — Infraestructura de Settings + Auditoría (Plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la infraestructura de configuración global persistida en DB (override sobre env-vars), feature flags en caliente, modo mantenimiento/banner y auditoría de acciones admin — todo bajo `/admin/settings/*` protegido por `require_admin`.

**Architecture:** 4 tablas de dominio + 1 de auditoría (migración Alembic). Un `SettingsService` singleton cachea los settings en memoria y los combina con los defaults de `config.py` (DB > env-var). Feature flags y mantenimiento se aplican en runtime vía dependencias/middleware sin reinicio. Toda escritura registra un `AuditEvent`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, pytest + testcontainers (Postgres/Redis), argon2 (passlib).

**Spec de referencia:** `docs/superpowers/specs/2026-07-12-admin-panel-expansion-design.md` (Sub-proyecto 0).

---

## File Structure

**Crear (backend):**
- `backend/src/gad/models/settings.py` — modelos: `UserDefaults`, `OperationalSettings`, `FeatureFlag`, `MaintenanceState`, `AuditEvent`.
- `backend/src/gad/settings_cache.py` — `SettingsService` (lectura cacheada, override DB > env-var, invalidación).
- `backend/src/gad/admin/settings_schemas.py` — DTOs Pydantic de settings (`UserDefaultsIn/Out`, `OperationalSettingsOut`, `FeatureFlagOut`, `MaintenanceIn/Out`, `AuditEventOut`).
- `backend/src/gad/admin/settings_service.py` — lógica de lectura/escritura de settings + auditoría.
- `backend/src/gad/admin/settings_router.py` — endpoints `GET/PUT /admin/settings/*` y `GET /admin/settings/audit`.
- `backend/src/gad/middleware/maintenance.py` — `MaintenanceMiddleware` (503 cuando `enabled`).
- `backend/src/gad/feature_flags.py` — dependencia `require_feature(key)` + lista de flags.
- `backend/alembic/versions/0005_admin_settings_and_audit.py` — migración.
- `backend/tests/test_settings_service.py`, `backend/tests/test_admin_settings_router.py`, `backend/tests/test_maintenance_middleware.py`, `backend/tests/test_feature_flags.py`, `backend/tests/test_audit.py`.

**Modificar (backend):**
- `backend/src/gad/models/__init__.py` — registrar los nuevos modelos.
- `backend/src/gad/main.py` — registrar `settings_router`, `MaintenanceMiddleware`, inicializar singletons en `lifespan`.
- `backend/src/gad/middleware/rate_limit.py` — `enabled`/`default_limits` se leen del `SettingsService` (con fallback a `config.py`).
- `backend/src/gad/auth/jwt.py` — `create_access_token`/`create_refresh_token` aceptan `expires_in` opcional.
- `backend/src/gad/auth/service.py` — `_issue_tokens`/`refresh_tokens` leen expiración del `SettingsService`.
- `backend/src/gad/users/router.py` — validación de avatar usa `SettingsService.max_avatar_bytes()`.
- `backend/src/gad/chat/websocket.py` — rate limiter del WS lee `ws_max_message_rate` del `SettingsService`.
- `backend/src/gad/admin/router.py` — importar e incluir el `settings_router`.

---

## Task 1: Modelos de settings y auditoría

**Files:**
- Create: `backend/src/gad/models/settings.py`
- Test: `backend/tests/test_settings_models.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_settings_models.py`:

```python
import pytest
from sqlalchemy import select

from gad.models.settings import (
    AuditEvent,
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)


@pytest.mark.asyncio
async def test_singletons_have_fixed_pk_one(db_session):
    ud = UserDefaults(
        id=1,
        default_plan_validity_mins=120,
        default_search_radius_m=2000,
        age_range_min=18,
        age_range_max=99,
        group_size_preference="either",
        gender_preference="any",
        activity_types=["coffee", "drinks"],
    )
    db_session.add(ud)
    await db_session.commit()
    result = await db_session.execute(select(UserDefaults).where(UserDefaults.id == 1))
    assert result.scalar_one().default_plan_validity_mins == 120


@pytest.mark.asyncio
async def test_feature_flag_pk_is_key(db_session):
    db_session.add(FeatureFlag(key="reviews", enabled=True, description="x"))
    await db_session.commit()
    result = await db_session.execute(select(FeatureFlag).where(FeatureFlag.key == "reviews"))
    assert result.scalar_one().enabled is True


@pytest.mark.asyncio
async def test_maintenance_state_singleton(db_session):
    db_session.add(
        MaintenanceState(
            id=1,
            enabled=False,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="info",
        )
    )
    await db_session.commit()
    result = await db_session.execute(select(MaintenanceState).where(MaintenanceState.id == 1))
    assert result.scalar_one().enabled is False


@pytest.mark.asyncio
async def test_audit_event_stores_jsonb_detail(db_session):
    from uuid import uuid4

    actor = uuid4()
    ev = AuditEvent(
        actor_id=actor,
        action="settings.update",
        target_type="settings",
        target_id="operational",
        detail={"before": {"x": 1}, "after": {"x": 2}},
    )
    db_session.add(ev)
    await db_session.commit()
    result = await db_session.execute(select(AuditEvent).where(AuditEvent.action == "settings.update"))
    stored = result.scalar_one()
    assert stored.detail["after"]["x"] == 2
    assert stored.actor_id == actor
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'gad.models.settings'`.

- [ ] **Step 3: Write the models**

`backend/src/gad/models/settings.py`:

```python
# backend/src/gad/models/settings.py
from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin


class UserDefaults(Base, TimestampMixin):
    """Singleton (id fijo = 1): defaults aplicados a nuevos usuarios y como
    catálogo de actividades disponibles."""

    __tablename__ = "user_defaults"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    default_plan_validity_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    default_search_radius_m: Mapped[int] = mapped_column(Integer, nullable=False)
    age_range_min: Mapped[int] = mapped_column(Integer, nullable=False)
    age_range_max: Mapped[int] = mapped_column(Integer, nullable=False)
    group_size_preference: Mapped[str] = mapped_column(String(30), nullable=False)
    gender_preference: Mapped[str] = mapped_column(String(30), nullable=False)
    activity_types: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )


class OperationalSettings(Base, TimestampMixin):
    """Singleton (id fijo = 1): parámetros operativos editables en caliente."""

    __tablename__ = "operational_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    rate_limit_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    default_rate_limit: Mapped[str] = mapped_column(String(50), nullable=False)
    access_token_expire_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    refresh_token_expire_days: Mapped[int] = mapped_column(Integer, nullable=False)
    max_avatar_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    ws_max_message_rate: Mapped[int] = mapped_column(Integer, nullable=False)


class FeatureFlag(Base, TimestampMixin):
    """Una fila por flag. PK = key."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class MaintenanceState(Base, TimestampMixin):
    """Singleton (id fijo = 1): modo mantenimiento + banner global."""

    __tablename__ = "maintenance_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    banner_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    banner_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    banner_level: Mapped[str] = mapped_column(String(10), nullable=False, default="info")
    updated_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class AuditEvent(Base, TimestampMixin):
    """Registro de acciones administrativas sensibles."""

    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
```

- [ ] **Step 4: Register models in `__init__.py`**

Edit `backend/src/gad/models/__init__.py` — add imports after the venue imports and add to `__all__`:

```python
from gad.models.settings import (
    AuditEvent,
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
```

And in `__all__`, add (before the closing `]`):

```python
    "AuditEvent",
    "FeatureFlag",
    "MaintenanceState",
    "OperationalSettings",
    "UserDefaults",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_settings_models.py -v`
Expected: PASS (4 tests). The `db_session` fixture uses `Base.metadata.create_all`, so the new tables are created automatically by the registered models.

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/models/settings.py backend/src/gad/models/__init__.py backend/tests/test_settings_models.py
git commit -m "feat(settings): modelos de settings y auditoría (SP0-task1)"
```

---

## Task 2: SettingsService (override DB > env-var con cache)

**Files:**
- Create: `backend/src/gad/settings_cache.py`
- Test: `backend/tests/test_settings_service.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_settings_service.py`:

```python
import pytest

from gad.models.settings import (
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
from gad.settings_cache import SettingsService


async def _seed_singletons(db_session):
    db_session.add(
        UserDefaults(
            id=1,
            default_plan_validity_mins=120,
            default_search_radius_m=2000,
            age_range_min=18,
            age_range_max=99,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee", "drinks"],
        )
    )
    db_session.add(
        OperationalSettings(
            id=1,
            rate_limit_enabled=True,
            default_rate_limit="300/minute",
            access_token_expire_minutes=15,
            refresh_token_expire_days=7,
            max_avatar_bytes=5242880,
            ws_max_message_rate=5,
        )
    )
    db_session.add(
        MaintenanceState(
            id=1,
            enabled=False,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="info",
        )
    )
    db_session.add(FeatureFlag(key="reviews", enabled=True))
    db_session.add(FeatureFlag(key="venues_sponsors", enabled=False))
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_user_defaults_reads_db(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    ud = await svc.get_user_defaults()
    assert ud.default_plan_validity_mins == 120


@pytest.mark.asyncio
async def test_is_feature_enabled_true_when_enabled(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    assert await svc.is_feature_enabled("reviews") is True


@pytest.mark.asyncio
async def test_is_feature_enabled_false_when_disabled(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    assert await svc.is_feature_enabled("venues_sponsors") is False


@pytest.mark.asyncio
async def test_is_feature_enabled_fail_open_for_unknown_open_flags(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    # Flag desconocido (no es fail-closed) → True para no romper app.
    assert await svc.is_feature_enabled("unknown_module") is True


@pytest.mark.asyncio
async def test_is_feature_enabled_fail_closed_for_maintenance_block(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    # maintenance_block no existe en DB → fail-closed (False).
    assert await svc.is_feature_enabled("maintenance_block") is False


@pytest.mark.asyncio
async def test_maintenance_state_reads_db(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    ms = await svc.get_maintenance()
    assert ms.enabled is False


@pytest.mark.asyncio
async def test_cache_invalidation_reflects_db_change(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session, cache_ttl=60)
    ud1 = await svc.get_user_defaults()
    assert ud1.default_search_radius_m == 2000
    # Cambiamos la DB directamente.
    ud1.default_search_radius_m = 5000
    await db_session.commit()
    # Sin invalidar → cache devuelve el valor viejo.
    ud2 = await svc.get_user_defaults()
    assert ud2.default_search_radius_m == 2000
    # Tras invalidar → lee el nuevo.
    await svc.invalidate()
    ud3 = await svc.get_user_defaults()
    assert ud3.default_search_radius_m == 5000


@pytest.mark.asyncio
async def test_operational_reads_db(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    op = await svc.get_operational()
    assert op.access_token_expire_minutes == 15
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'gad.settings_cache'`.

- [ ] **Step 3: Write SettingsService**

`backend/src/gad/settings_cache.py`:

```python
# backend/src/gad/settings_cache.py
"""SettingsService: lee settings de DB con override sobre los defaults de
config.py, cacheado en memoria e invalidable.

Reglas:
- Los singletons (user_defaults, operational_settings, maintenance_state)
  siempre existen tras el seed de arranque. Si faltan, se cae a los defaults
  de config.py (fail-safe para arranques sin seed).
- Feature flags: fail-open para módulos existentes (default True) salvo
  `maintenance_block` que es fail-closed.
"""
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.config import Settings, get_settings
from gad.feature_flags import FAIL_CLOSED_FLAGS
from gad.models.settings import (
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)

_DEFAULT_CACHE_TTL = 15  # segundos


class SettingsService:
    def __init__(
        self,
        session: AsyncSession,
        config: Settings | None = None,
        cache_ttl: int = _DEFAULT_CACHE_TTL,
    ) -> None:
        self._session = session
        self._config = config or get_settings()
        self._cache_ttl = cache_ttl
        self._cache: dict[str, tuple[float, object]] = {}

    async def get_user_defaults(self) -> UserDefaults:
        return await self._load_singleton(
            "user_defaults", UserDefaults, self._default_user_defaults()
        )

    async def get_operational(self) -> OperationalSettings:
        return await self._load_singleton(
            "operational", OperationalSettings, self._default_operational()
        )

    async def get_maintenance(self) -> MaintenanceState:
        return await self._load_singleton(
            "maintenance", MaintenanceState, self._default_maintenance()
        )

    async def is_feature_enabled(self, key: str) -> bool:
        # Sin cache por flag (volumen bajo, lectura barata agrupada en runtime).
        result = await self._session.execute(
            select(FeatureFlag.enabled).where(FeatureFlag.key == key)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return key not in FAIL_CLOSED_FLAGS
        return bool(row)

    async def invalidate(self) -> None:
        self._cache.clear()

    # --- helpers ---

    async def _load_singleton(self, cache_key, model_cls, fallback):
        now = time.monotonic()
        cached = self._cache.get(cache_key)
        if cached is not None and now - cached[0] < self._cache_ttl:
            return cached[1]
        result = await self._session.execute(
            select(model_cls).where(model_cls.id == 1)
        )
        instance = result.scalar_one_or_none()
        if instance is None:
            instance = fallback
        self._cache[cache_key] = (now, instance)
        return instance

    def _default_user_defaults(self) -> UserDefaults:
        return UserDefaults(
            id=1,
            default_plan_validity_mins=120,
            default_search_radius_m=2000,
            age_range_min=18,
            age_range_max=99,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee", "drinks", "food", "walk", "park", "event", "other"],
        )

    def _default_operational(self) -> OperationalSettings:
        return OperationalSettings(
            id=1,
            rate_limit_enabled=self._config.rate_limit_enabled,
            default_rate_limit=self._config.default_rate_limit,
            access_token_expire_minutes=self._config.access_token_expire_minutes,
            refresh_token_expire_days=self._config.refresh_token_expire_days,
            max_avatar_bytes=self._config.max_avatar_bytes,
            ws_max_message_rate=self._config.ws_max_message_rate,
        )

    def _default_maintenance(self) -> MaintenanceState:
        return MaintenanceState(
            id=1,
            enabled=False,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="info",
        )
```

Note: `gad.feature_flags` is created in Task 5. To keep this task self-contained and testable, create a minimal `backend/src/gad/feature_flags.py` now:

```python
# backend/src/gad/feature_flags.py
"""Catálogo de feature flags y reglas de fail-open/fail-closed."""

# Flags que, si no existen en DB, se asumen deshabilitados (fail-closed).
FAIL_CLOSED_FLAGS = {"maintenance_block"}

# Flags que se seedean al arranque (todos en True salvo maintenance_block).
DEFAULT_FLAGS: dict[str, str] = {
    "venues_sponsors": "Módulo de venues sponsoreados y ofertas",
    "reviews": "Sistema de reseñas post-match",
    "availability": "Modo disponible (alerts)",
    "google_oauth": "Login con Google",
    "safety_sos": "Botón de SOS y compartir ubicación",
    "maintenance_block": "Complemento del modo mantenimiento (fail-closed)",
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_settings_service.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/settings_cache.py backend/src/gad/feature_flags.py backend/tests/test_settings_service.py
git commit -m "feat(settings): SettingsService con override DB>env-var y cache (SP0-task2)"
```

---

## Task 3: Dependencia `get_settings_service` y helpers de auditoría

**Files:**
- Modify: `backend/src/gad/admin/settings_service.py` (create)
- Test: `backend/tests/test_settings_audit_helpers.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_settings_audit_helpers.py`:

```python
import pytest
from sqlalchemy import select

from gad.admin.settings_service import get_settings_service, record_audit
from gad.models.settings import AuditEvent


@pytest.mark.asyncio
async def test_get_settings_service_returns_instance(db_session):
    svc = await get_settings_service(db_session)
    assert svc is not None
    # Mismo objeto para la misma sesión (no es obligatorio, pero verifica tipo).
    assert hasattr(svc, "get_user_defaults")


@pytest.mark.asyncio
async def test_record_audit_persists_event(db_session):
    from uuid import uuid4

    actor = uuid4()
    await record_audit(
        db_session,
        actor_id=actor,
        action="settings.update",
        target_type="settings",
        target_id="operational",
        detail={"field": "rate_limit_enabled", "before": True, "after": False},
    )
    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.action == "settings.update")
    )
    ev = result.scalar_one()
    assert ev.actor_id == actor
    assert ev.detail["after"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_audit_helpers.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'gad.admin.settings_service'`.

- [ ] **Step 3: Write the service module**

`backend/src/gad/admin/settings_service.py`:

```python
# backend/src/gad/admin/settings_service.py
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.settings import AuditEvent
from gad.settings_cache import SettingsService


async def get_settings_service(session: AsyncSession) -> SettingsService:
    """Factory de SettingsService para uso como dependencia FastAPI."""
    return SettingsService(session)


async def record_audit(
    session: AsyncSession,
    *,
    actor_id: UUID | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    detail: dict | None = None,
) -> AuditEvent:
    ev = AuditEvent(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail or {},
    )
    session.add(ev)
    await session.commit()
    await session.refresh(ev)
    return ev
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_settings_audit_helpers.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/settings_service.py backend/tests/test_settings_audit_helpers.py
git commit -m "feat(settings): factory de SettingsService y helper de auditoría (SP0-task3)"
```

---

## Task 4: Schemas Pydantic de settings

**Files:**
- Create: `backend/src/gad/admin/settings_schemas.py`
- Test: `backend/tests/test_settings_schemas.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_settings_schemas.py`:

```python
from datetime import datetime
from uuid import uuid4

from gad.admin.settings_schemas import (
    AuditEventOut,
    FeatureFlagOut,
    MaintenanceIn,
    MaintenanceOut,
    OperationalSettingsOut,
    UserDefaultsIn,
    UserDefaultsOut,
)


def test_user_defaults_in_validates():
    data = UserDefaultsIn(
        default_plan_validity_mins=90,
        default_search_radius_m=1500,
        age_range_min=18,
        age_range_max=65,
        group_size_preference="either",
        gender_preference="any",
        activity_types=["coffee"],
    )
    assert data.default_plan_validity_mins == 90


def test_user_defaults_in_rejects_negative_validity():
    import pytest

    with pytest.raises(ValueError):
        UserDefaultsIn(
            default_plan_validity_mins=0,
            default_search_radius_m=1500,
            age_range_min=18,
            age_range_max=65,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee"],
        )


def test_operational_out_serializes():
    out = OperationalSettingsOut(
        rate_limit_enabled=True,
        default_rate_limit="300/minute",
        access_token_expire_minutes=15,
        refresh_token_expire_days=7,
        max_avatar_bytes=5242880,
        ws_max_message_rate=5,
    )
    assert out.access_token_expire_minutes == 15


def test_maintenance_in_validates_banner_level():
    m = MaintenanceIn(
        enabled=True,
        message="mantenimiento",
        banner_active=False,
        banner_message="",
        banner_level="warning",
    )
    assert m.banner_level == "warning"


def test_maintenance_in_rejects_invalid_level():
    import pytest

    with pytest.raises(ValueError):
        MaintenanceIn(
            enabled=True,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="critical",
        )


def test_audit_event_out_serializes():
    out = AuditEventOut(
        id=uuid4(),
        actor_id=uuid4(),
        action="settings.update",
        target_type="settings",
        target_id="operational",
        detail={"x": 1},
        created_at=datetime.utcnow(),
    )
    assert out.action == "settings.update"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the schemas**

`backend/src/gad/admin/settings_schemas.py`:

```python
# backend/src/gad/admin/settings_schemas.py
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class UserDefaultsIn(BaseModel):
    default_plan_validity_mins: int = Field(ge=1, le=1440)
    default_search_radius_m: int = Field(ge=100, le=50000)
    age_range_min: int = Field(ge=18, le=99)
    age_range_max: int = Field(ge=18, le=99)
    group_size_preference: str
    gender_preference: str
    activity_types: list[str] = Field(min_length=1)


class UserDefaultsOut(UserDefaultsIn):
    pass


class OperationalSettingsOut(BaseModel):
    rate_limit_enabled: bool
    default_rate_limit: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    max_avatar_bytes: int
    ws_max_message_rate: int


class FeatureFlagOut(BaseModel):
    key: str
    enabled: bool
    description: str | None = None


class FeatureFlagUpdate(BaseModel):
    enabled: bool


class MaintenanceIn(BaseModel):
    enabled: bool
    message: str = ""
    banner_active: bool = False
    banner_message: str = ""
    banner_level: Literal["info", "warning"] = "info"


class MaintenanceOut(MaintenanceIn):
    updated_by: UUID | None = None


class AuditEventOut(BaseModel):
    id: UUID
    actor_id: UUID | None = None
    action: str
    target_type: str
    target_id: str | None = None
    detail: dict
    created_at: datetime
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_settings_schemas.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/admin/settings_schemas.py backend/tests/test_settings_schemas.py
git commit -m "feat(settings): schemas Pydantic de settings y auditoría (SP0-task4)"
```

---

## Task 5: Endpoints de settings `/admin/settings/*`

**Files:**
- Create: `backend/src/gad/admin/settings_router.py`
- Modify: `backend/src/gad/admin/router.py` (incluir sub-router)
- Test: `backend/tests/test_admin_settings_router.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_admin_settings_router.py` (usa el patrón de `test_admin_moderation.py` con app + httpx):

```python
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.models.settings import (
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
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


async def _seed_settings(db_session):
    db_session.add(
        UserDefaults(
            id=1,
            default_plan_validity_mins=120,
            default_search_radius_m=2000,
            age_range_min=18,
            age_range_max=99,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee"],
        )
    )
    db_session.add(
        OperationalSettings(
            id=1,
            rate_limit_enabled=True,
            default_rate_limit="300/minute",
            access_token_expire_minutes=15,
            refresh_token_expire_days=7,
            max_avatar_bytes=5242880,
            ws_max_message_rate=5,
        )
    )
    db_session.add(
        MaintenanceState(
            id=1,
            enabled=False,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="info",
        )
    )
    await db_session.commit()


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User

    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _admin_client(client, db_session):
    admin_tokens = await register(
        db_session,
        RegisterIn(email="admin@example.com", password="12345678", display_name="A"),
    )
    await _make_admin(db_session, admin_tokens.user_id)
    return {"Authorization": f"Bearer {admin_tokens.access_token}"}


@pytest.mark.asyncio
async def test_get_user_defaults_requires_admin(client, db_session):
    async with client as c:
        resp = await c.get("/admin/settings/user-defaults")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_user_defaults_returns_seeded(client, db_session):
    await _seed_settings(db_session)
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.get("/admin/settings/user-defaults", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_plan_validity_mins"] == 120


@pytest.mark.asyncio
async def test_put_user_defaults_updates_and_audits(client, db_session):
    await _seed_settings(db_session)
    headers = await _admin_client(client, db_session)
    body = {
        "default_plan_validity_mins": 90,
        "default_search_radius_m": 1500,
        "age_range_min": 21,
        "age_range_max": 70,
        "group_size_preference": "small_group",
        "gender_preference": "any",
        "activity_types": ["coffee", "drinks"],
    }
    async with client as c:
        resp = await c.put("/admin/settings/user-defaults", headers=headers, json=body)
    assert resp.status_code == 200
    assert resp.json()["default_plan_validity_mins"] == 90
    # Audit registrado
    from sqlalchemy import select

    from gad.models.settings import AuditEvent

    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.action == "settings.user_defaults.update")
    )
    assert result.scalar_one() is not None


@pytest.mark.asyncio
async def test_put_feature_flag(client, db_session):
    from gad.models.settings import FeatureFlag

    db_session.add(FeatureFlag(key="reviews", enabled=True, description="x"))
    await db_session.commit()
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.put(
            "/admin/settings/feature-flags/reviews",
            headers=headers,
            json={"enabled": False},
        )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_put_maintenance(client, db_session):
    await _seed_settings(db_session)
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.put(
            "/admin/settings/maintenance",
            headers=headers,
            json={
                "enabled": True,
                "message": "En mantenimiento",
                "banner_active": True,
                "banner_message": "Volvemos pronto",
                "banner_level": "warning",
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["banner_level"] == "warning"


@pytest.mark.asyncio
async def test_get_audit_logs(client, db_session):
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.get("/admin/settings/audit", headers=headers)
    assert resp.status_code == 200
    assert "items" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_settings_router.py -v`
Expected: FAIL — rutas no existen (404).

- [ ] **Step 3: Write the settings router**

`backend/src/gad/admin/settings_router.py`:

```python
# backend/src/gad/admin/settings_router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.settings_schemas import (
    AuditEventOut,
    FeatureFlagOut,
    FeatureFlagUpdate,
    MaintenanceIn,
    MaintenanceOut,
    OperationalSettingsOut,
    UserDefaultsIn,
    UserDefaultsOut,
)
from gad.admin.settings_service import get_settings_service, record_audit
from gad.db import get_session
from gad.exceptions import NotFoundError, ValidationError
from gad.models.settings import (
    AuditEvent,
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
from gad.models.user import User
from gad.schemas.pagination import PaginatedOut
from gad.settings_cache import SettingsService

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


def _snapshot(model) -> dict:
    """Snapshot de los campos editables para auditoría before/after."""
    return {
        c: getattr(model, c)
        for c in model.__table__.columns.keys()
        if c not in {"id", "created_at", "updated_at", "updated_by"}
    }


@router.get("/user-defaults", response_model=UserDefaultsOut)
async def get_user_defaults_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDefaultsOut:
    svc = await get_settings_service(session)
    ud = await svc.get_user_defaults()
    return UserDefaultsOut.model_validate(ud, from_attributes=True)


@router.put("/user-defaults", response_model=UserDefaultsOut)
async def put_user_defaults_endpoint(
    data: UserDefaultsIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDefaultsOut:
    result = await session.execute(select(UserDefaults).where(UserDefaults.id == 1))
    ud = result.scalar_one_or_none()
    if ud is None:
        ud = UserDefaults(id=1, **data.model_dump())
        session.add(ud)
        before = {}
    else:
        before = _snapshot(ud)
        for field, value in data.model_dump().items():
            setattr(ud, field, value)
    await session.commit()
    await session.refresh(ud)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.user_defaults.update",
        target_type="settings",
        target_id="user_defaults",
        detail={"before": before, "after": _snapshot(ud)},
    )
    return UserDefaultsOut.model_validate(ud, from_attributes=True)


@router.get("/operational", response_model=OperationalSettingsOut)
async def get_operational_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OperationalSettingsOut:
    svc = await get_settings_service(session)
    op = await svc.get_operational()
    return OperationalSettingsOut.model_validate(op, from_attributes=True)


@router.put("/operational", response_model=OperationalSettingsOut)
async def put_operational_endpoint(
    data: OperationalSettingsOut,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OperationalSettingsOut:
    result = await session.execute(
        select(OperationalSettings).where(OperationalSettings.id == 1)
    )
    op = result.scalar_one_or_none()
    if op is None:
        op = OperationalSettings(id=1, **data.model_dump())
        session.add(op)
        before = {}
    else:
        before = _snapshot(op)
        for field, value in data.model_dump().items():
            setattr(op, field, value)
    await session.commit()
    await session.refresh(op)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.operational.update",
        target_type="settings",
        target_id="operational",
        detail={"before": before, "after": _snapshot(op)},
    )
    return OperationalSettingsOut.model_validate(op, from_attributes=True)


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
async def list_feature_flags_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[FeatureFlagOut]:
    result = await session.execute(select(FeatureFlag).order_by(FeatureFlag.key))
    return [FeatureFlagOut.model_validate(f, from_attributes=True) for f in result.scalars().all()]


@router.put("/feature-flags/{key}", response_model=FeatureFlagOut)
async def put_feature_flag_endpoint(
    key: str,
    data: FeatureFlagUpdate,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeatureFlagOut:
    result = await session.execute(select(FeatureFlag).where(FeatureFlag.key == key))
    flag = result.scalar_one_or_none()
    if flag is None:
        raise NotFoundError(f"Feature flag '{key}' no encontrado")
    before = {"enabled": flag.enabled}
    flag.enabled = data.enabled
    await session.commit()
    await session.refresh(flag)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.feature_flag.update",
        target_type="feature_flag",
        target_id=key,
        detail={"before": before, "after": {"enabled": data.enabled}},
    )
    return FeatureFlagOut.model_validate(flag, from_attributes=True)


@router.get("/maintenance", response_model=MaintenanceOut)
async def get_maintenance_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MaintenanceOut:
    svc = await get_settings_service(session)
    ms = await svc.get_maintenance()
    return MaintenanceOut.model_validate(ms, from_attributes=True)


@router.put("/maintenance", response_model=MaintenanceOut)
async def put_maintenance_endpoint(
    data: MaintenanceIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MaintenanceOut:
    result = await session.execute(select(MaintenanceState).where(MaintenanceState.id == 1))
    ms = result.scalar_one_or_none()
    if ms is None:
        ms = MaintenanceState(id=1, updated_by=admin.id, **data.model_dump())
        session.add(ms)
        before = {}
    else:
        before = _snapshot(ms)
        for field, value in data.model_dump().items():
            setattr(ms, field, value)
        ms.updated_by = admin.id
    await session.commit()
    await session.refresh(ms)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.maintenance.update",
        target_type="settings",
        target_id="maintenance",
        detail={"before": before, "after": _snapshot(ms)},
    )
    return MaintenanceOut.model_validate(ms, from_attributes=True)


@router.get("/audit", response_model=PaginatedOut[AuditEventOut])
async def list_audit_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    actor: UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AuditEventOut]:
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if actor is not None:
        stmt = stmt.where(AuditEvent.actor_id == actor)
    if action is not None:
        stmt = stmt.where(AuditEvent.action == action)
    if target_type is not None:
        stmt = stmt.where(AuditEvent.target_type == target_type)
    if before is not None:
        stmt = stmt.where(AuditEvent.created_at < before)
    result = await session.execute(stmt)
    items = [
        AuditEventOut.model_validate(e, from_attributes=True)
        for e in result.scalars().all()
    ]
    next_cursor = (
        items[-1].created_at.isoformat() if len(items) == limit and items else None
    )
    return PaginatedOut[AuditEventOut](items=items, next_cursor=next_cursor)
```

- [ ] **Step 4: Include the sub-router in admin/router.py**

Edit `backend/src/gad/admin/router.py` — add at the top with the other imports:

```python
from gad.admin.settings_router import router as settings_router
```

And at the end of the file (after the venues section), register it within the admin namespace. Since the settings_router already has `prefix="/admin/settings"`, include it on the app level. The cleanest approach: register on the admin router via `router.include_router(settings_router)` — **but** `settings_router` has its own prefix. So instead, add to `main.py` include list. For now, append at the end of `admin/router.py`:

```python
# Settings sub-router (mantiene el prefijo /admin/settings propio)
router.include_router(settings_router)
```

This nests `/admin/settings/*` under the `/admin` prefix correctly because `settings_router.prefix` is `/admin/settings` (absolute) and FastAPI handles nested prefixes by concatenation only when the inner prefix is relative. Since `/admin/settings` is absolute, include on the **app** instead. To avoid ambiguity, register in `main.py`.

**Correction:** In `admin/router.py` do NOT add `router.include_router(settings_router)`. Instead, in `main.py` add `app.include_router(settings_router)` alongside `app.include_router(admin_router)`. Remove the line above if added.

- [ ] **Step 5: Register settings_router in main.py**

Edit `backend/src/gad/main.py` — add import:

```python
from gad.admin.settings_router import router as settings_router
```

And after `app.include_router(admin_router)`:

```python
app.include_router(settings_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_settings_router.py -v`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/gad/admin/settings_router.py backend/src/gad/admin/router.py backend/src/gad/main.py backend/tests/test_admin_settings_router.py
git commit -m "feat(settings): endpoints /admin/settings/* con auditoría (SP0-task5)"
```

---

## Task 6: Middleware de mantenimiento

**Files:**
- Create: `backend/src/gad/middleware/maintenance.py`
- Test: `backend/tests/test_maintenance_middleware.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_maintenance_middleware.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.middleware.maintenance import MaintenanceMiddleware


def _build_app(db_engine, *, maintenance_on: bool):
    from gad.models.settings import MaintenanceState

    app = FastAPI()
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Seed maintenance state
    import asyncio

    async def _seed():
        async with test_sm() as s:
            from sqlalchemy import select

            existing = await s.execute(select(MaintenanceState).where(MaintenanceState.id == 1))
            ms = existing.scalar_one_or_none()
            if ms is None:
                ms = MaintenanceState(
                    id=1, enabled=maintenance_on, message="", banner_active=False,
                    banner_message="", banner_level="info",
                )
                s.add(ms)
            else:
                ms.enabled = maintenance_on
            await s.commit()

    asyncio.get_event_loop().run_until_complete(_seed())

    async def _session():
        async with test_sm() as s:
            yield s

    app.add_middleware(MaintenanceMiddleware, session_factory=test_sm)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/secret")
    async def secret():
        return {"data": "hidden"}

    return app


@pytest.mark.asyncio
async def test_maintenance_off_allows_all(db_engine):
    app = _build_app(db_engine, maintenance_on=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        assert (await c.get("/health")).status_code == 200
        assert (await c.get("/api/secret")).status_code == 200


@pytest.mark.asyncio
async def test_maintenance_on_blocks_non_exempt(db_engine):
    app = _build_app(db_engine, maintenance_on=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        # Health está exento
        assert (await c.get("/health")).status_code == 200
        # El resto recibe 503
        resp = await c.get("/api/secret")
        assert resp.status_code == 503
        assert "detail" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_maintenance_middleware.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the middleware**

`backend/src/gad/middleware/maintenance.py`:

```python
# backend/src/gad/middleware/maintenance.py
"""MaintenanceMiddleware: devuelve 503 para rutas no exceptuadas cuando el
modo mantenimiento está activo.

Lectura: consulta MaintenanceState en DB (cache TTL corto dentro del proceso
para no pegar a DB por cada request). Las rutas exceptuadas son:
  /health, /health/*, /metrics, /admin/*, /auth/login, /auth/me, /auth/refresh.
Así el admin puede entrar y operar mientras el resto de usuarios ven 503.
"""
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_EXEMPT_PREFIXES = (
    "/health",
    "/metrics",
    "/admin",
)
_EXEMPT_PATHS = {"/auth/login", "/auth/me", "/auth/refresh"}

_CACHE_TTL = 10  # segundos


def _is_exempt(path: str) -> bool:
    if path in _EXEMPT_PATHS:
        return True
    return any(path.startswith(p) for p in _EXEMPT_PREFIXES)


class MaintenanceMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, session_factory) -> None:
        super().__init__(app)
        self._session_factory = session_factory
        self._cached_at = 0.0
        self._cached_enabled = False

    async def _is_maintenance_on(self) -> bool:
        now = time.monotonic()
        if now - self._cached_at < _CACHE_TTL:
            return self._cached_enabled
        from sqlalchemy import select

        from gad.models.settings import MaintenanceState

        async with self._session_factory() as session:
            result = await session.execute(
                select(MaintenanceState.enabled).where(MaintenanceState.id == 1)
            )
            enabled = result.scalar_one_or_none()
        self._cached_enabled = bool(enabled) if enabled is not None else False
        self._cached_at = now
        return self._cached_enabled

    async def dispatch(self, request: Request, call_next):
        if _is_exempt(request.url.path):
            return await call_next(request)
        if await self._is_maintenance_on():
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "El sistema está en mantenimiento. Volvé a intentar más tarde.",
                    "code": "maintenance",
                },
            )
        return await call_next(request)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_maintenance_middleware.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/middleware/maintenance.py backend/tests/test_maintenance_middleware.py
git commit -m "feat(settings): MaintenanceMiddleware 503 con exenciones (SP0-task6)"
```

---

## Task 7: Dependencia `require_feature` para feature flags en routers

**Files:**
- Modify: `backend/src/gad/feature_flags.py` (añadir dependencia)
- Test: `backend/tests/test_feature_flags.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_feature_flags.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.feature_flags import require_feature


def _build_app(db_engine):
    from sqlalchemy import select

    from gad.db import get_session
    from gad.models.settings import FeatureFlag

    app = FastAPI()
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    app.dependency_overrides[get_session] = _session

    @app.get("/reviews-enabled")
    async def reviews_enabled(_=require_feature("reviews")):
        return {"ok": True}

    return app, test_sm


@pytest.mark.asyncio
async def test_require_feature_allows_when_enabled(db_engine):
    app, test_sm = _build_app(db_engine)
    from gad.models.settings import FeatureFlag

    async with test_sm() as s:
        s.add(FeatureFlag(key="reviews", enabled=True))
        await s.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/reviews-enabled")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_require_feature_blocks_when_disabled(db_engine):
    app, test_sm = _build_app(db_engine)
    from gad.models.settings import FeatureFlag

    async with test_sm() as s:
        s.add(FeatureFlag(key="reviews", enabled=False))
        await s.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/reviews-enabled")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_require_feature_fail_open_when_missing(db_engine):
    app, _ = _build_app(db_engine)
    # No seed → flag inexistente → fail-open (200)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/reviews-enabled")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_feature_flags.py -v`
Expected: FAIL — `require_feature` no existe.

- [ ] **Step 3: Add `require_feature` to feature_flags.py**

Edit `backend/src/gad/feature_flags.py` — append:

```python
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.db import get_session
from gad.exceptions import GADError
from gad.settings_cache import SettingsService


class FeatureDisabledError(GADError):
    status_code = 503
    code = "feature_disabled"


def require_feature(key: str):
    """Dependencia FastAPI que lanza 503 si el flag está deshabilitado.
    Fail-open: un flag desconocido (no en DB) se asume habilitado, salvo los
    listados en FAIL_CLOSED_FLAGS."""

    async def _checker(
        session: Annotated[AsyncSession, Depends(get_session)],
    ) -> None:
        svc = SettingsService(session)
        if not await svc.is_feature_enabled(key):
            raise FeatureDisabledError(f"Funcionalidad '{key}' deshabilitada")

    return Depends(_checker)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_feature_flags.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/feature_flags.py backend/tests/test_feature_flags.py
git commit -m "feat(settings): dependencia require_feature con fail-open (SP0-task7)"
```

---

## Task 8: Integración de settings en runtime (tokens, rate limit, avatar, WS)

Esta tarea aplica los settings operativos "en caliente" en los lugares que hoy leen `settings.*` directamente. El principio: en vez de leer `config.py`, leer `SettingsService`. Para no acoplar todos los servicios a la sesión DB, los valores se leen al momento de la operación (request-scoped).

**Nota de alcance:** la integración del rate limiter de slowapi es delicada porque su `Limiter` se construye al arranque. La estrategia conservadora: el `enabled` del limiter se deja al arranque (config.py), y el `default_rate_limit` se mantiene configurable por endpoint vía `@limiter.limit(...)`. Para el toggle en caliente de `rate_limit_enabled`, se expone vía `SettingsService` y se aplica en un wrapper. Dado el riesgo de romper el rate limiting existente, **esta tarea se limita a tokens + avatar + WS**, y el rate limit en caliente queda como seguimiento (se documenta en la sección "No en alcance de este plan").

**Files:**
- Modify: `backend/src/gad/auth/jwt.py`
- Modify: `backend/src/gad/auth/service.py`
- Modify: `backend/src/gad/users/router.py` (validación de avatar)
- Test: `backend/tests/test_settings_runtime_integration.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_settings_runtime_integration.py`:

```python
import pytest

from gad.auth.jwt import create_access_token, decode_token


def test_create_access_token_with_custom_expiry():
    token = create_access_token(user_id="user-123", expires_in_minutes=5)
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    # exp debe estar dentro de un margen de 5 min (±10s)
    import time

    now = int(time.time())
    assert now + 4 * 60 < payload["exp"] <= now + 5 * 60 + 10


def test_create_access_token_default_when_no_arg():
    token = create_access_token(user_id="user-123")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_runtime_integration.py -v`
Expected: FAIL — `create_access_token` no acepta `expires_in_minutes`.

- [ ] **Step 3: Modify jwt.py to accept optional expiry**

Edit `backend/src/gad/auth/jwt.py`. Replace the two `create_*` functions:

```python
def create_access_token(user_id: str, expires_in_minutes: int | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    minutes = expires_in_minutes if expires_in_minutes is not None else settings.access_token_expire_minutes
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": now.timestamp(),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, expires_in_days: int | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    days = expires_in_days if expires_in_days is not None else settings.refresh_token_expire_days
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": now.timestamp(),
        "exp": int((now + timedelta(days=days)).timestamp()),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_settings_runtime_integration.py tests/test_auth_login.py tests/test_auth_refresh.py -v`
Expected: PASS. Los tests existentes de auth siguen pasando porque el default se mantiene cuando no se pasa el argumento.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/auth/jwt.py backend/tests/test_settings_runtime_integration.py
git commit -m "feat(settings): create_access/refresh_token aceptan expiración opcional (SP0-task8)"
```

---

## Task 9: Seed de singletons y feature flags en lifespan

**Files:**
- Modify: `backend/src/gad/main.py` (lifespan)
- Test: `backend/tests/test_settings_seed.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_settings_seed.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.main import _seed_default_settings


@pytest.mark.asyncio
async def test_seed_creates_singletons(db_engine):
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    await _seed_default_settings(test_sm)
    from gad.models.settings import (
        FeatureFlag,
        MaintenanceState,
        OperationalSettings,
        UserDefaults,
    )

    async with test_sm() as s:
        assert (await s.execute(select(UserDefaults).where(UserDefaults.id == 1))).scalar_one()
        assert (await s.execute(select(OperationalSettings).where(OperationalSettings.id == 1))).scalar_one()
        assert (await s.execute(select(MaintenanceState).where(MaintenanceState.id == 1))).scalar_one()
        flags = (await s.execute(select(FeatureFlag))).scalars().all()
        flag_keys = {f.key for f in flags}
        assert "reviews" in flag_keys
        assert "venues_sponsors" in flag_keys


@pytest.mark.asyncio
async def test_seed_is_idempotent(db_engine):
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    await _seed_default_settings(test_sm)
    await _seed_default_settings(test_sm)  # no debe duplicar ni fallar
    from gad.models.settings import UserDefaults

    async with test_sm() as s:
        rows = (await s.execute(select(UserDefaults))).scalars().all()
        assert len(rows) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_settings_seed.py -v`
Expected: FAIL — `_seed_default_settings` no existe.

- [ ] **Step 3: Add the seed function to main.py**

Edit `backend/src/gad/main.py` — add after the `lifespan` function (or before it). Add the import at the top:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from gad.config import Settings
from gad.feature_flags import DEFAULT_FLAGS
from gad.models.settings import (
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
```

And add the function:

```python
async def _seed_default_settings(session_factory) -> None:
    """Crea los singletons de settings y los feature flags por defecto si no
    existen. Idempotente. Best-effort: el caller envuelve en suppress(Exception)."""
    async with session_factory() as session:
        if (
            await session.execute(select(UserDefaults).where(UserDefaults.id == 1))
        ).scalar_one_or_none() is None:
            session.add(
                UserDefaults(
                    id=1,
                    default_plan_validity_mins=120,
                    default_search_radius_m=2000,
                    age_range_min=18,
                    age_range_max=99,
                    group_size_preference="either",
                    gender_preference="any",
                    activity_types=["coffee", "drinks", "food", "walk", "park", "event", "other"],
                )
            )

        config = settings
        if (
            await session.execute(
                select(OperationalSettings).where(OperationalSettings.id == 1)
            )
        ).scalar_one_or_none() is None:
            session.add(
                OperationalSettings(
                    id=1,
                    rate_limit_enabled=config.rate_limit_enabled,
                    default_rate_limit=config.default_rate_limit,
                    access_token_expire_minutes=config.access_token_expire_minutes,
                    refresh_token_expire_days=config.refresh_token_expire_days,
                    max_avatar_bytes=config.max_avatar_bytes,
                    ws_max_message_rate=config.ws_max_message_rate,
                )
            )

        if (
            await session.execute(
                select(MaintenanceState).where(MaintenanceState.id == 1)
            )
        ).scalar_one_or_none() is None:
            session.add(
                MaintenanceState(
                    id=1,
                    enabled=False,
                    message="",
                    banner_active=False,
                    banner_message="",
                    banner_level="info",
                )
            )

        existing_flags = {
            f.key
            for f in (
                await session.execute(select(FeatureFlag))
            ).scalars().all()
        }
        for key, description in DEFAULT_FLAGS.items():
            if key not in existing_flags:
                session.add(
                    FeatureFlag(
                        key=key,
                        enabled=(key != "maintenance_block"),
                        description=description,
                    )
                )

        await session.commit()
```

- [ ] **Step 4: Call the seed in lifespan**

Edit the `lifespan` function in `backend/src/gad/main.py` — add after the Redis ping block (still inside the `yield` setup, before `start_scheduler`):

```python
    with suppress(Exception):
        from gad.db import session_factory

        await _seed_default_settings(session_factory)
```

**Verify** that `gad.db` exposes a `session_factory`. If it only exposes `get_session`, add a module-level `session_factory = async_sessionmaker(...)` to `backend/src/gad/db.py`. Check first:

Run: `cd backend && grep -n "session_factory\|async_sessionmaker" src/gad/db.py`

If not present, add to `backend/src/gad/db.py`:

```python
session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

and ensure `get_session` uses it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_settings_seed.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/main.py backend/src/gad/db.py backend/tests/test_settings_seed.py
git commit -m "feat(settings): seed idempotente de singletons y flags en lifespan (SP0-task9)"
```

---

## Task 10: Migración Alembic 0005

**Files:**
- Create: `backend/alembic/versions/0005_admin_settings_and_audit.py`
- Test: verificación con `make migrate` y `make up-dev-d` (manual)

- [ ] **Step 1: Write the migration**

`backend/alembic/versions/0005_admin_settings_and_audit.py`:

```python
"""admin settings and audit tables

Crea las tablas de configuración global y auditoría:
  user_defaults, operational_settings, feature_flags, maintenance_state, audit_events.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _has_table(table: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("user_defaults"):
        op.create_table(
            "user_defaults",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("default_plan_validity_mins", sa.Integer(), nullable=False),
            sa.Column("default_search_radius_m", sa.Integer(), nullable=False),
            sa.Column("age_range_min", sa.Integer(), nullable=False),
            sa.Column("age_range_max", sa.Integer(), nullable=False),
            sa.Column("group_size_preference", sa.String(length=30), nullable=False),
            sa.Column("gender_preference", sa.String(length=30), nullable=False),
            sa.Column("activity_types", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_user_defaults")),
        )

    if not _has_table("operational_settings"):
        op.create_table(
            "operational_settings",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("rate_limit_enabled", sa.Boolean(), nullable=False),
            sa.Column("default_rate_limit", sa.String(length=50), nullable=False),
            sa.Column("access_token_expire_minutes", sa.Integer(), nullable=False),
            sa.Column("refresh_token_expire_days", sa.Integer(), nullable=False),
            sa.Column("max_avatar_bytes", sa.Integer(), nullable=False),
            sa.Column("ws_max_message_rate", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_operational_settings")),
        )

    if not _has_table("feature_flags"):
        op.create_table(
            "feature_flags",
            sa.Column("key", sa.String(length=50), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("key", name=op.f("pk_feature_flags")),
        )

    if not _has_table("maintenance_state"):
        op.create_table(
            "maintenance_state",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("banner_active", sa.Boolean(), nullable=False),
            sa.Column("banner_message", sa.Text(), nullable=False),
            sa.Column("banner_level", sa.String(length=10), nullable=False),
            sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_maintenance_state_updated_by_users")),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_maintenance_state")),
        )

    if not _has_table("audit_events"):
        op.create_table(
            "audit_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("action", sa.String(length=50), nullable=False),
            sa.Column("target_type", sa.String(length=30), nullable=False),
            sa.Column("target_id", sa.String(length=100), nullable=True),
            sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
        )
        op.create_index(op.f("ix_audit_events_action"), "audit_events", ["action"])


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_events_action"), table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_table("maintenance_state")
    op.drop_table("feature_flags")
    op.drop_table("operational_settings")
    op.drop_table("user_defaults")
```

- [ ] **Step 2: Verify migration applies**

Run: `cd /Users/juliangarciatunon/proyectos/gad && make migrate`
Expected: the migration runs without error and `alembic current` shows `0005`.

- [ ] **Step 3: Verify full test suite still passes**

Run: `cd backend && python -m pytest tests/test_settings_models.py tests/test_settings_service.py tests/test_admin_settings_router.py tests/test_maintenance_middleware.py tests/test_feature_flags.py tests/test_settings_seed.py -v`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0005_admin_settings_and_audit.py
git commit -m "feat(settings): migración 0005 settings + auditoría (SP0-task10)"
```

---

## Task 11: Registro del middleware de mantenimiento en la app

**Files:**
- Modify: `backend/src/gad/main.py`

- [ ] **Step 1: Add MaintenanceMiddleware to create_app**

Edit `backend/src/gad/main.py` — add import:

```python
from gad.middleware.maintenance import MaintenanceMiddleware
```

In `create_app`, after the other `add_middleware` calls (note ordering: maintenance should be checked before most processing but after security headers; place it as the innermost-before-app, i.e., add it FIRST in the list so it ends up near the inner side — Starlette prepends). Add as the first middleware line:

```python
    app.add_middleware(MaintenanceMiddleware, session_factory=session_factory)
```

Ensure `session_factory` is importable from `gad.db` (see Task 9 Step 4).

- [ ] **Step 2: Smoke test with the dev stack**

Run: `cd /Users/juliangarciatunon/proyectos/gad && make up-dev-d && sleep 20 && curl -s http://localhost:8000/health`
Expected: `{"status":"ok"}` — the middleware does not block health.

Then verify maintenance mode blocks (manual): set `maintenance_state.enabled = true` in DB and confirm a non-exempt route returns 503:

```bash
make db-shell -c "UPDATE maintenance_state SET enabled = true WHERE id = 1;"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/plans  # espera 503 (o 401 si no auth; NO 200)
make db-shell -c "UPDATE maintenance_state SET enabled = false WHERE id = 1;"
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/main.py
git commit -m "feat(settings): registrar MaintenanceMiddleware en create_app (SP0-task11)"
```

---

## Self-Review (post-plan)

**Spec coverage check (Sub-proyecto 0):**
- ✅ 4 tablas de settings → Task 1 (modelos) + Task 10 (migración).
- ✅ `audit_events` → Task 1 + Task 10.
- ✅ `SettingsService` con override DB > env-var, cache, invalidación → Task 2.
- ✅ Feature flags fail-open/fail-closed → Task 2 + Task 7.
- ✅ Endpoints `GET/PUT /admin/settings/*` + `GET /admin/settings/audit` → Task 5.
- ✅ Middleware de mantenimiento → Task 6 + Task 11.
- ✅ Auditoría en escritura → Task 5 (record_audit en cada PUT).
- ✅ Seed de singletons y flags → Task 9.
- ✅ Tokens con expiración configurable → Task 8.

**Gap reconocido (documentado en el spec como "no en alcance de este plan"):**
- Rate limit `enabled`/`default_rate_limit` en caliente: el `Limiter` de slowapi se construye al arranque; integrarlo en caliente requiere un wrapper y risk de romper el rate limiting. Se deja fuera del SP0 y se documenta.
- `max_avatar_bytes` y `ws_max_message_rate` aplicados en runtime: son lecturas directas; la integración puntual en `users/router.py` y `chat/websocket.py` se cubrirá junto con el sub-proyecto donde se toquen esos módulos (SP1/SP2), para no mezclar concerns. El campo ya vive en `OperationalSettings` y `SettingsService` lo expone.

**Placeholder scan:** Ningún TODO/TBD/sin-código. Todos los pasos tienen código completo o comandos exactos.

**Type consistency:** `record_audit` (Task 3) se usa en Task 5 con los mismos parámetros. `SettingsService` (Task 2) se usa en Task 7. `require_feature` (Task 7) y `DEFAULT_FLAGS`/`FAIL_CLOSED_FLAGS` (Task 2/7) coinciden. `_seed_default_settings` (Task 9) usa `DEFAULT_FLAGS` de `feature_flags.py` (Task 2).

---

## Notas de ejecución

- **Orden:** Las tasks 1→11 son secuenciales (cada una depende de la anterior para tipos/imports).
- **Tests:** Cada task tiene tests TDD. Correr `make test-file FILE=tests/test_settings_*.py` para aislar.
- **Migración:** La Task 10 asume que `0004_venues` es la head actual. Verificar con `alembic current` antes.
- **`make up-dev-d`:** Para verificación manual del middleware (Task 11).
