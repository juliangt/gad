# backend/tests/test_redis.py
import asyncio

import pytest


@pytest.mark.asyncio
async def test_redis_set_get(redis_client):
    await redis_client.set("gad:test", "ok", ex=5)
    val = await redis_client.get("gad:test")
    assert val in (b"ok", "ok")


@pytest.mark.asyncio
async def test_redis_pubsub(redis_client):
    received: list[bytes] = []

    async def subscriber():
        pubsub = redis_client.pubsub()
        await pubsub.subscribe("gad:test:channel")
        async for msg in pubsub.listen():
            if msg["type"] == "subscribe":
                continue
            received.append(msg["data"])
            break

    task = asyncio.create_task(subscriber())
    await asyncio.sleep(0.1)
    await redis_client.publish("gad:test:channel", "hello")
    await asyncio.wait_for(task, timeout=2)
    assert received in (["hello"], [b"hello"])
