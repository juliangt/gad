# backend/src/gad/safety/schemas.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ContactType


class TrustedContactIn(BaseModel):
    contact_type: ContactType
    contact_value: str = Field(min_length=3, max_length=255)
    label: str = Field(min_length=1, max_length=100)


class TrustedContactOut(BaseModel):
    id: UUID
    contact_type: ContactType
    contact_value: str
    label: str
    created_at: datetime


class PingIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class PeerLocationOut(BaseModel):
    lat: float | None
    lng: float | None
    last_ping_at: datetime | None


class SosOut(BaseModel):
    event_id: UUID
    message: str


class SafetyEventOut(BaseModel):
    id: UUID
    match_id: UUID | None
    user_id: UUID
    type: str
    payload: dict[str, Any] | None
    created_at: datetime


class PublicLocationOut(BaseModel):
    """Respuesta del link público /s/{token}."""

    match_id: UUID
    user_display_name: str
    lat: float | None
    lng: float | None
    last_ping_at: datetime | None
    expired: bool
