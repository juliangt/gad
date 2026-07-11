# backend/src/gad/middleware/rate_limit.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from gad.config import settings
from gad.middleware.ip_key import client_ip_key

limiter = Limiter(
    key_func=client_ip_key,
    enabled=settings.rate_limit_enabled,
    storage_uri=settings.redis_url,
    default_limits=[settings.default_rate_limit],
)


def setup_rate_limit(app):
    """Registra el state, middleware y handler de slowapi en la app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)


def reset_limiter(storage_uri: str, enabled: bool = True) -> None:
    """Reconfigura el limiter global (para tests con un Redis dedicado)."""
    global limiter
    limiter = Limiter(
        key_func=client_ip_key,
        enabled=enabled,
        storage_uri=storage_uri,
        default_limits=[settings.default_rate_limit],
    )
