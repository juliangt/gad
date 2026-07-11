# backend/tests/test_admin_venues_router.py
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
from gad.venues.router import router as venues_router


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
    app.include_router(venues_router)
    app.state.test_session_maker = test_sm
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User

    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _admin(client, db_session, email="admin@example.com"):
    tokens = await register(
        db_session,
        RegisterIn(email=email, password="12345678", display_name="A"),
    )
    await _make_admin(db_session, tokens.user_id)
    return {"Authorization": f"Bearer {tokens.access_token}"}, tokens.user_id


VENUE_BODY = {
    "name": "Bar X",
    "category": "drinks",
    "address": "Calle Falsa 123",
    "lat": -34.59,
    "lng": -58.43,
    "owner_name": "Dueno",
    "owner_email": "dueno@example.com",
    "owner_phone": "+5411",
}


@pytest.mark.asyncio
async def test_non_admin_forbidden(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="u@example.com", password="12345678", display_name="U"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.post("/admin/venues", json=VENUE_BODY, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_venue_starts_pending(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        resp = await c.post("/admin/venues", json=VENUE_BODY, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_approve_only_from_pending(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        # Aprobar OK (pending -> active)
        resp = await c.post(f"/admin/venues/{vid}/approve", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        # Aprobar de nuevo -> 409
        resp2 = await c.post(f"/admin/venues/{vid}/approve", headers=headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_pause_only_from_active(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        await c.post(f"/admin/venues/{vid}/approve", headers=headers)
        resp = await c.post(f"/admin/venues/{vid}/pause", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"
        # Pause de nuevo -> 409
        resp2 = await c.post(f"/admin/venues/{vid}/pause", headers=headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_revoke_from_any_state(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        # Revocar desde pending
        resp = await c.post(f"/admin/venues/{vid}/revoke", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "revoked"


@pytest.mark.asyncio
async def test_create_offer_validates_dates(client, db_session):
    from datetime import UTC, datetime, timedelta

    headers, _ = await _admin(client, db_session)
    now = datetime.now(UTC)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        # valid_from >= valid_until
        resp = await c.post(
            f"/admin/venues/{vid}/offers",
            json={
                "title": "X",
                "description": "D",
                "redemption_method": "mention",
                "valid_from": now.isoformat(),
                "valid_until": now.isoformat(),
            },
            headers=headers,
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_and_list_offer(client, db_session):
    from datetime import UTC, datetime, timedelta

    headers, _ = await _admin(client, db_session)
    now = datetime.now(UTC)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        resp = await c.post(
            f"/admin/venues/{vid}/offers",
            json={
                "title": "2x1",
                "description": "2x1 cervezas",
                "redemption_method": "mention",
                "valid_from": (now - timedelta(days=1)).isoformat(),
                "valid_until": (now + timedelta(days=30)).isoformat(),
            },
            headers=headers,
        )
        assert resp.status_code == 200
        # El venue ahora tiene la offer
        detail = await c.get(f"/admin/venues/{vid}", headers=headers)
    assert len(detail.json()["offers"]) == 1
    assert detail.json()["offers"][0]["title"] == "2x1"


@pytest.mark.asyncio
async def test_revoke_hides_from_public_list(client, db_session):
    from geoalchemy2.elements import WKTElement

    from gad.models.enums import ActivityType, VenueStatus
    from gad.models.venue import Venue

    # Seed directo en estado revoked
    venue = Venue(
        name="RevokedVenue",
        category=ActivityType.drinks,
        address="addr",
        location=WKTElement("POINT(-58.43 -34.59)", srid=4326),
        status=VenueStatus.revoked,
        owner_name="O",
        owner_email="r@example.com",
    )
    db_session.add(venue)
    await db_session.commit()

    # Registrar un user para consultar el endpoint público
    tokens = await register(
        db_session,
        RegisterIn(email="viewer@example.com", password="12345678", display_name="V"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000", headers=headers
        )
    body = resp.json()
    names = [v["name"] for v in body["items"]]
    assert "RevokedVenue" not in names
