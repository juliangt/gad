# backend/tests/test_venues_service.py

import pytest
from geoalchemy2.elements import WKTElement

from gad.models.enums import ActivityType, VenueStatus
from gad.models.venue import Venue
from gad.venues.service import list_nearby_venues


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
async def test_list_nearby_returns_only_active(db_session):
    from gad.models.user import User

    viewer = User(
        email="v@example.com",
        display_name="V",
        password_hash="x",
    )
    db_session.add(viewer)
    await db_session.commit()
    await db_session.refresh(viewer)

    await _seed_venue(db_session, name="Active", lat=-34.59, lng=-58.43)
    await _seed_venue(
        db_session, name="Pending", lat=-34.59, lng=-58.43, status=VenueStatus.pending
    )
    await _seed_venue(
        db_session, name="Revoked", lat=-34.59, lng=-58.43, status=VenueStatus.revoked
    )

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=5000
    )
    names = [v.name for v in result]
    assert "Active" in names
    assert "Pending" not in names
    assert "Revoked" not in names


@pytest.mark.asyncio
async def test_list_nearby_filters_by_radius(db_session):
    from gad.models.user import User

    viewer = User(email="v2@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="Near", lat=-34.59, lng=-58.43)
    await _seed_venue(db_session, name="Far", lat=-34.70, lng=-58.50)

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=2000
    )
    names = [v.name for v in result]
    assert "Near" in names
    assert "Far" not in names


@pytest.mark.asyncio
async def test_list_nearby_orders_by_distance(db_session):
    from gad.models.user import User

    viewer = User(email="v3@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="Far", lat=-34.62, lng=-58.43)
    await _seed_venue(db_session, name="Near", lat=-34.595, lng=-58.43)

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=20000
    )
    names = [v.name for v in result]
    # El más cerca primero
    assert names.index("Near") < names.index("Far")


@pytest.mark.asyncio
async def test_list_nearby_filters_by_category(db_session):
    from gad.models.user import User

    viewer = User(email="v4@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="Bar", lat=-34.59, lng=-58.43)
    cafe = Venue(
        name="Cafe",
        category=ActivityType.coffee,
        address="addr",
        location=WKTElement("POINT(-58.43 -34.59)", srid=4326),
        status=VenueStatus.active,
        owner_name="O",
        owner_email="c@example.com",
    )
    db_session.add(cafe)
    await db_session.commit()

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=5000, category=ActivityType.drinks
    )
    names = [v.name for v in result]
    assert "Bar" in names
    assert "Cafe" not in names


@pytest.mark.asyncio
async def test_list_nearby_returns_venues_with_attached_coords(db_session):
    """Las coords vienen batch-extractadas de la query (ST_Y/ST_X), como en plans."""
    from gad.models.user import User

    viewer = User(email="v5@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="X", lat=-34.59, lng=-58.43)
    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=5000
    )
    assert len(result) == 1
    venue = result[0]
    assert hasattr(venue, "_lat")
    assert hasattr(venue, "_lng")
    assert abs(venue._lat - (-34.59)) < 0.001
