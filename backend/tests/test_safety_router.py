# backend/tests/test_safety_router.py
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.db import get_session
from gad.exceptions import GADError
from gad.safety.public_router import router as public_router
from gad.safety.router import router as safety_router


@pytest.fixture
def app(db_engine):
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(safety_router)
    app.include_router(public_router)

    @app.exception_handler(GADError)
    async def gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

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
async def test_trusted_contacts_crud(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "sc@example.com", "password": "12345678", "display_name": "S"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        resp = await c.post(
            "/me/trusted-contacts",
            json={"contact_type": "email", "contact_value": "m@example.com", "label": "Mom"},
            headers=headers,
        )
        assert resp.status_code == 201
        contact_id = resp.json()["id"]

        resp = await c.get("/me/trusted-contacts", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        resp = await c.delete(f"/me/trusted-contacts/{contact_id}", headers=headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_public_link_invalid_returns_401(client):
    async with client as c:
        resp = await c.get("/s/invalid-token")
    assert resp.status_code == 401
