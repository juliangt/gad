# backend/tests/test_match_lifecycle.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan, cancel_match, complete_match
from gad.models.enums import ActivityType, MatchStatus, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _make_match(session):
    host_t = await register(
        session, RegisterIn(email="lc@example.com", password="12345678", display_name="H")
    )
    app_t = await register(
        session, RegisterIn(email="la@example.com", password="12345678", display_name="A")
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
async def test_complete_match(db_session):
    host, applicant, match = await _make_match(db_session)

    completed = await complete_match(db_session, host, match.id)
    assert completed.status == MatchStatus.completed
    assert completed.ended_at is not None


@pytest.mark.asyncio
async def test_cancel_match(db_session):
    host, applicant, match = await _make_match(db_session)

    cancelled = await cancel_match(db_session, host, match.id)
    assert cancelled.status == MatchStatus.cancelled
    assert cancelled.ended_at is not None
