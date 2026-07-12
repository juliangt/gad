import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session

    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(admin_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User

    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


@pytest.mark.asyncio
async def test_search_users_by_email_substring(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    await register(
        db_session, RegisterIn(email="alice@x.com", password="12345678", display_name="Alice")
    )
    await register(
        db_session, RegisterIn(email="bob@x.com", password="12345678", display_name="Bob")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers, params={"q": "alice"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "alice@x.com"


@pytest.mark.asyncio
async def test_search_users_by_display_name(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="Admin")
    )
    await _make_admin(db_session, admin.user_id)
    await register(
        db_session, RegisterIn(email="z@x.com", password="12345678", display_name="Zoe Runner")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers, params={"q": "runner"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["display_name"] == "Zoe Runner"


@pytest.mark.asyncio
async def test_filter_users_by_is_admin(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    await register(
        db_session, RegisterIn(email="plain@x.com", password="12345678", display_name="Plain")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers, params={"is_admin": "true"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["is_admin"] is True


@pytest.mark.asyncio
async def test_search_combined_q_and_is_admin(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@example.com", password="12345678", display_name="Alice")
    )
    await _make_admin(db_session, admin.user_id)
    await register(
        db_session, RegisterIn(email="alice@x.com", password="12345678", display_name="Alice Non")
    )
    await register(
        db_session, RegisterIn(email="bob@x.com", password="12345678", display_name="Bob Non")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(
            "/admin/users", headers=headers, params={"q": "alice", "is_admin": "false"}
        )
    assert resp.status_code == 200
    items = resp.json()["items"]
    # q=alice coincide con el admin y con alice@x.com, pero is_admin=false deja
    # solo a la usuaria no-admin.
    assert len(items) == 1
    assert items[0]["email"] == "alice@x.com"
    assert items[0]["is_admin"] is False
