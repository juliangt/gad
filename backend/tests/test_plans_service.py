# backend/tests/test_plans_service.py
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.exceptions import NotFoundError
from gad.models.enums import ActivityType, PlanMode, PlanStatus
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import cancel_plan, create_plan, get_plan
from gad.schemas.auth import RegisterIn


async def _make_host(session, email="host@example.com"):
    tokens = await register(
        session, RegisterIn(email=email, password="12345678", display_name="Host")
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_create_plan_now_sets_expires_at(db_session):
    host = await _make_host(db_session)
    before = datetime.now(UTC)

    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )

    assert plan.status == PlanStatus.open
    assert plan.expires_at > before
    assert plan.host_id == host.id


@pytest.mark.asyncio
async def test_create_plan_scheduled_expires_after_window(db_session):
    host = await _make_host(db_session)
    scheduled = datetime.now(UTC) + timedelta(days=1)

    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.drinks,
            mode=PlanMode.scheduled,
            scheduled_at=scheduled,
            window_minutes=180,
            title="Cervezas",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )

    assert plan.expires_at >= scheduled + timedelta(minutes=179)


@pytest.mark.asyncio
async def test_get_plan_raises_on_missing(db_session):
    with pytest.raises(NotFoundError):
        await get_plan(db_session, uuid.uuid4())


@pytest.mark.asyncio
async def test_cancel_plan_sets_cancelled(db_session):
    host = await _make_host(db_session)
    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )
    cancelled = await cancel_plan(db_session, plan)
    assert cancelled.status == PlanStatus.cancelled
