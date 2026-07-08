# backend/tests/test_reports.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.exceptions import ValidationError
from gad.models.user import User
from gad.reports.schemas import ReportIn
from gad.reports.service import create_report
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    t = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    return (
        await session.execute(select(User).where(User.id == t.user_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_create_report(db_session):
    reporter = await _user(db_session, "rep@example.com")
    reported = await _user(db_session, "rpd@example.com")

    report = await create_report(
        db_session, reporter, reported.id,
        ReportIn(reason="spam", description="xinbox"),
    )
    assert report.reason == "spam"
    assert report.status == "open"


@pytest.mark.asyncio
async def test_cannot_report_self(db_session):
    reporter = await _user(db_session, "self@example.com")
    with pytest.raises(ValidationError):
        await create_report(
            db_session, reporter, reporter.id,
            ReportIn(reason="spam"),
        )
