# backend/tests/test_availability_alerts.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn
from gad.availability.service import activate
from gad.models.enums import ActivityType, NotificationType, PlanMode
from gad.models.user import User
from gad.notifications.service import list_notifications
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    t = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    return (
        await session.execute(select(User).where(User.id == t.user_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_creating_plan_alerts_available_users(db_session):
    host = await _user(db_session, "host3@example.com")
    available_user = await _user(db_session, "avail3@example.com")

    await activate(
        db_session, available_user,
        AvailabilityIn(location=AvailabilityLocationIn(lat=-34.59, lng=-58.43)),
    )
    await create_plan(
        db_session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )

    notifs = await list_notifications(db_session, available_user.id)
    plan_alerts = [n for n in notifs if n.type == NotificationType.plan_alert]
    assert len(plan_alerts) == 1
