# backend/tests/test_smoke_phase4.py
"""Smoke test de seguridad de la Fase 4."""
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
async def test_safety_endpoints_require_auth(client):
    async with client as c:
        resp = await c.get("/me/trusted-contacts")
        assert resp.status_code == 401

        resp = await c.post(f"/safety/{uuid.uuid4()}/ping", json={"lat": 0, "lng": 0})
        assert resp.status_code == 401
