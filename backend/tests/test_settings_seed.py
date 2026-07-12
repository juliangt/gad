import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.main import _seed_default_settings


@pytest.mark.asyncio
async def test_seed_creates_singletons(db_engine):
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    await _seed_default_settings(test_sm)
    from gad.models.settings import (
        FeatureFlag,
        MaintenanceState,
        OperationalSettings,
        UserDefaults,
    )

    async with test_sm() as s:
        assert (await s.execute(select(UserDefaults).where(UserDefaults.id == 1))).scalar_one()
        assert (await s.execute(select(OperationalSettings).where(OperationalSettings.id == 1))).scalar_one()
        assert (await s.execute(select(MaintenanceState).where(MaintenanceState.id == 1))).scalar_one()
        flags = (await s.execute(select(FeatureFlag))).scalars().all()
        flag_keys = {f.key for f in flags}
        assert "reviews" in flag_keys
        assert "venues_sponsors" in flag_keys


@pytest.mark.asyncio
async def test_seed_is_idempotent(db_engine):
    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    await _seed_default_settings(test_sm)
    await _seed_default_settings(test_sm)  # no debe duplicar ni fallar
    from gad.models.settings import UserDefaults

    async with test_sm() as s:
        rows = (await s.execute(select(UserDefaults))).scalars().all()
        assert len(rows) == 1
