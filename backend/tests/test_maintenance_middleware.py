import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.middleware.maintenance import MaintenanceMiddleware


async def _build_app(db_engine, *, maintenance_on: bool):
    from gad.models.settings import MaintenanceState

    app = FastAPI()
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    # Seed maintenance state (await directo: pytest-asyncio auto ya corre en loop)
    async with test_sm() as s:
        from sqlalchemy import select

        existing = await s.execute(select(MaintenanceState).where(MaintenanceState.id == 1))
        ms = existing.scalar_one_or_none()
        if ms is None:
            ms = MaintenanceState(
                id=1, enabled=maintenance_on, message="", banner_active=False,
                banner_message="", banner_level="info",
            )
            s.add(ms)
        else:
            ms.enabled = maintenance_on
        await s.commit()

    async def _session():
        async with test_sm() as s:
            yield s

    app.add_middleware(MaintenanceMiddleware, session_factory=test_sm)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/secret")
    async def secret():
        return {"data": "hidden"}

    return app


@pytest.mark.asyncio
async def test_maintenance_off_allows_all(db_engine):
    app = await _build_app(db_engine, maintenance_on=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        assert (await c.get("/health")).status_code == 200
        assert (await c.get("/api/secret")).status_code == 200


@pytest.mark.asyncio
async def test_maintenance_on_blocks_non_exempt(db_engine):
    app = await _build_app(db_engine, maintenance_on=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        # Health está exento
        assert (await c.get("/health")).status_code == 200
        # El resto recibe 503
        resp = await c.get("/api/secret")
        assert resp.status_code == 503
        assert "detail" in resp.json()
