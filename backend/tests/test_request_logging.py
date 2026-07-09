import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.request_logging import RequestLoggingMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_middleware_logs_and_completes_request(client):
    async with client as c:
        resp = await c.get("/ping")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
