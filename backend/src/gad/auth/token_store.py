"""Revocación de JWT en Redis.

Estrategia:
- Cada jti revocado se guarda con TTL = expiración restante del token.
- Un set por user_id agrupa los jtis activos, para revocación masiva
  (cambio de contraseña, SOS, ban).
"""
from redis.asyncio import Redis

_DENYLIST_PREFIX = "revoked:jti:"
_USER_JTIS_PREFIX = "user_jtis:"


class TokenStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def revoke_jti(self, user_id: str, jti: str, ttl_seconds: int) -> None:
        await self._redis.set(_DENYLIST_PREFIX + jti, "1", ex=ttl_seconds)
        await self._redis.sadd(_USER_JTIS_PREFIX + user_id, jti)
        # El set de jtis del usuario expira con el token más longevo (refresco periódico).
        await self._redis.expire(_USER_JTIS_PREFIX + user_id, ttl_seconds)

    async def is_revoked(self, jti: str) -> bool:
        return bool(await self._redis.exists(_DENYLIST_PREFIX + jti))

    async def revoke_user(self, user_id: str, ttl_seconds: int) -> int:
        """Revoca todos los jtis activos del usuario. Devuelve cuántos revocó."""
        jtis = await self._redis.smembers(_USER_JTIS_PREFIX + user_id)
        count = 0
        for raw in jtis:
            jti = raw.decode() if isinstance(raw, bytes) else raw
            await self._redis.set(_DENYLIST_PREFIX + jti, "1", ex=ttl_seconds)
            count += 1
        await self._redis.delete(_USER_JTIS_PREFIX + user_id)
        return count
