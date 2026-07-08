# backend/tests/test_matching_list.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import (
    accept_application,
    apply_to_plan,
    list_applications_for_plan,
    list_my_applications,
    list_my_matches,
)
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    tokens = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


async def _plan(session, host):
    return await create_plan(
        session, host,
        PlanIn(
            activity_type="coffee", mode="now", title="X", max_participants=1,
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )


@pytest.mark.asyncio
async def test_list_applications_for_plan(db_session):
    host = await _user(db_session, "h@example.com")
    a1 = await _user(db_session, "a1@example.com")
    a2 = await _user(db_session, "a2@example.com")
    plan = await _plan(db_session, host)

    await apply_to_plan(db_session, a1, plan.id, ApplicationIn())
    await apply_to_plan(db_session, a2, plan.id, ApplicationIn())

    apps = await list_applications_for_plan(db_session, host, plan.id)
    assert len(apps) == 2


@pytest.mark.asyncio
async def test_list_my_applications(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host)

    await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())

    apps = await list_my_applications(db_session, applicant)
    assert len(apps) == 1


@pytest.mark.asyncio
async def test_list_my_matches_after_accept(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    await accept_application(db_session, host, app.id)

    host_matches = await list_my_matches(db_session, host)
    applicant_matches = await list_my_matches(db_session, applicant)
    assert len(host_matches) == 1
    assert len(applicant_matches) == 1
