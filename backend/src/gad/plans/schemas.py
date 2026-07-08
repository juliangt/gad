# backend/src/gad/plans/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from gad.models.enums import ActivityType, PlanMode, PlanStatus


class PlanLocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str = Field(min_length=1, max_length=200)


class PlanIn(BaseModel):
    activity_type: ActivityType
    mode: PlanMode
    scheduled_at: datetime | None = None
    window_minutes: int = Field(default=120, ge=15, le=1440)
    max_participants: int = Field(default=1, ge=1, le=10)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    location: PlanLocationIn
    search_radius_m: int = Field(default=2000, ge=100, le=50000)

    @model_validator(mode="after")
    def _validate_mode(self):
        if self.mode == PlanMode.scheduled and self.scheduled_at is None:
            raise ValueError("scheduled_at es requerido cuando mode=scheduled")
        return self


class HostSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    reputation_score: float
    verification_level: str


class PlanOut(BaseModel):
    id: UUID
    activity_type: ActivityType
    mode: PlanMode
    scheduled_at: datetime | None
    window_minutes: int
    max_participants: int
    current_participants: int
    title: str
    description: str | None
    location_label: str
    # Ubicación aproximada (lat/lng del grid) — nunca la exacta hasta match
    location_lat: float
    location_lng: float
    search_radius_m: int
    status: PlanStatus
    expires_at: datetime
    host: HostSummary
    created_at: datetime


class PlanListItem(PlanOut):
    pass
