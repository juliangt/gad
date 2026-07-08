# backend/tests/test_safety_pings.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.safety.service import get_peer_location, ping_location
from gad.schemas.auth import RegisterIn


async def _match(session):
    host_t = await register(
        session, RegisterIn(email="sh@example.com", password="12345678", display_name="H")
    )
    app_t = await register(
        session, RegisterIn(email="sa@example.com", password="12345678", display_name="A")
    )
    host = (
        await session.execute(select(User).where(User.id == host_t.user_id))
    ).scalar_one()
    applicant = (
        await session.execute(select(User).where(User.id == app_t.user_id))
    ).scalar_one()

    plan = await create_plan(
        session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            max_participants=1,
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )
    app = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
    match = await accept_application(session, host, app.id)
    return host, applicant, match


@pytest.mark.asyncio
async def test_ping_then_get_peer(db_session):
    host, applicant, match = await _match(db_session)

    await ping_location(db_session, host, match.id, -34.59, -58.43)

    lat, lng, ts = await get_peer_location(db_session, applicant, match.id)
    assert lat is not None
    assert abs(lat - (-34.59)) < 0.001
    assert ts is not None


@pytest.mark.asyncio
async def test_get_peer_without_ping_returns_none(db_session):
    host, applicant, match = await _match(db_session)
    lat, lng, ts = await get_peer_location(db_session, applicant, match.id)
    assert lat is None
