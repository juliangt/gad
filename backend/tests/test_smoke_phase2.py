# backend/tests/test_smoke_phase2.py
"""Smoke test del flujo completo plan + postulación + match de la Fase 2."""
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
async def test_plan_apply_match_flow(client):
    async with client as c:
        # Host crea plan
        host_resp = await c.post(
            "/auth/register",
            json={"email": "host2@example.com", "password": "12345678", "display_name": "H"},
        )
        host_token = host_resp.json()["access_token"]

        plan_resp = await c.post(
            "/plans",
            json={
                "activity_type": "drinks", "mode": "now", "title": "Cervezas",
                "max_participants": 1,
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers={"Authorization": f"Bearer {host_token}"},
        )
        plan_id = plan_resp.json()["id"]

        # Applicant se postula
        app_resp = await c.post(
            "/auth/register",
            json={"email": "app2@example.com", "password": "12345678", "display_name": "A"},
        )
        app_token = app_resp.json()["access_token"]

        apply_resp = await c.post(
            f"/plans/{plan_id}/applications",
            json={"message": "Me sumo"},
            headers={"Authorization": f"Bearer {app_token}"},
        )
        app_id = apply_resp.json()["id"]

        # Host acepta
        accept_resp = await c.post(
            f"/applications/{app_id}/accept",
            headers={"Authorization": f"Bearer {host_token}"},
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["participants"] is not None
        assert len(accept_resp.json()["participants"]) == 2
