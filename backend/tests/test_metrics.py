import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.metrics import metrics_router, record_request


@pytest.fixture
async def client():
    app = FastAPI()
    app.include_router(metrics_router)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_counters(client):
    record_request("GET", "/health", 200, 0.005)
    async with client as c:
        resp = await c.get("/metrics")
    assert resp.status_code == 200
    body = resp.text
    assert "gad_http_requests_total" in body
    assert "gad_http_request_duration_seconds" in body
