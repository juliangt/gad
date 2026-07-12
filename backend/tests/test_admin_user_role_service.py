from uuid import uuid4

import pytest

from gad.admin.service import (
    grant_admin,
    revoke_admin,
)
from gad.exceptions import ConflictError, NotFoundError
from gad.models.enums import UserStatus
from gad.models.user import User


async def _make_user(db_session, email="u@example.com", is_admin=False) -> User:
    user = User(
        email=email,
        display_name=email.split("@")[0],
        is_admin=is_admin,
        status=UserStatus.active,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_grant_admin_sets_flag(db_session):
    user = await _make_user(db_session, "v@example.com", is_admin=False)
    updated = await grant_admin(db_session, user.id)
    assert updated.is_admin is True


@pytest.mark.asyncio
async def test_revoke_admin_clears_flag(db_session):
    user = await _make_user(db_session, "v@example.com", is_admin=True)
    actor = await _make_user(db_session, "actor@example.com", is_admin=True)
    updated = await revoke_admin(db_session, user.id, actor_id=actor.id)
    assert updated.is_admin is False


@pytest.mark.asyncio
async def test_revoke_admin_blocks_self_revoke(db_session):
    user = await _make_user(db_session, "solo@example.com", is_admin=True)
    with pytest.raises(ConflictError):
        await revoke_admin(db_session, user.id, actor_id=user.id)


@pytest.mark.asyncio
async def test_revoke_admin_blocks_last_admin(db_session):
    only_admin = await _make_user(db_session, "only@example.com", is_admin=True)
    actor = await _make_user(db_session, "actor@example.com", is_admin=True)
    # Hacemos que only_admin sea el único admin (actor no es admin en este test)
    actor.is_admin = False
    await db_session.commit()
    with pytest.raises(ConflictError):
        await revoke_admin(db_session, only_admin.id, actor_id=actor.id)


@pytest.mark.asyncio
async def test_revoke_admin_unknown_user(db_session):
    with pytest.raises(NotFoundError):
        await revoke_admin(db_session, uuid4(), actor_id=uuid4())
