# backend/tests/test_admin_moderation.py
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
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
    app.include_router(auth_router)
    app.include_router(admin_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_admin_endpoint_returns_403_for_non_admin(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="u@example.com", password="12345678", display_name="U"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.get("/admin/stats", headers=headers)
    assert resp.status_code == 403


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User

    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_bans_user_and_revokes_token(client, db_session):
    from gad.models.user import User
    from sqlalchemy import update

    admin_tokens = await register(
        db_session,
        RegisterIn(email="admin@example.com", password="12345678", display_name="A"),
    )
    await _make_admin(db_session, admin_tokens.user_id)

    victim = await register(
        db_session,
        RegisterIn(email="v@example.com", password="12345678", display_name="V"),
    )
    admin_headers = {"Authorization": f"Bearer {admin_tokens.access_token}"}
    victim_headers = {"Authorization": f"Bearer {victim.access_token}"}
    async with client as c:
        # Victim puede acceder
        assert (await c.get("/auth/me", headers=victim_headers)).status_code == 200
        # Admin banea
        resp = await c.post(f"/admin/users/{victim.user_id}/ban", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "suspended"
        # Victim ya no puede (status no activo)
        assert (await c.get("/auth/me", headers=victim_headers)).status_code == 401


@pytest.mark.asyncio
async def test_admin_lists_users(client, db_session):
    admin_tokens = await register(
        db_session,
        RegisterIn(email="admin2@example.com", password="12345678", display_name="A2"),
    )
    await _make_admin(db_session, admin_tokens.user_id)
    headers = {"Authorization": f"Bearer {admin_tokens.access_token}"}
    async with client as c:
        resp = await c.get("/admin/users", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert len(body["items"]) >= 1


@pytest.mark.asyncio
async def test_admin_force_cancel_plan(client, db_session):
    from gad.models.enums import ActivityType, PlanMode
    from gad.models.plan import Plan

    admin = await register(
        db_session,
        RegisterIn(email="a3@example.com", password="12345678", display_name="A3"),
    )
    await _make_admin(db_session, admin.user_id)
    plan = Plan(
        host_id=admin.user_id,
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
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.post(f"/admin/plans/{plan.id}/cancel", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_list_and_delete_flagged_reviews(client, db_session):
    from gad.models.enums import (
        ActivityType,
        MatchRole,
        MatchStatus,
        PlanMode,
        ReviewFlag,
    )
    from gad.models.match import Match, MatchParticipant
    from gad.models.plan import Plan
    from gad.models.review import Review

    admin = await register(
        db_session,
        RegisterIn(email="a4@example.com", password="12345678", display_name="A4"),
    )
    await _make_admin(db_session, admin.user_id)
    reviewer = await register(
        db_session,
        RegisterIn(email="rev@example.com", password="12345678", display_name="Rev"),
    )
    reviewee = await register(
        db_session,
        RegisterIn(email="ree@example.com", password="12345678", display_name="Ree"),
    )
    plan = Plan(
        host_id=reviewee.user_id,
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
    match = Match(
        plan_id=plan.id,
        status=MatchStatus.completed,
        started_at=datetime.now(UTC) - timedelta(days=1),
        ended_at=datetime.now(UTC) - timedelta(hours=1),
        location_sharing_active=False,
    )
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)
    for uid, role in [
        (reviewer.user_id, MatchRole.participant),
        (reviewee.user_id, MatchRole.host),
    ]:
        db_session.add(
            MatchParticipant(
                match_id=match.id, user_id=uid, role=role, joined_at=datetime.now(UTC)
            )
        )
    review = Review(
        match_id=match.id,
        reviewer_id=reviewer.user_id,
        reviewee_id=reviewee.user_id,
        rating=1,
        comment="no show",
        flag=ReviewFlag.no_show,
    )
    db_session.add(review)
    await db_session.commit()
    await db_session.refresh(review)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        # Listar flagueadas
        resp = await c.get("/admin/reviews", headers=headers)
        assert resp.status_code == 200
        assert any(r["id"] == str(review.id) for r in resp.json()["items"])
        # Borrarla
        resp_del = await c.delete(f"/admin/reviews/{review.id}", headers=headers)
        assert resp_del.status_code == 200
        # Ya no aparece
        resp2 = await c.get("/admin/reviews", headers=headers)
        assert all(r["id"] != str(review.id) for r in resp2.json()["items"])
