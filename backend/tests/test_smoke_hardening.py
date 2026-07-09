"""Smoke: headers de seguridad presentes y chat sanitiza."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.security_headers import SecurityHeadersMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/x")
    async def x():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_all_security_headers_present(client):
    async with client as c:
        resp = await c.get("/x")
    headers = {k.lower() for k in resp.headers}
    assert "content-security-policy" in headers
    assert "x-content-type-options" in headers
    assert "x-frame-options" in headers
    assert "referrer-policy" in headers
    assert "permissions-policy" in headers
