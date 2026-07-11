# backend/src/gad/venues/service.py
from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.enums import ActivityType, VenueStatus
from gad.models.venue import Venue


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def list_nearby_venues(
    session: AsyncSession,
    *,
    lat: float,
    lng: float,
    radius_m: int,
    category: ActivityType | None = None,
    limit: int = 50,
) -> list[Venue]:
    """Devuelve venues activos dentro de radius_m, ordenados por distancia.

    Extrae ST_Y/ST_X en la misma query (batch) para evitar una segunda query
    por venue al serializar — mismo patrón que plans/list_nearby_plans.
    """
    viewer_point = _to_geography(lat, lng)
    loc_col = cast(Venue.location, Geometry)
    stmt = (
        select(
            Venue,
            func.ST_Y(loc_col).label("lat"),
            func.ST_X(loc_col).label("lng"),
        )
        .where(
            Venue.status == VenueStatus.active,
            Venue.location.ST_DWithin(viewer_point, radius_m),
        )
        .order_by(Venue.location.ST_Distance(viewer_point))
        .limit(limit)
    )
    if category is not None:
        stmt = stmt.where(Venue.category == category)

    result = await session.execute(stmt)
    venues = []
    for venue, vlat, vlng in result.all():
        venue._lat = vlat
        venue._lng = vlng
        venues.append(venue)
    return venues
