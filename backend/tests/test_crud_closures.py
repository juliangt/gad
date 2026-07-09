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


@pytest.mark.asyncio
async def test_unblock_user(client, db_session):
    from gad.models.social import Block

    tokens = await register(
        db_session,
        RegisterIn(email="b1@example.com", password="12345678", display_name="B1"),
    )
    other = await register(
        db_session,
        RegisterIn(email="b2@example.com", password="12345678", display_name="B2"),
    )
    block = Block(
        blocker_id=tokens.user_id, blocked_id=other.user_id, created_at=datetime.now(UTC)
    )
    db_session.add(block)
    await db_session.commit()
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete(f"/me/blocks/{other.user_id}", headers=headers)
        assert resp.status_code == 200
        # Verificar que ya no está
        resp_list = await c.get("/me/blocks", headers=headers)
        assert resp_list.json() == []


async def _seed_plan(db_session, host_id):
    from gad.models.enums import ActivityType, PlanMode
    from gad.models.plan import Plan

    plan = Plan(
        host_id=host_id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="T",
        location_label="X",
        location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan.id


@pytest.mark.asyncio
async def test_delete_own_message(client, db_session):
    from gad.models.match import Match, Message

    tokens = await register(
        db_session,
        RegisterIn(email="c@example.com", password="12345678", display_name="C"),
    )
    plan_id = await _seed_plan(db_session, tokens.user_id)
    match = Match(
        plan_id=plan_id,
        status="active",
        started_at=datetime.now(UTC),
        location_sharing_active=False,
    )
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)
    msg = Message(
        match_id=match.id,
        sender_id=tokens.user_id,
        content="hola",
        created_at=datetime.now(UTC),
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete(f"/messages/{msg.id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_notification_read_all_and_delete(client, db_session):
    from gad.models.enums import NotificationType
    from gad.notifications.service import create_notification

    tokens = await register(
        db_session,
        RegisterIn(email="n@example.com", password="12345678", display_name="N"),
    )
    for _ in range(3):
        await create_notification(db_session, tokens.user_id, NotificationType.match, {})
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.post("/notifications/read-all", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["marked"] == 3
        resp_del = await c.delete("/notifications", headers=headers)
        assert resp_del.status_code == 200
        assert resp_del.json()["deleted"] == 3
