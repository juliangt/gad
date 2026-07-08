# backend/tests/test_reviews_router.py
import uuid

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.db import get_session
from gad.exceptions import GADError
from gad.reviews.router import router as reviews_router


@pytest.fixture
def app(db_engine):
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(reviews_router)

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
async def test_reviews_requires_auth(client):
    async with client as c:
        resp = await c.get(f"/reviews?user_id={uuid.uuid4()}")
    assert resp.status_code == 401
