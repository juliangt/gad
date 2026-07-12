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
async def test_grant_admin_endpoint(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    target = await register(
        db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{target.user_id}/grant-admin", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True


@pytest.mark.asyncio
async def test_revoke_admin_self_blocked(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{admin.user_id}/revoke-admin", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_patch_user_updates_fields(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    target = await register(
        db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.patch(
            f"/admin/users/{target.user_id}",
            headers=headers,
            json={"display_name": "Nuevo Nombre", "locale": "en-US"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Nuevo Nombre"
    assert body["locale"] == "en-US"


@pytest.mark.asyncio
async def test_grant_admin_audits(client, db_session):
    from sqlalchemy import select

    from gad.models.settings import AuditEvent

    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    target = await register(
        db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T")
    )
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{target.user_id}/grant-admin", headers=headers)
    assert resp.status_code == 200
    events = (
        await db_session.execute(
            select(AuditEvent).where(AuditEvent.action == "user.grant_admin")
        )
    ).scalars().all()
    assert len(events) == 1
    assert str(events[0].target_id) == str(target.user_id)
