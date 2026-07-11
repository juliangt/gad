# backend/src/gad/admin/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import ActivityType, OfferRedemption, ReviewFlag, UserStatus, VenueStatus


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


class VenueCreateIn(BaseModel):
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    owner_name: str
    owner_email: str
    owner_phone: str | None = None


class VenueUpdateIn(BaseModel):
    name: str | None = None
    category: ActivityType | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    owner_name: str | None = None
    owner_email: str | None = None
    owner_phone: str | None = None


class VenueOfferCreateIn(BaseModel):
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime


class VenueOfferUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    redemption_method: OfferRedemption | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    active: bool | None = None


class VenueOfferAdminOut(BaseModel):
    id: UUID
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime
    active: bool


class VenueAdminOut(BaseModel):
    id: UUID
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    status: VenueStatus
    owner_name: str
    owner_email: str
    owner_phone: str | None = None
    created_at: datetime
    offers: list[VenueOfferAdminOut] = []

