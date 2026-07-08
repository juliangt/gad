# backend/tests/test_users_router.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.db import get_session
from gad.schemas.auth import RegisterIn
from gad.storage import set_storage
from gad.storage.local import LocalFilesystemBackend
from gad.users.router import router as users_router


@pytest.fixture(autouse=True)
def _storage(tmp_path):
    set_storage(LocalFilesystemBackend(base_dir=tmp_path, base_url="/media"))
    yield
    set_storage(LocalFilesystemBackend())


@pytest.fixture
def app(db_engine):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(users_router)

    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    # Expone el session_maker para que los tests creen datos fuera del HTTP,
    # contra el mismo engine de testcontainers.
    app.state.test_session_maker = test_session_maker
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register_and_get_token(client, email="user@example.com"):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "User"},
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_get_me_returns_detail(client):
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "email" in resp.json()
    assert "preferences" in resp.json()


@pytest.mark.asyncio
async def test_patch_me_updates_bio(client):
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.patch(
            "/me",
            json={"bio": "Hola"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["bio"] == "Hola"


@pytest.mark.asyncio
async def test_put_preferences(client):
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.put(
            "/me/preferences",
            json={"default_search_radius_m": 5000, "activity_types": ["coffee"]},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["default_search_radius_m"] == 5000


@pytest.mark.asyncio
async def test_get_other_user_public(app, client):
    test_session_maker: async_sessionmaker = app.state.test_session_maker
    async with test_session_maker() as session:
        t2 = await register(
            session,
            RegisterIn(email="other@example.com", password="12345678", display_name="Other"),
        )
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.get(
            f"/users/{t2.user_id}", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Other"
    assert "email" not in body


@pytest.mark.asyncio
async def test_block_user(app, client):
    test_session_maker: async_sessionmaker = app.state.test_session_maker
    async with test_session_maker() as session:
        t2 = await register(
            session,
            RegisterIn(email="block@example.com", password="12345678", display_name="B"),
        )
    async with client as c:
        token = await _register_and_get_token(c)
        resp = await c.post(
            f"/users/{t2.user_id}/block", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 201
        resp = await c.get("/me/blocks", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
