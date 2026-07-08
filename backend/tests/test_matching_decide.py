# backend/tests/test_matching_decide.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.exceptions import ConflictError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import (
    accept_application,
    apply_to_plan,
    reject_application,
    withdraw_application,
)
from gad.models.enums import ApplicationStatus, PlanStatus
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


async def _plan(session, host, **kw):
    return await create_plan(
        session, host,
        PlanIn(
            activity_type="coffee", mode="now", title="X",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"), **kw,
        ),
    )


@pytest.mark.asyncio
async def test_accept_application_on_1v1_creates_match(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    match = await accept_application(db_session, host, app.id)

    assert match is not None
    assert plan.status == PlanStatus.matched
    assert plan.current_participants == 1


@pytest.mark.asyncio
async def test_reject_application_keeps_plan_open(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    await reject_application(db_session, host, app.id)

    await db_session.refresh(app)
    assert app.status == ApplicationStatus.rejected
    await db_session.refresh(plan)
    assert plan.status == PlanStatus.open


@pytest.mark.asyncio
async def test_withdraw_own_application(db_session):
    host = await _user(db_session, "h@example.com")
    applicant = await _user(db_session, "a@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    await withdraw_application(db_session, applicant, app.id)

    await db_session.refresh(app)
    assert app.status == ApplicationStatus.withdrawn


@pytest.mark.asyncio
async def test_accept_on_full_plan_raises(db_session):
    host = await _user(db_session, "h@example.com")
    a1 = await _user(db_session, "a1@example.com")
    a2 = await _user(db_session, "a2@example.com")
    plan = await _plan(db_session, host, max_participants=1)

    # Ambos se postulan antes de que el plan se llene
    app1 = await apply_to_plan(db_session, a1, plan.id, ApplicationIn())
    app2 = await apply_to_plan(db_session, a2, plan.id, ApplicationIn())

    # Aceptar a a1 llena el cupo (max_participants=1) → plan matched
    await accept_application(db_session, host, app1.id)
    # Aceptar a a2 ahora debe fallar: el plan ya no está abierto
    with pytest.raises(ConflictError):
        await accept_application(db_session, host, app2.id)
