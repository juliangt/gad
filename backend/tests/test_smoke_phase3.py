# backend/tests/test_smoke_phase3.py
"""Smoke test de chat y notificaciones de la Fase 3."""
import uuid

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
async def test_notifications_endpoint_requires_auth(client):
    async with client as c:
        resp = await c.get("/notifications")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_history_requires_participant(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "p3@example.com", "password": "12345678", "display_name": "P3"},
        )
        token = resp.json()["access_token"]

        resp = await c.get(
            f"/matches/{uuid.uuid4()}/messages",
            headers={"Authorization": f"Bearer {token}"},
        )
    # Como no es participante, ValidationError → 422
    assert resp.status_code in (400, 404, 422)
