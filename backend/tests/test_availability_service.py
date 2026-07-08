# backend/tests/test_availability_service.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn
from gad.availability.service import activate, deactivate, get_mine
from gad.models.user import User
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    t = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    return (
        await session.execute(select(User).where(User.id == t.user_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_activate_creates_availability(db_session):
    user = await _user(db_session, "av@example.com")
    avail = await activate(
        db_session, user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43)),
    )
    assert avail.active is True
    assert avail.user_id == user.id


@pytest.mark.asyncio
async def test_activate_replaces_previous(db_session):
    user = await _user(db_session, "av2@example.com")
    await activate(
        db_session, user,
        AvailabilityIn(
            location=AvailabilityLocationIn(lat=-34.59, lng=-58.43), radius_m=1000
        ),
    )
    second = await activate(
        db_session, user,
        AvailabilityIn(
            location=AvailabilityLocationIn(lat=-34.59, lng=-58.43), radius_m=2000
        ),
    )
    mine = await get_mine(db_session, user)
    assert mine.id == second.id


@pytest.mark.asyncio
async def test_deactivate(db_session):
    user = await _user(db_session, "av3@example.com")
    await activate(
        db_session, user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43)),
    )
    await deactivate(db_session, user)
    assert await get_mine(db_session, user) is None
