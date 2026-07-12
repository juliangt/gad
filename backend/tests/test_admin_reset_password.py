import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.passwords import verify_password
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
async def test_admin_reset_password_sets_new_hash(client, db_session, monkeypatch):
    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    target = await register(
        db_session, RegisterIn(email="target@x.com", password="12345678", display_name="T")
    )

    # Mock revoke_user para no depender de Redis en este test unitario de endpoint.
    async def _noop_revoke(*a, **kw):
        return None
    monkeypatch.setattr("gad.auth.token_store.TokenStore.revoke_user", _noop_revoke)

    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/users/{target.user_id}/reset-password", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    temp_pw = body["temporary_password"]
    assert len(temp_pw) >= 16

    # Verificar que el hash se actualizó y la temp password lo valida.
    from sqlalchemy import select

    from gad.models.user import User
    result = await db_session.execute(select(User).where(User.id == target.user_id))
    user = result.scalar_one()
    assert verify_password(temp_pw, user.password_hash)
