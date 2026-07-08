# backend/tests/test_safety_sos.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, PlanMode, SafetyEventType
from gad.models.user import User
from gad.notifications.service import list_notifications
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.safety.service import (
    generate_share_link,
    get_public_location,
    ping_location,
    trigger_sos,
)
from gad.schemas.auth import RegisterIn


async def _match(session):
    host_t = await register(
        session, RegisterIn(email="sh2@example.com", password="12345678", display_name="H")
    )
    app_t = await register(
        session, RegisterIn(email="sa2@example.com", password="12345678", display_name="A")
    )
    host = (
        await session.execute(select(User).where(User.id == host_t.user_id))
    ).scalar_one()
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
async def test_sos_creates_event_and_notifies(db_session):
    host, applicant, match = await _match(db_session)

    event = await trigger_sos(db_session, host, match.id, -34.5, -58.4)

    assert event.type == SafetyEventType.sos
    notifs = await list_notifications(db_session, applicant.id)
    # El applicant ya tiene 1 notificación de "match" (de accept_application);
    # el SOS añade 1 de tipo safety.
    safety_notifs = [n for n in notifs if n.type.value == "safety"]
    assert len(safety_notifs) == 1


@pytest.mark.asyncio
async def test_share_link_resolves_to_location(db_session):
    host, applicant, match = await _match(db_session)

    await ping_location(db_session, host, match.id, -34.59, -58.43)

    token = await generate_share_link(db_session, host, match.id)
    info = await get_public_location(db_session, token)

    assert info["user_display_name"] == "H"
    assert info["lat"] is not None
    assert info["expired"] is False
