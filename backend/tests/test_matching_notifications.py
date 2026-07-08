# backend/tests/test_matching_notifications.py
import asyncio
import json

import pytest


@pytest.mark.asyncio
async def test_publish_match_created_delivers_to_all_participants(redis_client):
    # El módulo notifications usa el redis_client global (apunta a REDIS_URL,
    # inaccesible en tests). Lo parcheamos con el cliente del container.
    import gad.matching.notifications as notif_mod

    original = notif_mod.redis_client
    notif_mod.redis_client = redis_client
    try:
        received: list[dict] = []

        async def subscriber(channel):
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(channel)
            async for msg in pubsub.listen():
                if msg["type"] == "subscribe":
                    continue
                received.append(json.loads(msg["data"]))
                break

        task1 = asyncio.create_task(subscriber("gad:user:u1"))
        task2 = asyncio.create_task(subscriber("gad:user:u2"))
        await asyncio.sleep(0.1)

        await notif_mod.publish_match_created("m1", "p1", ["u1", "u2"])
        await asyncio.wait_for(asyncio.gather(task1, task2), timeout=2)

        assert len(received) == 2
        assert all(r["type"] == "match_created" for r in received)
    finally:
        notif_mod.redis_client = original
