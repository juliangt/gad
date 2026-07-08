# backend/tests/test_expire_plans.py
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.service import register
from gad.jobs.expire_plans import expire_plans
from gad.models.enums import ActivityType, PlanMode, PlanStatus
from gad.models.plan import Plan
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _host(session, email="host@example.com"):
    tokens = await register(
        session, RegisterIn(email=email, password="12345678", display_name="H")
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_expire_plans_marks_past_open_as_expired(db_engine, db_session):
    host = await _host(db_session)
    plan = await create_plan(
        db_session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            window_minutes=15,
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )
    # Forzar expires_at al pasado
    plan.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.commit()

    # expire_plans abre su propia sesión contra el engine de testcontainers
    test_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    count = await expire_plans(test_maker)
    assert count >= 1

    # Verificar que el plan quedó expirado en una sesión nueva (la del fixture
    # tiene una transacción abierta que no vería el commit de expire_plans).
    async with test_maker() as verify_session:
        result = await verify_session.execute(select(Plan).where(Plan.id == plan.id))
        refreshed = result.scalar_one()
        assert refreshed.status == PlanStatus.expired


@pytest.mark.asyncio
async def test_expire_plans_skips_open_not_expired(db_engine, db_session):
    host = await _host(db_session, "future@example.com")
    # Plan vigente (expira en 2h)
    await create_plan(
        db_session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="Future",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )

    test_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    count = await expire_plans(test_maker)
    assert count == 0
