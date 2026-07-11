# backend/tests/test_venues_router.py
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from geoalchemy2.elements import WKTElement

from gad.auth.router import router as auth_router
from gad.db import get_session
from gad.models.enums import ActivityType, OfferRedemption, VenueStatus
from gad.models.venue import Venue, VenueOffer
from gad.venues.router import router as venues_router


@pytest.fixture
def app(db_engine):
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    from gad.exceptions import GADError

    app = FastAPI()

    @app.exception_handler(GADError)
    async def _gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    app.include_router(auth_router)
    app.include_router(venues_router)

    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    app.state.test_session_maker = test_session_maker
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register(client, email="user@example.com"):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "User"},
    )
    return resp.json()["access_token"]


async def _seed_venue(session, *, name, lat, lng, status=VenueStatus.active):
    venue = Venue(
        name=name,
        category=ActivityType.drinks,
        address=f"{name} addr",
        location=WKTElement(f"POINT({lng} {lat})", srid=4326),
        status=status,
        owner_name="Owner",
        owner_email=f"{name}@example.com",
    )
    session.add(venue)
    await session.commit()
    await session.refresh(venue)
    return venue


@pytest.mark.asyncio
async def test_list_nearby_requires_auth(client):
    async with client as c:
        resp = await c.get("/venues?lat=-34.59&lng=-58.43&radius=5000")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_nearby_returns_only_active(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    async with test_sm() as session:
        await _seed_venue(session, name="Active", lat=-34.59, lng=-58.43)
        await _seed_venue(
            session, name="Pending", lat=-34.59, lng=-58.43, status=VenueStatus.pending
        )

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    names = [v["name"] for v in body["items"]]
    assert "Active" in names
    assert "Pending" not in names


@pytest.mark.asyncio
async def test_list_nearby_includes_only_valid_offers(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    now = datetime.now(UTC)
    async with test_sm() as session:
        venue = await _seed_venue(session, name="V", lat=-34.59, lng=-58.43)
        # Offer vigente
        session.add(
            VenueOffer(
                venue_id=venue.id,
                title="2x1",
                description="2x1 en cervezas",
                redemption_method=OfferRedemption.mention,
                valid_from=now - timedelta(days=1),
                valid_until=now + timedelta(days=1),
                active=True,
            )
        )
        # Offer expirada
        session.add(
            VenueOffer(
                venue_id=venue.id,
                title="Vieja",
                description="Promo pasada",
                redemption_method=OfferRedemption.code,
                valid_from=now - timedelta(days=10),
                valid_until=now - timedelta(days=5),
                active=True,
            )
        )
        await session.commit()

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    venue_item = body["items"][0]
    offer_titles = [o["title"] for o in venue_item["offers"]]
    assert "2x1" in offer_titles
    assert "Vieja" not in offer_titles


@pytest.mark.asyncio
async def test_list_nearby_respects_limit(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    async with test_sm() as session:
        for i in range(5):
            await _seed_venue(
                session, name=f"V{i}", lat=-34.59 + i * 0.001, lng=-58.43
            )

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000&limit=2",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["count"] == 2


@pytest.mark.asyncio
async def test_list_nearby_filters_by_category(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    async with test_sm() as session:
        await _seed_venue(session, name="Bar", lat=-34.59, lng=-58.43)
        session.add(
            Venue(
                name="Cafe",
                category=ActivityType.coffee,
                address="addr",
                location=WKTElement("POINT(-58.43 -34.59)", srid=4326),
                status=VenueStatus.active,
                owner_name="O",
                owner_email="c@example.com",
            )
        )
        await session.commit()

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000&category=drinks",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    names = [v["name"] for v in body["items"]]
    assert "Bar" in names
    assert "Cafe" not in names
