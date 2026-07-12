import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import Request
from starlette.responses import JSONResponse

from gad.exceptions import GADError
from gad.feature_flags import require_feature


def _build_app(db_engine):

    from gad.db import get_session

    app = FastAPI()
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    app.dependency_overrides[get_session] = _session

    @app.exception_handler(GADError)
    async def gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.get("/reviews-enabled")
    async def reviews_enabled(_=require_feature("reviews")):
        return {"ok": True}

    return app, test_sm


@pytest.mark.asyncio
async def test_require_feature_allows_when_enabled(db_engine):
    app, test_sm = _build_app(db_engine)
    from gad.models.settings import FeatureFlag

    async with test_sm() as s:
        s.add(FeatureFlag(key="reviews", enabled=True))
        await s.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/reviews-enabled")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_require_feature_blocks_when_disabled(db_engine):
    app, test_sm = _build_app(db_engine)
    from gad.models.settings import FeatureFlag

    async with test_sm() as s:
        s.add(FeatureFlag(key="reviews", enabled=False))
        await s.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/reviews-enabled")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_require_feature_fail_open_when_missing(db_engine):
    app, _ = _build_app(db_engine)
    # No seed → flag inexistente → fail-open (200)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/reviews-enabled")
    assert resp.status_code == 200
