# backend/tests/test_smoke_phase6.py
"""Smoke test final: cubre el flujo completo del producto.

Registro → completar perfil → crear plan → health → notifications.
"""
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.db import get_session
from gad.main import create_app


@pytest.fixture
def app(db_engine):
    app = create_app()

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
async def test_end_to_end_flow(client):
    async with client as c:
        # 1. Registro host
        resp = await c.post(
            "/auth/register",
            json={"email": "e2e@example.com", "password": "12345678", "display_name": "E2E"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Perfil + preferencias
        await c.patch("/me", json={"bio": "Testing"}, headers=headers)
        await c.put(
            "/me/preferences",
            json={"activity_types": ["coffee"]},
            headers=headers,
        )

        # 3. Crear plan
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "Final test",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201

        # 4. Health
        resp = await c.get("/health")
        assert resp.status_code == 200

        # 5. Notifications vacías
        resp = await c.get("/notifications", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
