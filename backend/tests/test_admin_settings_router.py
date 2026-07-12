
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.models.settings import (
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
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


async def _seed_settings(db_session):
    db_session.add(
        UserDefaults(
            id=1,
            default_plan_validity_mins=120,
            default_search_radius_m=2000,
            age_range_min=18,
            age_range_max=99,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee"],
        )
    )
    db_session.add(
        OperationalSettings(
            id=1,
            rate_limit_enabled=True,
            default_rate_limit="300/minute",
            access_token_expire_minutes=15,
            refresh_token_expire_days=7,
            max_avatar_bytes=5242880,
            ws_max_message_rate=5,
        )
    )
    db_session.add(
        MaintenanceState(
            id=1,
            enabled=False,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="info",
        )
    )
    await db_session.commit()


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User

    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _admin_client(client, db_session):
    admin_tokens = await register(
        db_session,
        RegisterIn(email="admin@example.com", password="12345678", display_name="A"),
    )
    await _make_admin(db_session, admin_tokens.user_id)
    return {"Authorization": f"Bearer {admin_tokens.access_token}"}


@pytest.mark.asyncio
async def test_get_user_defaults_requires_admin(client, db_session):
    async with client as c:
        resp = await c.get("/admin/settings/user-defaults")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_user_defaults_returns_seeded(client, db_session):
    await _seed_settings(db_session)
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.get("/admin/settings/user-defaults", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_plan_validity_mins"] == 120


@pytest.mark.asyncio
async def test_put_user_defaults_updates_and_audits(client, db_session):
    await _seed_settings(db_session)
    headers = await _admin_client(client, db_session)
    body = {
        "default_plan_validity_mins": 90,
        "default_search_radius_m": 1500,
        "age_range_min": 21,
        "age_range_max": 70,
        "group_size_preference": "small_group",
        "gender_preference": "any",
        "activity_types": ["coffee", "drinks"],
    }
    async with client as c:
        resp = await c.put("/admin/settings/user-defaults", headers=headers, json=body)
    assert resp.status_code == 200
    assert resp.json()["default_plan_validity_mins"] == 90
    # Audit registrado
    from sqlalchemy import select

    from gad.models.settings import AuditEvent

    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.action == "settings.user_defaults.update")
    )
    assert result.scalar_one() is not None


@pytest.mark.asyncio
async def test_put_feature_flag(client, db_session):
    from gad.models.settings import FeatureFlag

    db_session.add(FeatureFlag(key="reviews", enabled=True, description="x"))
    await db_session.commit()
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.put(
            "/admin/settings/feature-flags/reviews",
            headers=headers,
            json={"enabled": False},
        )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_put_maintenance(client, db_session):
    await _seed_settings(db_session)
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.put(
            "/admin/settings/maintenance",
            headers=headers,
            json={
                "enabled": True,
                "message": "En mantenimiento",
                "banner_active": True,
                "banner_message": "Volvemos pronto",
                "banner_level": "warning",
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["banner_level"] == "warning"


@pytest.mark.asyncio
async def test_get_audit_logs(client, db_session):
    headers = await _admin_client(client, db_session)
    async with client as c:
        resp = await c.get("/admin/settings/audit", headers=headers)
    assert resp.status_code == 200
    assert "items" in resp.json()
