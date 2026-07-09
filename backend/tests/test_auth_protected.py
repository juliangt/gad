# backend/tests/test_auth_protected.py
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
def app(db_engine, redis_client):
    import gad.auth.dependencies as deps
    from gad.auth.token_store import TokenStore

    app = FastAPI()

    # Handler de excepciones de dominio (en producción lo registra create_app()).
    @app.exception_handler(GADError)
    async def _gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    # Override get_session para usar el engine de testcontainers, no el global.
    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    from gad.db import get_session

    app.dependency_overrides[get_session] = _get_test_session

    # Proveer el TokenStore al módulo dependencies (override global temporal).
    deps._token_store = TokenStore(redis_client)

    app.include_router(router)
    yield app
    # Reset para no contaminar a otros tests que usen el mismo módulo.
    deps._token_store = None


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_protected_endpoint_without_token_returns_401(client):
    async with client as c:
        resp = await c.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_with_valid_token_returns_user(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "ana@example.com"


@pytest.mark.asyncio
async def test_revoked_access_token_is_rejected(client, db_session, redis_client):
    from gad.auth.jwt import decode_token
    from gad.auth.token_store import TokenStore

    tokens = await register(
        db_session,
        RegisterIn(email="rev@example.com", password="12345678", display_name="Rev"),
    )
    payload = decode_token(tokens.access_token)
    store = TokenStore(redis_client)
    await store.revoke_jti(str(tokens.user_id), payload["jti"], ttl_seconds=900)

    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_deleted_user_token_is_rejected(client, db_session):
    from sqlalchemy import update

    from gad.models.enums import UserStatus
    from gad.models.user import User

    tokens = await register(
        db_session,
        RegisterIn(email="del@example.com", password="12345678", display_name="Del"),
    )

    # Marcar usuario como borrado directamente
    await db_session.execute(
        update(User).where(User.id == tokens.user_id).values(status=UserStatus.deleted)
    )
    await db_session.commit()

    async with client as c:
        resp = await c.get(
            "/auth/me", headers={"Authorization": f"Bearer {tokens.access_token}"}
        )
    assert resp.status_code == 401
