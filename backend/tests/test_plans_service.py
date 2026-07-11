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


@pytest.mark.asyncio
async def test_list_nearby_plans_returns_only_close_open(db_session):
    from gad.plans.service import list_nearby_plans

    host = await _make_host(db_session)
    # Plan cercano
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="A",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    # Plan lejano (Caballito ~6km)
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="B",
               location=PlanLocationIn(lat=-34.632, lng=-58.444, label="Caballito")),
    )

    viewer = await _make_host(db_session, "viewer@example.com")
    nearby = await list_nearby_plans(
        db_session, viewer=viewer, lat=-34.59, lng=-58.43, radius_m=2000
    )
    titles = [p.title for p in nearby]
    assert "A" in titles
    assert "B" not in titles


@pytest.mark.asyncio
async def test_list_nearby_excludes_own_plans(db_session):
    from gad.plans.service import list_nearby_plans

    host = await _make_host(db_session)
    await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="Mine",
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )

    nearby = await list_nearby_plans(
        db_session, viewer=host, lat=-34.59, lng=-58.43, radius_m=5000
    )
    assert all(p.title != "Mine" for p in nearby)


@pytest.mark.asyncio
async def test_cancel_plan_sets_hidden_by_host(db_session):
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
    assert cancelled.hidden_by_host is True


@pytest.mark.asyncio
async def test_update_plan_changes_max_participants(db_session):
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

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
    updated = await update_plan(
        db_session, plan, PlanUpdateIn(max_participants=5, search_radius_m=3000)
    )
    assert updated.max_participants == 5
    assert updated.search_radius_m == 3000


@pytest.mark.asyncio
async def test_update_plan_rejects_max_below_current(db_session):
    from gad.exceptions import ConflictError
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

    host = await _make_host(db_session)
    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            max_participants=3,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )
    plan.current_participants = 2  # simula 2 aceptados
    await db_session.commit()
    await db_session.refresh(plan)

    with pytest.raises(ConflictError):
        await update_plan(db_session, plan, PlanUpdateIn(max_participants=1))


@pytest.mark.asyncio
async def test_update_plan_rejects_non_open(db_session):
    from gad.exceptions import ConflictError
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

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
    plan.status = PlanStatus.cancelled
    await db_session.commit()
    await db_session.refresh(plan)

    with pytest.raises(ConflictError):
        await update_plan(db_session, plan, PlanUpdateIn(title="Otro"))


@pytest.mark.asyncio
async def test_update_plan_hidden_works_on_non_open(db_session):
    """hidden se puede cambiar aunque el plan no esté open (es solo visibilidad)."""
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

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
    plan.status = PlanStatus.expired
    await db_session.commit()
    await db_session.refresh(plan)

    updated = await update_plan(db_session, plan, PlanUpdateIn(hidden=True))
    assert updated.hidden_by_host is True


@pytest.mark.asyncio
async def test_list_my_plans_returns_own_with_pending_count(db_session):
    from gad.models.plan import PlanApplication
    from gad.plans.service import list_my_plans

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
    # 2 postulaciones pendientes de otros usuarios
    applicant1 = await _make_host(db_session, "a1@example.com")
    applicant2 = await _make_host(db_session, "a2@example.com")
    session = db_session
    session.add_all([
        PlanApplication(plan_id=plan.id, applicant_id=applicant1.id),
        PlanApplication(plan_id=plan.id, applicant_id=applicant2.id),
    ])
    await session.commit()

    result = await list_my_plans(session, host_id=host.id)
    assert len(result) == 1
    assert result[0][0].id == plan.id
    assert result[0][1] == 2  # pending_applications_count


@pytest.mark.asyncio
async def test_list_my_plans_excludes_hidden(db_session):
    from gad.plans.service import list_my_plans

    host = await _make_host(db_session)
    await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Visible",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )
    plan_to_hide = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.drinks,
            mode=PlanMode.now,
            title="Oculto",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )
    await cancel_plan(db_session, plan_to_hide)  # cancel → hidden_by_host=True

    result = await list_my_plans(db_session, host_id=host.id)
    titles = [r[0].title for r in result]
    assert "Visible" in titles
    assert "Oculto" not in titles


@pytest.mark.asyncio
async def test_list_my_plans_status_filter(db_session):
    from gad.plans.service import list_my_plans

    host = await _make_host(db_session)
    await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Open",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )

    result = await list_my_plans(
        db_session, host_id=host.id, status_filter=[PlanStatus.cancelled]
    )
    assert len(result) == 0  # no hay cancelados visibles



@pytest.mark.asyncio
async def test_update_plan_changes_activity_type(db_session):
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

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
    updated = await update_plan(
        db_session, plan, PlanUpdateIn(activity_type=ActivityType.drinks)
    )
    assert updated.activity_type == ActivityType.drinks


@pytest.mark.asyncio
async def test_update_plan_location_re_snaps_coords(db_session):
    from gad.plans.schemas import PlanLocationIn, PlanUpdateIn
    from gad.plans.service import update_plan

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
    updated = await update_plan(
        db_session,
        plan,
        PlanUpdateIn(
            location=PlanLocationIn(lat=-34.60, lng=-58.44, label="Caballito")
        ),
    )
    assert updated.location_label == "Caballito"


@pytest.mark.asyncio
async def test_update_plan_window_recalculates_expires(db_session):
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

    host = await _make_host(db_session)
    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            window_minutes=120,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )
    old_expires = plan.expires_at
    updated = await update_plan(
        db_session, plan, PlanUpdateIn(window_minutes=60)
    )
    # 60 min en vez de 120 → expira antes
    assert updated.expires_at < old_expires


@pytest.mark.asyncio
async def test_update_plan_mode_to_scheduled_recalculates_expires(db_session):
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

    host = await _make_host(db_session)
    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            window_minutes=120,
            title="Café",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )
    scheduled = datetime.now(UTC) + timedelta(days=1)
    updated = await update_plan(
        db_session,
        plan,
        PlanUpdateIn(mode=PlanMode.scheduled, scheduled_at=scheduled),
    )
    assert updated.mode == PlanMode.scheduled
    assert updated.scheduled_at == scheduled
    # expires_at debe basarse en scheduled_at + window_minutes
    assert updated.expires_at >= scheduled + timedelta(minutes=119)


@pytest.mark.asyncio
async def test_update_plan_can_clear_description(db_session):
    """Setear description a null explícitamente debe vaciarla."""
    from gad.plans.schemas import PlanUpdateIn
    from gad.plans.service import update_plan

    host = await _make_host(db_session)
    plan = await create_plan(
        db_session,
        host,
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            description="Una descripción",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo"),
        ),
    )
    assert plan.description == "Una descripción"
    updated = await update_plan(db_session, plan, PlanUpdateIn(description=None))
    assert updated.description is None
