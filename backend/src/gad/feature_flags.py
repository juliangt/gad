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
