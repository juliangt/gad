"""Smoke: una request genera log y métrica, /metrics responde."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.metrics import metrics_router
from gad.middleware.request_logging import RequestLoggingMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(metrics_router)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_request_generates_metric_visible_in_metrics(client):
    async with client as c:
        await c.get("/ping")
        resp = await c.get("/metrics")
    assert resp.status_code == 200
    assert "gad_http_requests_total" in resp.text
    # La request a /ping debe contar
    assert 'path="/ping"' in resp.text
