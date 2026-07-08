# backend/tests/test_security_headers.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.health import router as health_router
from gad.middleware.security_headers import SecurityHeadersMiddleware


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(health_router)
    app.add_middleware(SecurityHeadersMiddleware)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_security_headers_present(client):
    async with client as c:
        resp = await c.get("/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
