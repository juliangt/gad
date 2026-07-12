# backend/src/gad/admin/settings_schemas.py
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class UserDefaultsIn(BaseModel):
    default_plan_validity_mins: int = Field(ge=1, le=1440)
    default_search_radius_m: int = Field(ge=100, le=50000)
    age_range_min: int = Field(ge=18, le=99)
    age_range_max: int = Field(ge=18, le=99)
    group_size_preference: str
    gender_preference: str
    activity_types: list[str] = Field(min_length=1)


class UserDefaultsOut(UserDefaultsIn):
    pass


class OperationalSettingsOut(BaseModel):
    rate_limit_enabled: bool
    default_rate_limit: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    max_avatar_bytes: int
    ws_max_message_rate: int


class FeatureFlagOut(BaseModel):
    key: str
    enabled: bool
    description: str | None = None


class FeatureFlagUpdate(BaseModel):
    enabled: bool


class MaintenanceIn(BaseModel):
    enabled: bool
    message: str = ""
    banner_active: bool = False
    banner_message: str = ""
    banner_level: Literal["info", "warning"] = "info"


class MaintenanceOut(MaintenanceIn):
    updated_by: UUID | None = None


class AuditEventOut(BaseModel):
    id: UUID
    actor_id: UUID | None = None
    action: str
    target_type: str
    target_id: str | None = None
    detail: dict
    created_at: datetime
