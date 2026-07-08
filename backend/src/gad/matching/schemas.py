# backend/src/gad/matching/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ApplicationStatus, MatchRole, MatchStatus


class ApplicationIn(BaseModel):
    message: str | None = Field(default=None, max_length=500)


class ApplicantSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    reputation_score: float
    verification_level: str


class ApplicationOut(BaseModel):
    id: UUID
    plan_id: UUID
    applicant: ApplicantSummary
    status: ApplicationStatus
    message: str | None
    created_at: datetime
    decided_at: datetime | None


class ParticipantOut(BaseModel):
    user_id: UUID
    display_name: str
    avatar_url: str | None
    role: MatchRole
    joined_at: datetime


class MatchOut(BaseModel):
    id: UUID
    plan_id: UUID
    status: MatchStatus
    started_at: datetime
    ended_at: datetime | None
    location_sharing_active: bool
    participants: list[ParticipantOut]
    # Ubicación exacta revelada solo a participantes
    exact_location_lat: float | None = None
    exact_location_lng: float | None = None
