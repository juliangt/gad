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
async def test_password_reset_full_flow(client, db_session, redis_client):
    await register(
        db_session,
        RegisterIn(email="reset@example.com", password="12345678", display_name="R"),
    )
    async with client as c:
        # 1. Solicitar reset
        resp = await c.post(
            "/auth/password-reset/request", json={"email": "reset@example.com"}
        )
        assert resp.status_code == 202
        # 2. Extraer el token de Redis (en prod iría por email)
        token = await redis_client.get("pwreset:reset@example.com")
        token = token.decode() if isinstance(token, bytes) else token
        # 3. Confirmar con nueva password
        resp2 = await c.post(
            "/auth/password-reset/confirm",
            json={"token": token, "new_password": "brandnew123"},
        )
        assert resp2.status_code == 200
        # 4. Login con la nueva password
        resp3 = await c.post(
            "/auth/login",
            json={"email": "reset@example.com", "password": "brandnew123"},
        )
        assert resp3.status_code == 200


@pytest.mark.asyncio
async def test_password_reset_confirm_invalid_token_returns_401(client):
    async with client as c:
        resp = await c.post(
            "/auth/password-reset/confirm",
            json={"token": "garbage", "new_password": "brandnew123"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_request_unknown_email_returns_202(client):
    """No filtrar qué emails existen: siempre 202."""
    async with client as c:
        resp = await c.post(
            "/auth/password-reset/request", json={"email": "nobody@example.com"}
        )
    assert resp.status_code == 202
