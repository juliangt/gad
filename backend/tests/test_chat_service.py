# backend/tests/test_chat_service.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.chat.service import get_history, get_unread_count, mark_read, send_message
from gad.exceptions import ValidationError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _setup_match(session):
    host_t = await register(
        session, RegisterIn(email="h@example.com", password="12345678", display_name="H")
    )
    app_t = await register(
        session, RegisterIn(email="a@example.com", password="12345678", display_name="A")
    )
    host = (await session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (
        await session.execute(select(User).where(User.id == app_t.user_id))
    ).scalar_one()

    plan = await create_plan(
        session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            max_participants=1,
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )
    app = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
    match = await accept_application(session, host, app.id)
    return host, applicant, match


@pytest.mark.asyncio
async def test_send_message_persists(db_session):
    host, applicant, match = await _setup_match(db_session)

    msg = await send_message(db_session, host, match.id, "Hola")

    assert msg.content == "Hola"
    assert msg.sender_id == host.id


@pytest.mark.asyncio
async def test_non_participant_cannot_send(db_session):
    host, applicant, match = await _setup_match(db_session)
    outsider_t = await register(
        db_session, RegisterIn(email="o@example.com", password="12345678", display_name="O")
    )
    outsider = (
        await db_session.execute(select(User).where(User.id == outsider_t.user_id))
    ).scalar_one()

    with pytest.raises(ValidationError):
        await send_message(db_session, outsider, match.id, "spam")


@pytest.mark.asyncio
async def test_history_returns_chronological(db_session):
    host, applicant, match = await _setup_match(db_session)
    await send_message(db_session, host, match.id, "uno")
    await send_message(db_session, applicant, match.id, "dos")

    history = await get_history(db_session, host, match.id)
    assert [m.content for m in history] == ["uno", "dos"]


@pytest.mark.asyncio
async def test_mark_read_clears_unread(db_session):
    host, applicant, match = await _setup_match(db_session)
    await send_message(db_session, host, match.id, "para ti")

    assert await get_unread_count(db_session, applicant, match.id) == 1
    count = await mark_read(db_session, applicant, match.id)
    assert count == 1
    assert await get_unread_count(db_session, applicant, match.id) == 0
