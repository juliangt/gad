# backend/src/gad/reviews/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.reviews.schemas import ReviewerSummary, ReviewIn, ReviewOut, ReviewWithReviewer
from gad.reviews.service import create_review, list_reviews_for_user

router = APIRouter(tags=["reviews"])


@router.post("/reviews", response_model=ReviewOut, status_code=201)
async def create_review_endpoint(
    data: ReviewIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewOut:
    review = await create_review(session, current_user, data)
    return ReviewOut(
        id=review.id, match_id=review.match_id, reviewer_id=review.reviewer_id,
        reviewee_id=review.reviewee_id, rating=review.rating, comment=review.comment,
        flag=review.flag, created_at=review.created_at,
    )


@router.get("/reviews", response_model=list[ReviewWithReviewer])
async def list_reviews_endpoint(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ReviewWithReviewer]:
    reviews = await list_reviews_for_user(session, user_id)
    out = []
    for r in reviews:
        reviewer = (
            await session.execute(select(User).where(User.id == r.reviewer_id))
        ).scalar_one()
        out.append(
            ReviewWithReviewer(
                id=r.id, match_id=r.match_id, reviewer_id=r.reviewer_id,
                reviewee_id=r.reviewee_id, rating=r.rating, comment=r.comment,
                flag=r.flag, created_at=r.created_at,
                reviewer=ReviewerSummary(
                    id=reviewer.id, display_name=reviewer.display_name,
                    avatar_url=reviewer.avatar_url,
                    reputation_score=reviewer.reputation_score,
                    verification_level=reviewer.verification_level.value,
                ),
            )
        )
    return out
