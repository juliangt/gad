from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import update

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.matching.router import router as matching_router
from gad.models.enums import NotificationType
from gad.notifications.router import router as notif_router
from gad.notifications.service import create_notification
from gad.plans.router import router as plans_router
from gad.reviews.router import router as reviews_router
from gad.schemas.auth import RegisterIn
from gad.schemas.pagination import PaginatedOut


class _Item(BaseModel):
    name: str


def test_paginated_out_with_items_and_cursor():
    out = PaginatedOut[_Item](items=[], next_cursor=None)
    assert out.items == []
    assert out.next_cursor is None


def test_paginated_out_serializes_cursor_as_iso():
    ts = datetime(2026, 7, 8, 12, 0, tzinfo=UTC)
    out = PaginatedOut[dict](items=[{"a": 1}], next_cursor=ts.isoformat())
    dumped = out.model_dump()
    assert dumped["next_cursor"] == ts.isoformat()


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
    app.include_router(notif_router)
    app.include_router(reviews_router)
    app.include_router(matching_router)
    app.include_router(plans_router)
    app.include_router(admin_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_notifications_pagination_returns_cursor(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="n@example.com", password="12345678", display_name="N"),
    )
    # Crear 3 notificaciones (timestamps distintos en microsegundos)
    for _ in range(3):
        await create_notification(db_session, tokens.user_id, NotificationType.match, {})
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        # Pedir 2
        resp = await c.get("/notifications?limit=2", headers=headers)
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None
        # Pedir la siguiente página (el cursor debe ir url-encoded)
        resp2 = await c.get(
            f"/notifications?limit=2&before={quote(body['next_cursor'])}",
            headers=headers,
        )
        body2 = resp2.json()
        assert len(body2["items"]) == 1


@pytest.mark.asyncio
async def test_reviews_pagination_returns_cursor(client, db_session):
    from gad.models.plan import Plan
    from gad.models.match import Match, MatchParticipant
    from gad.models.review import Review
    from gad.models.enums import ActivityType, PlanMode, MatchStatus, MatchRole

    # Registrar usuarios
    reviewer = await register(
        db_session,
        RegisterIn(email="rev1@example.com", password="12345678", display_name="R1"),
    )
    reviewee = await register(
        db_session,
        RegisterIn(email="rev2@example.com", password="12345678", display_name="R2"),
    )

    # Crear plan
    plan = Plan(
        host_id=reviewee.user_id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Coffee Time",
        location_label="Central Cafe",
        location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    # Crear 3 encuentros (matches) y 3 reseñas sobre el reviewee
    now = datetime.now(UTC)
    for i in range(3):
        match = Match(
            plan_id=plan.id,
            status=MatchStatus.completed,
            started_at=now - timedelta(days=i + 1),
            ended_at=now - timedelta(days=i + 1, hours=-1),
            location_sharing_active=False,
        )
        db_session.add(match)
        await db_session.commit()
        await db_session.refresh(match)

        # Participantes
        p1 = MatchParticipant(match_id=match.id, user_id=reviewer.user_id, role=MatchRole.participant, joined_at=now)
        p2 = MatchParticipant(match_id=match.id, user_id=reviewee.user_id, role=MatchRole.host, joined_at=now)
        db_session.add_all([p1, p2])

        # Crear reseña con created_at desfasados para orden de paginación
        review = Review(
            match_id=match.id,
            reviewer_id=reviewer.user_id,
            reviewee_id=reviewee.user_id,
            rating=5,
            comment=f"Review {i}",
            created_at=now - timedelta(hours=i),
        )
        db_session.add(review)
        await db_session.commit()

    headers = {"Authorization": f"Bearer {reviewer.access_token}"}
    async with client as c:
        resp = await c.get(f"/reviews?user_id={reviewee.user_id}&limit=2", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None

        resp2 = await c.get(f"/reviews?user_id={reviewee.user_id}&limit=2&before={quote(body['next_cursor'])}", headers=headers)
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert len(body2["items"]) == 1


@pytest.mark.asyncio
async def test_matches_pagination_returns_cursor(client, db_session):
    from gad.models.plan import Plan
    from gad.models.match import Match, MatchParticipant
    from gad.models.enums import ActivityType, PlanMode, MatchStatus, MatchRole

    user = await register(
        db_session,
        RegisterIn(email="m1@example.com", password="12345678", display_name="M1"),
    )
    other = await register(
        db_session,
        RegisterIn(email="m2@example.com", password="12345678", display_name="M2"),
    )

    plan = Plan(
        host_id=user.user_id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Plan",
        location_label="L",
        location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    now = datetime.now(UTC)
    # Crear 3 matches con diferentes started_at
    for i in range(3):
        match = Match(
            plan_id=plan.id,
            status=MatchStatus.active,
            started_at=now - timedelta(hours=i),
            location_sharing_active=False,
        )
        db_session.add(match)
        await db_session.commit()
        await db_session.refresh(match)

        p1 = MatchParticipant(match_id=match.id, user_id=user.user_id, role=MatchRole.host, joined_at=now)
        p2 = MatchParticipant(match_id=match.id, user_id=other.user_id, role=MatchRole.participant, joined_at=now)
        db_session.add_all([p1, p2])
        await db_session.commit()

    headers = {"Authorization": f"Bearer {user.access_token}"}
    async with client as c:
        resp = await c.get("/matches?limit=2", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None

        resp2 = await c.get(f"/matches?limit=2&before={quote(body['next_cursor'])}", headers=headers)
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert len(body2["items"]) == 1


@pytest.mark.asyncio
async def test_me_applications_pagination_returns_cursor(client, db_session):
    from gad.models.plan import Plan, PlanApplication
    from gad.models.enums import ActivityType, PlanMode

    applicant = await register(
        db_session,
        RegisterIn(email="app@example.com", password="12345678", display_name="App"),
    )
    headers = {"Authorization": f"Bearer {applicant.access_token}"}
    now = datetime.now(UTC)

    # Crear 3 planes diferentes para poder postularse
    for i in range(3):
        host = await register(
            db_session,
            RegisterIn(email=f"host{i}@example.com", password="12345678", display_name=f"Host{i}"),
        )
        plan = Plan(
            host_id=host.user_id,
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title=f"Plan {i}",
            location_label="L",
            location_grid="SRID=4326;POINT(-58.4 -34.6)",
            expires_at=now + timedelta(hours=2),
        )
        db_session.add(plan)
        await db_session.commit()
        await db_session.refresh(plan)

        app = PlanApplication(
            plan_id=plan.id,
            applicant_id=applicant.user_id,
            message=f"Msg {i}",
            created_at=now - timedelta(hours=i),
        )
        db_session.add(app)
        await db_session.commit()

    async with client as c:
        resp = await c.get("/me/applications?limit=2", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None

        resp2 = await c.get(f"/me/applications?limit=2&before={quote(body['next_cursor'])}", headers=headers)
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert len(body2["items"]) == 1


@pytest.mark.asyncio
async def test_admin_reports_pagination_returns_cursor(client, db_session):
    from gad.models.report import Report
    from gad.models.user import User

    admin = await register(
        db_session,
        RegisterIn(email="admin_pag@example.com", password="12345678", display_name="Admin"),
    )
    # Hacer admin
    await db_session.execute(update(User).where(User.id == admin.user_id).values(is_admin=True))
    await db_session.commit()

    reporter = await register(
        db_session,
        RegisterIn(email="reporter_pag@example.com", password="12345678", display_name="Rep"),
    )
    reported = await register(
        db_session,
        RegisterIn(email="reported_pag@example.com", password="12345678", display_name="Rpd"),
    )

    now = datetime.now(UTC)
    # Crear 3 reportes
    for i in range(3):
        report = Report(
            reporter_id=reporter.user_id,
            reported_id=reported.user_id,
            reason="spam",
            description=f"Desc {i}",
            status="open",
            created_at=now - timedelta(hours=i),
        )
        db_session.add(report)
        await db_session.commit()

    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get("/admin/reports?limit=2", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None

        resp2 = await c.get(f"/admin/reports?limit=2&before={quote(body['next_cursor'])}", headers=headers)
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert len(body2["items"]) == 1
