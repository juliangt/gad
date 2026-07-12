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
