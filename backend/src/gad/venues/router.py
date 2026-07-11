# backend/src/gad/venues/router.py
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.middleware.rate_limit import limiter
from gad.models.enums import ActivityType
from gad.models.user import User
from gad.venues.schemas import VenueListItem, VenueListOut, VenueOfferOut
from gad.venues.service import list_nearby_venues

router = APIRouter(prefix="/venues", tags=["venues"])


def _offer_to_out(offer) -> VenueOfferOut | None:
    """Convierte una VenueOffer a VenueOfferOut si está vigente, si no None."""
    now = datetime.now(UTC)
    if not offer.active:
        return None
    if offer.valid_from > now or offer.valid_until < now:
        return None
    return VenueOfferOut(
        id=offer.id,
        title=offer.title,
        description=offer.description,
        redemption_method=offer.redemption_method,
        valid_from=offer.valid_from,
        valid_until=offer.valid_until,
    )


def _venue_to_item(venue) -> VenueListItem:
    offers = [
        _offer_to_out(o) for o in venue.offers if _offer_to_out(o) is not None
    ]
    return VenueListItem(
        id=venue.id,
        name=venue.name,
        category=venue.category,
        address=venue.address,
        lat=getattr(venue, "_lat", 0.0),
        lng=getattr(venue, "_lng", 0.0),
        offers=offers,
    )


@router.get("", response_model=VenueListOut)
@limiter.limit("60/minute")
async def list_venues_endpoint(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius: int = Query(default=2000, ge=100, le=20000),
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> VenueListOut:
    category_enum = ActivityType(category) if category else None
    venues = await list_nearby_venues(
        session,
        lat=lat,
        lng=lng,
        radius_m=radius,
        category=category_enum,
        limit=limit,
    )
    items = [_venue_to_item(v) for v in venues]
    return VenueListOut(items=items, count=len(items))
