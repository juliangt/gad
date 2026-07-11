# backend/src/gad/venues/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import ActivityType, OfferRedemption


class VenueOfferOut(BaseModel):
    id: UUID
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime


class VenueListItem(BaseModel):
    id: UUID
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    distance_m: int | None = None
    offers: list[VenueOfferOut] = []


class VenueListOut(BaseModel):
    items: list[VenueListItem]
    count: int
