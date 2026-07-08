# backend/tests/test_rate_limit.py
"""Test de rate limiting con slowapi usando un limiter dedicado que apunta
al Redis de testcontainers.

El limiter global del módulo middleware.rate_limit se inicializa con el REDIS_URL
del .env (inaccesible en tests), por eso este test construye un limiter propio.
"""
import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


@pytest.fixture
def app(redis_container):
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)

    limiter = Limiter(
        key_func=get_remote_address,
        enabled=True,
        storage_uri=f"redis://{host}:{port}/0",
    )

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.post("/ping")
    @limiter.limit("5/minute")
    async def ping(request: Request) -> dict[str, str]:
        return {"ok": "true"}

    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_login_rate_limited_after_5_attempts(client):
    async with client as c:
        responses = [await c.post("/ping") for _ in range(6)]
    statuses = [r.status_code for r in responses]
    # Los primeros 5 pasan (200), el 6º es 429.
    assert statuses[:5] == [200, 200, 200, 200, 200]
    assert statuses[5] == 429
