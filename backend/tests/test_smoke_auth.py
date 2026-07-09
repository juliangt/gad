"""Smoke test e2e del flujo de auth crítico: registro → logout → reset → baja."""
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn
from gad.users.router import router as users_router


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
    app.include_router(users_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_full_auth_lifecycle(client, db_session, redis_client):
    # 1. Registro
    tokens = await register(
        db_session,
        RegisterIn(email="life@example.com", password="12345678", display_name="Life"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        # 2. /auth/me funciona
        assert (await c.get("/auth/me", headers=headers)).status_code == 200
        # 3. Logout revoca
        await c.post("/auth/logout", json={"access_token": tokens.access_token})
        assert (await c.get("/auth/me", headers=headers)).status_code == 401
        # 4. Re-login
        resp = await c.post(
            "/auth/login", json={"email": "life@example.com", "password": "12345678"}
        )
        assert resp.status_code == 200
        new_tokens = resp.json()
        new_headers = {"Authorization": f"Bearer {new_tokens['access_token']}"}
        # 5. Cambio de password
        resp = await c.post(
            "/auth/change-password",
            json={"old_password": "12345678", "new_password": "newpass123"},
            headers=new_headers,
        )
        assert resp.status_code == 200
        # 6. Reset de password
        await c.post(
            "/auth/password-reset/request", json={"email": "life@example.com"}
        )
        token = await redis_client.get("pwreset:life@example.com")
        token = token.decode() if isinstance(token, bytes) else token
        resp = await c.post(
            "/auth/password-reset/confirm",
            json={"token": token, "new_password": "finalpass123"},
        )
        assert resp.status_code == 200
        # 7. Login con la password final
        resp = await c.post(
            "/auth/login",
            json={"email": "life@example.com", "password": "finalpass123"},
        )
        assert resp.status_code == 200
        final_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        # 8. Baja de cuenta
        resp = await c.delete("/me", headers=final_headers)
        assert resp.status_code == 204
        assert (await c.get("/me", headers=final_headers)).status_code == 401
