# backend/tests/test_availability_matcher.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.availability.matcher import find_matching_availability
from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn
from gad.availability.service import activate
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    t = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    return (
        await session.execute(select(User).where(User.id == t.user_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_find_matching_returns_closest_available(db_session):
    host = await _user(db_session, "host@example.com")
    available_user = await _user(db_session, "avail@example.com")

    await activate(
        db_session, available_user,
        AvailabilityIn(
            location=AvailabilityLocationIn(lat=-34.59, lng=-58.43), radius_m=3000
        ),
    )
    plan = await create_plan(
        db_session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )

    matches = await find_matching_availability(db_session, plan)
    assert len(matches) == 1
    assert matches[0].user_id == available_user.id


@pytest.mark.asyncio
async def test_find_matching_excludes_when_activity_filtered(db_session):
    host = await _user(db_session, "host2@example.com")
    available_user = await _user(db_session, "avail2@example.com")

    # Available solo para drinks
    await activate(
        db_session, available_user,
        AvailabilityIn(
            location=AvailabilityLocationIn(lat=-34.59, lng=-58.43),
            activity_filter=[ActivityType.drinks],
        ),
    )
    # Plan de coffee
    plan = await create_plan(
        db_session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )

    matches = await find_matching_availability(db_session, plan)
    assert len(matches) == 0
