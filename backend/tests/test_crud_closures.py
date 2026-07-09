# backend/tests/test_crud_closures.py
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.chat.router import router as chat_router
from gad.exceptions import GADError
from gad.notifications.push_router import router as push_router
from gad.notifications.router import router as notif_router
from gad.plans.router import router as plans_router
from gad.reviews.router import router as reviews_router
from gad.safety.router import router as safety_router
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
    app.include_router(plans_router)
    app.include_router(chat_router)
    app.include_router(notif_router)
    app.include_router(push_router)
    app.include_router(safety_router)
    app.include_router(reviews_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_patch_plan_updates_title(client, db_session):
    from gad.models.enums import ActivityType, PlanMode
    from gad.models.plan import Plan

    tokens = await register(
        db_session,
        RegisterIn(email="h@example.com", password="12345678", display_name="H"),
    )
    plan = Plan(
        host_id=tokens.user_id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Original",
        description="Desc",
        location_label="Café",
        location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.patch(f"/plans/{plan.id}", json={"title": "Editado"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Editado"
