import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router
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
    app.include_router(router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_change_password_then_old_token_revoked(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="cp@example.com", password="12345678", display_name="Cp"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.post(
            "/auth/change-password",
            json={"old_password": "12345678", "new_password": "newpass123"},
            headers=headers,
        )
        assert resp.status_code == 200
        # El access token viejo queda revocado
        resp_me = await c.get("/auth/me", headers=headers)
        assert resp_me.status_code == 401
        # Login con la nueva password funciona
        resp_login = await c.post(
            "/auth/login", json={"email": "cp@example.com", "password": "newpass123"}
        )
        assert resp_login.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_old_returns_401(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="cp2@example.com", password="12345678", display_name="Cp2"),
    )
    async with client as c:
        resp = await c.post(
            "/auth/change-password",
            json={"old_password": "wrong", "new_password": "newpass123"},
            headers={"Authorization": f"Bearer {tokens.access_token}"},
        )
    assert resp.status_code == 401
