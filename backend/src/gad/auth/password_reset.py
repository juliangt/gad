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

    async def find_email_for_token(self, token: str) -> str | None:
        """Escanea pwreset:* buscando el token. En prod el token debería ser
        autocontenido (JWT firmado) para evitar este escaneo; acá es aceptable
        porque el TTL es corto y el volumen bajo."""
        async for key in self._redis.scan_iter(match=_PREFIX + "*", count=100):
            stored = await self._redis.get(key)
            stored = stored.decode() if isinstance(stored, bytes) else stored
            key_str = key.decode() if isinstance(key, bytes) else key
            if stored and secrets.compare_digest(stored, token):
                return key_str.removeprefix(_PREFIX)
        return None


# Singleton; los tests pueden sobreescribir `_store`.
_store: PasswordResetStore | None = None


def get_password_reset_store() -> PasswordResetStore:
    global _store
    if _store is None:
        from gad.redis_client import redis_client

        _store = PasswordResetStore(redis_client)
    return _store
