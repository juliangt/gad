# backend/tests/test_users_service.py
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from gad.auth.service import register
from gad.exceptions import ConflictError, NotFoundError
from gad.models.user import User
from gad.schemas.auth import RegisterIn
from gad.schemas.user import PreferencesIn, UserUpdateIn
from gad.users.service import (
    block_user,
    get_or_create_preferences,
    get_user_public,
    is_blocked_pair,
    update_preferences,
    update_profile,
)


async def _make_user(session, email="u1@example.com"):
    return await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )


@pytest.mark.asyncio
async def test_get_or_create_preferences_creates_if_missing(db_session):
    tokens = await _make_user(db_session)
    result = await db_session.execute(
        select(User).options(selectinload(User.preferences)).where(User.id == tokens.user_id)
    )
    user = result.scalar_one()
    assert user.preferences is None

    prefs = await get_or_create_preferences(db_session, user)
    assert prefs.user_id == user.id
    assert prefs.default_search_radius_m == 2000
    assert prefs.default_plan_validity_mins == 120


@pytest.mark.asyncio
async def test_update_profile_changes_only_provided(db_session):
    tokens = await _make_user(db_session, "change@example.com")
    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()
    original_name = user.display_name

    await update_profile(db_session, user, UserUpdateIn(bio="nuevo bio"))

    assert user.bio == "nuevo bio"
    assert user.display_name == original_name


@pytest.mark.asyncio
async def test_update_preferences_persists(db_session):
    tokens = await _make_user(db_session, "pref@example.com")
    result = await db_session.execute(
        select(User).options(selectinload(User.preferences)).where(User.id == tokens.user_id)
    )
    user = result.scalar_one()

    await update_preferences(
        db_session,
        user,
        PreferencesIn(
            default_search_radius_m=5000,
            default_plan_validity_mins=180,
            activity_types=["coffee"],
        ),
    )

    result = await db_session.execute(
        select(User).options(selectinload(User.preferences)).where(User.id == tokens.user_id)
    )
    user = result.scalar_one()
    assert user.preferences.default_search_radius_m == 5000
    assert user.preferences.default_plan_validity_mins == 180
    assert user.preferences.activity_types == ["coffee"]


@pytest.mark.asyncio
async def test_get_user_public_raises_on_missing(db_session):
    with pytest.raises(NotFoundError):
        await get_user_public(db_session, uuid.uuid4())


@pytest.mark.asyncio
async def test_block_user_creates_block(db_session):
    t1 = await _make_user(db_session, "a@example.com")
    t2 = await _make_user(db_session, "b@example.com")
    u1 = (await db_session.execute(select(User).where(User.id == t1.user_id))).scalar_one()
    u2_id = t2.user_id

    block = await block_user(db_session, u1, u2_id)
    assert block.blocked_id == u2_id


@pytest.mark.asyncio
async def test_block_user_self_raises(db_session):
    t1 = await _make_user(db_session, "self@example.com")
    u1 = (await db_session.execute(select(User).where(User.id == t1.user_id))).scalar_one()

    with pytest.raises(ConflictError):
        await block_user(db_session, u1, u1.id)


@pytest.mark.asyncio
async def test_is_blocked_pair_bidirectional(db_session):
    t1 = await _make_user(db_session, "x@example.com")
    t2 = await _make_user(db_session, "y@example.com")
    u1 = (await db_session.execute(select(User).where(User.id == t1.user_id))).scalar_one()

    await block_user(db_session, u1, t2.user_id)

    assert await is_blocked_pair(db_session, u1.id, t2.user_id) is True
    assert await is_blocked_pair(db_session, t2.user_id, u1.id) is True
