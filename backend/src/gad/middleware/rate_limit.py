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


def reset_limiter(storage_uri: str, enabled: bool = True) -> None:
    """Reconfigura el limiter global (para tests con un Redis dedicado)."""
    global limiter
    limiter = Limiter(
        key_func=get_remote_address,
        enabled=enabled,
        storage_uri=storage_uri,
    )
