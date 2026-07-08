# backend/src/gad/availability/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ActivityType


class AvailabilityLocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class AvailabilityIn(BaseModel):
    location: AvailabilityLocationIn
    radius_m: int = Field(default=2000, ge=100, le=50000)
    activity_filter: list[ActivityType] | None = None
    window_minutes: int = Field(default=120, ge=15, le=1440)


class AvailabilityOut(BaseModel):
    id: UUID
    radius_m: int
    activity_filter: list[str] | None
    expires_at: datetime
    active: bool
    created_at: datetime
