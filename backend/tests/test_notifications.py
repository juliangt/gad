# backend/tests/test_notifications.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.models.enums import NotificationType
from gad.models.user import User
from gad.notifications.service import (
    create_notification,
    list_notifications,
    mark_read,
    unread_count,
)
from gad.schemas.auth import RegisterIn


async def _make_user(session, email="n@example.com"):
    tokens = await register(
        session, RegisterIn(email=email, password="12345678", display_name="N")
    )
    result = await session.execute(select(User).where(User.id == tokens.user_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_create_and_list_notification(db_session):
    user = await _make_user(db_session, "n1@example.com")
    await create_notification(db_session, user.id, NotificationType.new_message, {"x": 1})

    notifs = await list_notifications(db_session, user.id)
    assert len(notifs) == 1
    assert notifs[0].type == NotificationType.new_message


@pytest.mark.asyncio
async def test_unread_count_and_mark_read(db_session):
    user = await _make_user(db_session, "n2@example.com")
    n1 = await create_notification(db_session, user.id, NotificationType.match)
    await create_notification(db_session, user.id, NotificationType.match)

    assert await unread_count(db_session, user.id) == 2
    await mark_read(db_session, user.id, n1.id)
    assert await unread_count(db_session, user.id) == 1


@pytest.mark.asyncio
async def test_list_unread_only(db_session):
    user = await _make_user(db_session, "n3@example.com")
    n1 = await create_notification(db_session, user.id, NotificationType.match)
    await create_notification(db_session, user.id, NotificationType.match)
    await mark_read(db_session, user.id, n1.id)

    notifs = await list_notifications(db_session, user.id, unread_only=True)
    assert len(notifs) == 1
