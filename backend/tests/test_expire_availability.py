# backend/tests/test_expire_availability.py
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from gad.auth.service import register
from gad.jobs.expire_availability import expire_availability
from gad.models.availability import Availability
from gad.models.user import User
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    t = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    return (
        await session.execute(select(User).where(User.id == t.user_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_expire_availability_deactivates_past(db_session):
    user = await _user(db_session, "ex@example.com")
    avail = Availability(
        user_id=user.id,
        location_grid=WKTElement("POINT(-58.43 -34.59)", srid=4326),
        radius_m=2000,
        expires_at=datetime.now(UTC) - timedelta(hours=1),
        active=True,
    )
    db_session.add(avail)
    await db_session.commit()

    count = await expire_availability(db_session)
    assert count >= 1

    await db_session.refresh(avail)
    assert avail.active is False
