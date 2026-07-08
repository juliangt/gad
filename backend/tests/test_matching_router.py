# backend/tests/test_matching_router.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.db import get_session
from gad.matching.router import router as matching_router
from gad.plans.router import router as plans_router


@pytest.fixture
def app(db_engine):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(plans_router)
    app.include_router(matching_router)

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


async def _register(client, email):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "U"},
    )
    return resp.json()["access_token"], resp.json()["user_id"]


async def _create_plan(client, token):
    resp = await client.post(
        "/plans",
        json={
            "activity_type": "coffee", "mode": "now", "title": "X", "max_participants": 1,
            "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_full_apply_accept_flow(client):
    async with client as c:
        host_token, host_id = await _register(c, "host@example.com")
        app_token, app_id = await _register(c, "applicant@example.com")

        plan_id = await _create_plan(c, host_token)

        # Applicant se postula
        resp = await c.post(
            f"/plans/{plan_id}/applications",
            json={"message": "Hola"},
            headers={"Authorization": f"Bearer {app_token}"},
        )
        assert resp.status_code == 201
        app_id_resp = resp.json()["id"]

        # Host ve postulaciones
        resp = await c.get(
            f"/plans/{plan_id}/applications",
            headers={"Authorization": f"Bearer {host_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Host acepta → crea match
        resp = await c.post(
            f"/applications/{app_id_resp}/accept",
            headers={"Authorization": f"Bearer {host_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

        # Ambos ven el match
        resp = await c.get("/matches", headers={"Authorization": f"Bearer {host_token}"})
        assert len(resp.json()) == 1
        resp = await c.get("/matches", headers={"Authorization": f"Bearer {app_token}"})
        assert len(resp.json()) == 1
