# backend/tests/test_my_plans_router.py
from datetime import UTC, datetime, timedelta

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
async def test_my_plans_returns_own_plans(client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee",
                "mode": "now",
                "title": "Mi café",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201
        plan_id = resp.json()["id"]

        resp = await c.get("/me/plans", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["next_cursor"] is None
        assert any(p["id"] == plan_id for p in data["items"])
        # El plan recién creado no tiene postulaciones pendientes
        mine = next(p for p in data["items"] if p["id"] == plan_id)
        assert mine["pending_applications_count"] == 0


@pytest.mark.asyncio
async def test_my_plans_excludes_cancelled_and_hidden(app, client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}
        # Plan visible
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "Visible",
                "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
            },
            headers=headers,
        )
        visible_id = resp.json()["id"]
        # Plan a eliminar
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "drinks", "mode": "now", "title": "A borrar",
                "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
            },
            headers=headers,
        )
        deleted_id = resp.json()["id"]
        # Eliminar (cancel + hidden)
        resp = await c.delete(f"/plans/{deleted_id}", headers=headers)
        assert resp.status_code == 200

        resp = await c.get("/me/plans", headers=headers)
        ids = [p["id"] for p in resp.json()["items"]]
        assert visible_id in ids
        assert deleted_id not in ids


@pytest.mark.asyncio
async def test_my_plans_status_filter(client):
    async with client as c:
        token = await _register(c)
        headers = {"Authorization": f"Bearer {token}"}
        await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "Open",
                "location": {"lat": -34.59, "lng": -58.43, "label": "X"},
            },
            headers=headers,
        )

        # Filtrar solo cancelled → no debería retornar el plan open
        resp = await c.get("/me/plans?status=cancelled", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 0

        # Filtrar solo open → debería retornar el plan
        resp = await c.get("/me/plans?status=open", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_cancel_endpoint_sets_cancelled(app, client):
    """DELETE /plans/{id} debe setear status=cancelled (y hidden_by_host internamente)."""
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
    body = resp.json()
    assert body["status"] == "cancelled"
