# backend/tests/test_reviews_service.py
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.exceptions import ConflictError, ValidationError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, MatchStatus, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.reviews.schemas import ReviewIn
from gad.reviews.service import create_review
from gad.schemas.auth import RegisterIn


async def _setup_completed_match(session, email_h="rh@example.com", email_a="ra@example.com"):
    host_t = await register(
        session, RegisterIn(email=email_h, password="12345678", display_name="H")
    )
    app_t = await register(
        session, RegisterIn(email=email_a, password="12345678", display_name="A")
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
    # Completar match
    match.status = MatchStatus.completed
    match.ended_at = datetime.now(UTC)
    await session.commit()
    return host, applicant, match


@pytest.mark.asyncio
async def test_create_review_updates_reputation(db_session):
    host, applicant, match = await _setup_completed_match(db_session)

    review = await create_review(
        db_session, host,
        ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=5),
    )
    assert review.rating == 5
    await db_session.refresh(applicant)
    assert applicant.reputation_score == 5.0


@pytest.mark.asyncio
async def test_cannot_review_self(db_session):
    host, applicant, match = await _setup_completed_match(db_session)
    with pytest.raises(ValidationError):
        await create_review(
            db_session, host,
            ReviewIn(match_id=match.id, reviewee_id=host.id, rating=5),
        )


@pytest.mark.asyncio
async def test_cannot_review_twice(db_session):
    host, applicant, match = await _setup_completed_match(db_session)
    await create_review(
        db_session, host,
        ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=5),
    )
    with pytest.raises(ConflictError):
        await create_review(
            db_session, host,
            ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=4),
        )


@pytest.mark.asyncio
async def test_cannot_review_non_completed_match(db_session):
    # Match sin completar (status=active)
    host_t = await register(
        db_session, RegisterIn(email="h3@example.com", password="12345678", display_name="H")
    )
    app_t = await register(
        db_session, RegisterIn(email="a3@example.com", password="12345678", display_name="A")
    )
    host = (
        await db_session.execute(select(User).where(User.id == host_t.user_id))
    ).scalar_one()
    applicant = (
        await db_session.execute(select(User).where(User.id == app_t.user_id))
    ).scalar_one()
    plan = await create_plan(
        db_session, host,
        PlanIn(
            activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
            max_participants=1,
            location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
        ),
    )
    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    match = await accept_application(db_session, host, app.id)

    with pytest.raises(ValidationError):
        await create_review(
            db_session, host,
            ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=5),
        )
