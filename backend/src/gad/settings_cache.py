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
        else:
            # Desconecta de la sesión para que el cache guarde un snapshot
            # inmutable desde el punto de vista del llamador: mutaciones sobre
            # el objeto retornado no deben afectar el valor cacheado, y tras
            # invalidate() se relee de DB.
            self._session.expunge(instance)
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
