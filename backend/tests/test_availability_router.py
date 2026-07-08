# backend/tests/test_availability_router.py
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.availability.router import router as availability_router
from gad.db import get_session
from gad.exceptions import GADError


@pytest.fixture
def app(db_engine):
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(availability_router)

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
async def test_activate_and_deactivate_flow(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "avr@example.com", "password": "12345678", "display_name": "U"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        resp = await c.post(
            "/availability",
            json={"location": {"lat": -34.59, "lng": -58.43}, "radius_m": 3000},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["active"] is True

        resp = await c.get("/availability/me", headers=headers)
        assert resp.status_code == 200

        resp = await c.delete("/availability/me", headers=headers)
        assert resp.status_code == 200
