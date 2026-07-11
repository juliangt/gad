import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.body_size import BodySizeLimitMiddleware


def _app(max_body: int) -> FastAPI:
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware, max_body=max_body)

    @app.post("/echo")
    async def echo(data: dict):
        return data

    return app


@pytest.mark.asyncio
async def test_rejects_oversized_body():
    app = _app(max_body=100)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/echo", json={"x": "a" * 200})
    assert r.status_code == 413


@pytest.mark.asyncio
async def test_allows_within_limit():
    app = _app(max_body=10_000)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/echo", json={"x": "small"})
    assert r.status_code == 200
