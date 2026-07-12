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


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User
    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _seed_plan_with_app(db_session):
    from datetime import UTC, datetime, timedelta

    from geoalchemy2.elements import WKTElement

    from gad.models.enums import (
        ActivityType,
        ApplicationStatus,
        PlanMode,
        PlanStatus,
        UserStatus,
    )
    from gad.models.geo import snap_to_grid
    from gad.models.plan import Plan, PlanApplication
    from gad.models.user import User

    host = User(email="host@x.com", display_name="Host", status=UserStatus.active)
    applicant = User(email="app@x.com", display_name="App", status=UserStatus.active)
    db_session.add_all([host, applicant])
    await db_session.commit()
    await db_session.refresh(host)
    await db_session.refresh(applicant)

    g_lat, g_lng = snap_to_grid(-34.6, -58.4)
    plan = Plan(
        host_id=host.id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Plan",
        location_label="Centro",
        location_grid=WKTElement(f"POINT({g_lng} {g_lat})", srid=4326),
        window_minutes=120,
        max_participants=3,
        expires_at=datetime.now(UTC) + timedelta(hours=2),
        status=PlanStatus.open,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    app = PlanApplication(
        plan_id=plan.id,
        applicant_id=applicant.id,
        status=ApplicationStatus.pending,
        message="Hola",
    )
    db_session.add(app)
    await db_session.commit()
    return plan


@pytest.mark.asyncio
async def test_admin_plan_applications(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan_with_app(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/plans/{plan.id}/applications", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_admin_plan_matches_empty(client, db_session):
    admin = await register(
        db_session, RegisterIn(email="admin@x.com", password="12345678", display_name="A")
    )
    await _make_admin(db_session, admin.user_id)
    plan = await _seed_plan_with_app(db_session)
    headers = {"Authorization": f"Bearer {admin.access_token}"}
    async with client as c:
        resp = await c.get(f"/admin/plans/{plan.id}/matches", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []
