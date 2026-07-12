from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.elements import WKTElement

from gad.admin.plans_service import (
    admin_close_plan,
    admin_hide_plan,
    admin_unhide_plan,
    get_admin_plan,
    list_admin_plans,
)
from gad.exceptions import NotFoundError
from gad.models.enums import ActivityType, PlanMode, PlanStatus, UserStatus
from gad.models.geo import snap_to_grid
from gad.models.plan import Plan
from gad.models.user import User


async def _make_host(db_session, email="host@x.com") -> User:
    user = User(email=email, display_name=email.split("@")[0], status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _make_plan(
    db_session,
    host,
    *,
    title="Plan",
    activity="coffee",
    status=PlanStatus.open,
    hidden=False,
) -> Plan:
    g_lat, g_lng = snap_to_grid(-34.6, -58.4)
    plan = Plan(
        host_id=host.id,
        activity_type=ActivityType(activity),
        mode=PlanMode.now,
        title=title,
        location_label="Centro",
        location_grid=WKTElement(f"POINT({g_lng} {g_lat})", srid=4326),
        window_minutes=120,
        max_participants=3,
        expires_at=datetime.now(UTC) + timedelta(hours=2),
        status=status,
        hidden_by_host=hidden,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.mark.asyncio
async def test_list_admin_plans_filters_by_status(db_session):
    host = await _make_host(db_session)
    await _make_plan(db_session, host, title="A", status=PlanStatus.open)
    await _make_plan(db_session, host, title="B", status=PlanStatus.cancelled)
    result = await list_admin_plans(db_session, status="open")
    assert len(result) == 1
    assert result[0].title == "A"


@pytest.mark.asyncio
async def test_list_admin_plans_search_by_title(db_session):
    host = await _make_host(db_session)
    await _make_plan(db_session, host, title="Café matutino")
    await _make_plan(db_session, host, title="Paseo nocturno")
    result = await list_admin_plans(db_session, q="café")
    assert len(result) == 1
    assert result[0].title == "Café matutino"


@pytest.mark.asyncio
async def test_list_admin_plans_filter_by_activity(db_session):
    host = await _make_host(db_session)
    await _make_plan(db_session, host, activity="coffee")
    await _make_plan(db_session, host, activity="walk", title="Caminata")
    result = await list_admin_plans(db_session, activity="walk")
    assert len(result) == 1


@pytest.mark.asyncio
async def test_admin_hide_plan(db_session):
    host = await _make_host(db_session)
    plan = await _make_plan(db_session, host, hidden=False)
    updated = await admin_hide_plan(db_session, plan.id)
    assert updated.hidden_by_host is True


@pytest.mark.asyncio
async def test_admin_unhide_plan(db_session):
    host = await _make_host(db_session)
    plan = await _make_plan(db_session, host, hidden=True)
    updated = await admin_unhide_plan(db_session, plan.id)
    assert updated.hidden_by_host is False


@pytest.mark.asyncio
async def test_admin_close_plan(db_session):
    host = await _make_host(db_session)
    plan = await _make_plan(db_session, host, status=PlanStatus.matched)
    updated = await admin_close_plan(db_session, plan.id)
    assert updated.status == PlanStatus.closed


@pytest.mark.asyncio
async def test_get_admin_plan_404(db_session):
    import uuid
    with pytest.raises(NotFoundError):
        await get_admin_plan(db_session, uuid.uuid4())
