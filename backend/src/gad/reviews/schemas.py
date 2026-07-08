# backend/src/gad/reviews/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ReviewFlag


class ReviewIn(BaseModel):
    match_id: UUID
    reviewee_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)
    flag: ReviewFlag | None = None


class ReviewOut(BaseModel):
    id: UUID
    match_id: UUID
    reviewer_id: UUID
    reviewee_id: UUID
    rating: int
    comment: str | None
    flag: ReviewFlag | None
    created_at: datetime


class ReviewerSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    reputation_score: float
    verification_level: str


class ReviewWithReviewer(ReviewOut):
    reviewer: ReviewerSummary
