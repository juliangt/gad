import pytest
from sqlalchemy import select

from gad.models.settings import (
    AuditEvent,
    FeatureFlag,
    MaintenanceState,
    UserDefaults,
)


@pytest.mark.asyncio
async def test_singletons_have_fixed_pk_one(db_session):
    ud = UserDefaults(
        id=1,
        default_plan_validity_mins=120,
        default_search_radius_m=2000,
        age_range_min=18,
        age_range_max=99,
        group_size_preference="either",
        gender_preference="any",
        activity_types=["coffee", "drinks"],
    )
    db_session.add(ud)
    await db_session.commit()
    result = await db_session.execute(select(UserDefaults).where(UserDefaults.id == 1))
    assert result.scalar_one().default_plan_validity_mins == 120


@pytest.mark.asyncio
async def test_feature_flag_pk_is_key(db_session):
    db_session.add(FeatureFlag(key="reviews", enabled=True, description="x"))
    await db_session.commit()
    result = await db_session.execute(select(FeatureFlag).where(FeatureFlag.key == "reviews"))
    assert result.scalar_one().enabled is True


@pytest.mark.asyncio
async def test_maintenance_state_singleton(db_session):
    db_session.add(
        MaintenanceState(
            id=1,
            enabled=False,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="info",
        )
    )
    await db_session.commit()
    result = await db_session.execute(select(MaintenanceState).where(MaintenanceState.id == 1))
    assert result.scalar_one().enabled is False


@pytest.mark.asyncio
async def test_audit_event_stores_jsonb_detail(db_session):
    from uuid import uuid4

    actor = uuid4()
    ev = AuditEvent(
        actor_id=actor,
        action="settings.update",
        target_type="settings",
        target_id="operational",
        detail={"before": {"x": 1}, "after": {"x": 2}},
    )
    db_session.add(ev)
    await db_session.commit()
    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.action == "settings.update")
    )
    stored = result.scalar_one()
    assert stored.detail["after"]["x"] == 2
    assert stored.actor_id == actor
