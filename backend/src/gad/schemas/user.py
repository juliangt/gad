# backend/src/gad/schemas/user.py
from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from gad.models.enums import (
    Gender,
    GenderPreference,
    GroupSizePreference,
    VerificationLevel,
)


class PreferencesIn(BaseModel):
    default_search_radius_m: int = Field(default=2000, ge=100, le=50000)
    default_plan_validity_mins: int = Field(default=120, ge=0, le=1440)
    activity_types: list[str] = Field(default_factory=list)
    group_size_preference: GroupSizePreference = GroupSizePreference.either
    age_range_min: int = Field(default=18, ge=18, le=99)
    age_range_max: int = Field(default=99, ge=18, le=99)
    gender_preference: GenderPreference = GenderPreference.any_
    notify_new_plans: bool = True
    notify_messages: bool = True
    notify_pending_alerts: bool = True


class UserUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    bio: str | None = Field(default=None, max_length=500)
    birth_date: date | None = None
    gender: Gender | None = None
    locale: str | None = None
    timezone: str | None = None


class PreferencesOut(PreferencesIn):
    pass


class UserDetail(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    avatar_url: str | None
    bio: str | None
    birth_date: date | None
    gender: Gender
    reputation_score: float
    verification_level: VerificationLevel
    preferences: PreferencesOut


class UserPublicProfile(BaseModel):
    """Perfil visible para otros usuarios (sin email)."""

    id: UUID
    display_name: str
    avatar_url: str | None
    bio: str | None
    reputation_score: float
    verification_level: VerificationLevel
