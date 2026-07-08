# backend/tests/test_matching_apply.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.exceptions import ConflictError, ValidationError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import apply_to_plan
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _make_user(session, email):
    tokens = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


async def _make_plan(session, host):
    return await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )


@pytest.mark.asyncio
async def test_apply_to_plan_creates_pending(db_session):
    host = await _make_user(db_session, "host@example.com")
    applicant = await _make_user(db_session, "app@example.com")
    plan = await _make_plan(db_session, host)

    application = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())

    assert application.status.value == "pending"
    assert application.applicant_id == applicant.id


@pytest.mark.asyncio
async def test_apply_to_own_plan_raises(db_session):
    host = await _make_user(db_session, "self@example.com")
    plan = await _make_plan(db_session, host)

    with pytest.raises(ValidationError):
        await apply_to_plan(db_session, host, plan.id, ApplicationIn())


@pytest.mark.asyncio
async def test_apply_twice_raises(db_session):
    host = await _make_user(db_session, "h@example.com")
    applicant = await _make_user(db_session, "a@example.com")
    plan = await _make_plan(db_session, host)

    await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    with pytest.raises(ConflictError):
        await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
