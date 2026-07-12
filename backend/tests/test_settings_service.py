import pytest

from gad.models.settings import (
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
from gad.settings_cache import SettingsService


async def _seed_singletons(db_session):
    db_session.add(
        UserDefaults(
            id=1,
            default_plan_validity_mins=120,
            default_search_radius_m=2000,
            age_range_min=18,
            age_range_max=99,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee", "drinks"],
        )
    )
    db_session.add(
        OperationalSettings(
            id=1,
            rate_limit_enabled=True,
            default_rate_limit="300/minute",
            access_token_expire_minutes=15,
            refresh_token_expire_days=7,
            max_avatar_bytes=5242880,
            ws_max_message_rate=5,
        )
    )
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
    db_session.add(FeatureFlag(key="reviews", enabled=True))
    db_session.add(FeatureFlag(key="venues_sponsors", enabled=False))
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_user_defaults_reads_db(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    ud = await svc.get_user_defaults()
    assert ud.default_plan_validity_mins == 120


@pytest.mark.asyncio
async def test_is_feature_enabled_true_when_enabled(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    assert await svc.is_feature_enabled("reviews") is True


@pytest.mark.asyncio
async def test_is_feature_enabled_false_when_disabled(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    assert await svc.is_feature_enabled("venues_sponsors") is False


@pytest.mark.asyncio
async def test_is_feature_enabled_fail_open_for_unknown_open_flags(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    # Flag desconocido (no es fail-closed) → True para no romper app.
    assert await svc.is_feature_enabled("unknown_module") is True


@pytest.mark.asyncio
async def test_is_feature_enabled_fail_closed_for_maintenance_block(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    # maintenance_block no existe en DB → fail-closed (False).
    assert await svc.is_feature_enabled("maintenance_block") is False


@pytest.mark.asyncio
async def test_maintenance_state_reads_db(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    ms = await svc.get_maintenance()
    assert ms.enabled is False


@pytest.mark.asyncio
async def test_cache_invalidation_reflects_db_change(db_session):
    from sqlalchemy import update

    await _seed_singletons(db_session)
    svc = SettingsService(db_session, cache_ttl=60)
    ud1 = await svc.get_user_defaults()
    assert ud1.default_search_radius_m == 2000
    # Cambiamos la DB con un UPDATE crudo (sin tocar el objeto cacheado).
    await db_session.execute(
        update(UserDefaults)
        .where(UserDefaults.id == 1)
        .values(default_search_radius_m=5000)
    )
    await db_session.commit()
    # Sin invalidar → cache devuelve el valor viejo.
    ud2 = await svc.get_user_defaults()
    assert ud2.default_search_radius_m == 2000
    # Tras invalidar → lee el nuevo.
    await svc.invalidate()
    ud3 = await svc.get_user_defaults()
    assert ud3.default_search_radius_m == 5000


@pytest.mark.asyncio
async def test_operational_reads_db(db_session):
    await _seed_singletons(db_session)
    svc = SettingsService(db_session)
    op = await svc.get_operational()
    assert op.access_token_expire_minutes == 15
