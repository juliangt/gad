# backend/src/gad/admin/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import ReviewFlag, UserStatus


class AdminStatsOut(BaseModel):
    total_users: int
    total_plans: int
    total_matches: int
    open_reports: int


class ReportStatusUpdate(BaseModel):
    status: str


class AdminUserOut(BaseModel):
    id: UUID
    email: str
    display_name: str
    status: UserStatus
    is_admin: bool
    reputation_score: float
    created_at: datetime


class UserStatusUpdate(BaseModel):
    status: UserStatus


class FlaggedReviewOut(BaseModel):
    id: UUID
    match_id: UUID
    reviewer_id: UUID
    reviewee_id: UUID
    rating: int
    comment: str | None = None
    flag: ReviewFlag | None = None
    created_at: datetime

