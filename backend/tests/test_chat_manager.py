# backend/tests/test_chat_manager.py
import asyncio
import json

import pytest

from gad.chat.manager import ConnectionManager


@pytest.mark.asyncio
async def test_publish_broadcasts_via_redis(redis_client):
    """Al publicar en el manager, el mensaje llega al canal Redis."""
    received: list[str] = []

    async def sub():
        ps = redis_client.pubsub()
        await ps.psubscribe("gad:match:*")
        async for m in ps.listen():
            if m["type"] != "pmessage":
                continue
            received.append(m["data"])
            break

    task = asyncio.create_task(sub())
    await asyncio.sleep(0.1)

    m = ConnectionManager(redis=redis_client)
    await m.publish("m1", {"type": "message", "content": "hi"})
    await asyncio.wait_for(task, timeout=2)
    assert received
    data = json.loads(received[0])
    assert data["content"] == "hi"
