# backend/tests/test_smoke_phase1.py
"""Smoke test del flujo completo de perfil + planes de la Fase 1."""
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.db import get_session
from gad.main import create_app
from gad.storage import set_storage
from gad.storage.local import LocalFilesystemBackend


@pytest.fixture(autouse=True)
def _storage(tmp_path):
    set_storage(LocalFilesystemBackend(base_dir=tmp_path, base_url="/media"))
    yield
    set_storage(LocalFilesystemBackend())


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
async def test_full_profile_and_plan_flow(client):
    async with client as c:
        # 1. Registro
        resp = await c.post(
            "/auth/register",
            json={"email": "phase1@example.com", "password": "12345678", "display_name": "P1"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Completar perfil
        resp = await c.patch("/me", json={"bio": "Testing"}, headers=headers)
        assert resp.status_code == 200

        # 3. Setear preferencias
        resp = await c.put(
            "/me/preferences",
            json={"default_search_radius_m": 3000, "activity_types": ["coffee", "drinks"]},
            headers=headers,
        )
        assert resp.status_code == 200

        # 4. Crear plan
        resp = await c.post(
            "/plans",
            json={
                "activity_type": "coffee", "mode": "now", "title": "Test plan",
                "location": {"lat": -34.59, "lng": -58.43, "label": "Palermo"},
            },
            headers=headers,
        )
        assert resp.status_code == 201
        plan_id = resp.json()["id"]

        # 5. Ver propio plan por id (no aparece en listado, pero sí por id)
        resp = await c.get(f"/plans/{plan_id}", headers=headers)
        assert resp.status_code == 200

        # 6. Cancelar plan
        resp = await c.delete(f"/plans/{plan_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"
