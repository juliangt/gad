"""Tokens de reset de contraseña de un solo uso, en Redis.

El token se guarda como pwreset:<email> = <jti> con TTL corto.
Al confirmar, se valida que el jti coincida, garantizando one-shot.
"""
import secrets

from redis.asyncio import Redis

from gad.auth.jwt import create_pwreset_token, decode_token
from gad.config import settings

_PREFIX = "pwreset:"


class PasswordResetStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def issue(self, email: str) -> str:
        token, jti = create_pwreset_token(email)
        ttl = settings.password_reset_token_expire_minutes * 60
        await self._redis.set(_PREFIX + email, jti, ex=ttl)
        return token

    async def validate_and_consume(self, email: str, token: str) -> bool:
        try:
            payload = decode_token(token)
        except Exception:
            return False

        if payload.get("type") != "pwreset":
            return False
        if payload.get("sub") != email:
            return False

        jti = payload.get("jti")
        if not jti:
            return False

        stored = await self._redis.get(_PREFIX + email)
        if stored is None:
            return False
        stored = stored.decode() if isinstance(stored, bytes) else stored

        if not secrets.compare_digest(stored, jti):
            return False

        await self._redis.delete(_PREFIX + email)
        return True

    async def find_email_for_token(self, token: str) -> str | None:
        """Decode the JWT and check redis to see if token is valid."""
        try:
            payload = decode_token(token)
        except Exception:
            return None

        if payload.get("type") != "pwreset":
            return None

        email = payload.get("sub")
        jti = payload.get("jti")

        if not email or not jti:
            return None

        stored = await self._redis.get(_PREFIX + email)
        if stored is None:
            return None
        stored = stored.decode() if isinstance(stored, bytes) else stored

        if not secrets.compare_digest(stored, jti):
            return None

        return str(email)


# Singleton; los tests pueden sobreescribir `_store`.
_store: PasswordResetStore | None = None


def get_password_reset_store() -> PasswordResetStore:
    global _store
    if _store is None:
        from gad.redis_client import redis_client

        _store = PasswordResetStore(redis_client)
    return _store
