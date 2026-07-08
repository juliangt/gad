# backend/src/gad/chat/manager.py
"""Gestiona conexiones WebSocket activas y broadcastea mensajes vía Redis pub/sub.

Cada proceso API mantiene un ConnectionManager local. Cuando llega un mensaje,
se persiste y se publica en Redis; todos los procesos lo reciben y lo envían a
las conexiones locales del match correspondiente.
"""
import asyncio
import json
from collections import defaultdict
from contextlib import suppress

from fastapi import WebSocket
from redis.asyncio import Redis

from gad.redis_client import redis_client


class ConnectionManager:
    def __init__(self, redis: Redis | None = None) -> None:
        # match_id -> set of WebSocket
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._subscriber_task: asyncio.Task | None = None
        self._redis = redis or redis_client

    async def connect(self, match_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[match_id].add(ws)

    def disconnect(self, match_id: str, ws: WebSocket) -> None:
        self._connections[match_id].discard(ws)
        if not self._connections[match_id]:
            self._connections.pop(match_id, None)

    async def broadcast_local(self, match_id: str, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections.get(match_id, set()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(match_id, ws)

    async def publish(self, match_id: str, payload: dict) -> None:
        """Publica al canal Redis para que todos los procesos lo broadcasteen."""
        await self._redis.publish(
            f"gad:match:{match_id}", json.dumps(payload, default=str)
        )

    async def start_subscriber(self) -> None:
        """Escucha los canales gad:match:* y broadcastea localmente."""
        if self._subscriber_task is not None:
            return
        self._subscriber_task = asyncio.create_task(self._subscribe_loop())

    async def _subscribe_loop(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.psubscribe("gad:match:*")
        async for msg in pubsub.listen():
            if msg["type"] != "pmessage":
                continue
            try:
                channel = (
                    msg["channel"].decode()
                    if isinstance(msg["channel"], bytes)
                    else msg["channel"]
                )
                match_id = channel.split(":")[-1]
                payload = json.loads(msg["data"])
                await self.broadcast_local(match_id, payload)
            except Exception:
                continue

    async def stop_subscriber(self) -> None:
        if self._subscriber_task is not None:
            self._subscriber_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._subscriber_task
            self._subscriber_task = None


manager = ConnectionManager()
