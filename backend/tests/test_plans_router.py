# backend/tests/test_plans_router.py
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.db import get_session
from gad.plans.router import router as plans_router


@pytest.fixture
def app(db_engine):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(plans_router)

    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    app.state.test_session_maker = test_session_maker
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register(client, email="user@example.com"):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "User"},
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_create_and_list_plan(client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee",
                "mode": "now",
                "title": "Café en Palermo",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201
        plan_id = resp.json()["id"]

        resp = await c.get(
            "/plans?lat=-34.59&lng=-58.43&radius=3000",
            headers=headers,
        )
        assert resp.status_code == 200
        # El propio plan no aparece (se excluye al viewer)
        assert all(p["id"] != plan_id for p in resp.json())


@pytest.mark.asyncio
async def test_get_plan_by_id(app, client):
    from geoalchemy2.elements import WKTElement

    from gad.auth.service import register
    from gad.models.enums import ActivityType, PlanMode
    from gad.models.geo import snap_to_grid
    from gad.models.plan import Plan
    from gad.schemas.auth import RegisterIn

    test_session_maker: async_sessionmaker = app.state.test_session_maker
    async with test_session_maker() as session:
        tokens = await register(
            session,
            RegisterIn(email="host2@example.com", password="12345678", display_name="H"),
        )
        lat, lng = snap_to_grid(-34.59, -58.43)
        plan = Plan(
            host_id=tokens.user_id,
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="X",
            location_label="X",
            location_grid=WKTElement(f"POINT({lng} {lat})", srid=4326),
            expires_at=datetime.now(UTC) + timedelta(hours=2),
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        plan_id = plan.id

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            f"/plans/{plan_id}", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 200
    assert resp.json()["title"] == "X"


@pytest.mark.asyncio
async def test_cancel_own_plan(client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "X",
                "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
            },
            headers=headers,
        )
        plan_id = resp.json()["id"]
        resp = await c.delete(f"/plans/{plan_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
