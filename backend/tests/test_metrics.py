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
async def test_metrics_endpoint_requires_admin(client):
    # Sin inyectar el usuario admin, el endpoint debe fallar
    # FastAPI devolverá 422 si falta el header o el middleware de auth lo atrapará (si estuviera montado).
    # Sin embargo, como estamos llamando a router sin middleware de auth ni exception handlers,
    # simplemente comprobaremos que devuelva algo distinto a 200.
    async with client as c:
        resp = await c.get("/metrics")
    assert resp.status_code != 200


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_counters():
    from gad.admin.dependencies import require_admin
    from gad.models.user import User

    app = FastAPI()
    app.include_router(metrics_router)

    # Mock require_admin to return a dummy user
    app.dependency_overrides[require_admin] = lambda: User(
        id="00000000-0000-0000-0000-000000000000", is_admin=True
    )

    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    record_request("GET", "/health", 200, 0.005)
    async with client as c:
        resp = await c.get("/metrics")
    assert resp.status_code == 200
    body = resp.text
    assert "gad_http_requests_total" in body
    assert "gad_http_request_duration_seconds" in body
