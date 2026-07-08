# backend/tests/test_smoke.py
"""Smoke test del flujo completo de auth usando la app real (create_app)."""
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.db import get_session
from gad.main import create_app


@pytest.fixture
def app(db_engine):
    app = create_app()

    # Override get_session para usar el engine de testcontainers, no el global.
    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_full_auth_flow(client):
    async with client as c:
        # 1. Registro
        resp = await c.post(
            "/auth/register",
            json={"email": "smoke@example.com", "password": "12345678", "display_name": "Smoke"},
        )
        assert resp.status_code == 201
        tokens = resp.json()

        # 2. /me con access token
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "smoke@example.com"

        # 3. Refresh
        resp = await c.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert resp.status_code == 200
        assert resp.json()["access_token"] != tokens["access_token"]

        # 4. Login
        resp = await c.post(
            "/auth/login",
            json={"email": "smoke@example.com", "password": "12345678"},
        )
        assert resp.status_code == 200

        # 5. Health
        resp = await c.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
