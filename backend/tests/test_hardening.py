# backend/tests/test_hardening.py
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
async def test_csp_header_present(client):
    async with client as c:
        resp = await c.get("/x")
    assert "content-security-policy" in {k.lower() for k in resp.headers}
    assert "default-src 'self'" in resp.headers["content-security-policy"]
