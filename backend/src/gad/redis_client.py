# backend/src/gad/redis_client.py
from redis.asyncio import Redis, from_url

from gad.config import settings

redis_client: Redis = from_url(settings.redis_url, decode_responses=False)
