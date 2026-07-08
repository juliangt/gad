# backend/src/gad/availability/service.py
from datetime import UTC, datetime, timedelta

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.availability.schemas import AvailabilityIn
from gad.models.availability import Availability
from gad.models.geo import snap_to_grid
from gad.models.user import User


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def activate(
    session: AsyncSession, user: User, data: AvailabilityIn
) -> Availability:
    # Solo una availability activa por user: desactivar previas
    existing = await session.execute(
        select(Availability).where(
            Availability.user_id == user.id, Availability.active.is_(True)
        )
    )
    for a in existing.scalars():
        a.active = False

    grid_lat, grid_lng = snap_to_grid(data.location.lat, data.location.lng)
    availability = Availability(
        user_id=user.id,
        location_grid=_to_geography(grid_lat, grid_lng),
        radius_m=data.radius_m,
        activity_filter=(
            [act.value for act in data.activity_filter] if data.activity_filter else None
        ),
        expires_at=datetime.now(UTC) + timedelta(minutes=data.window_minutes),
        active=True,
    )
    session.add(availability)
    await session.commit()
    await session.refresh(availability)
    return availability


async def deactivate(session: AsyncSession, user: User) -> None:
    result = await session.execute(
        select(Availability).where(
            Availability.user_id == user.id, Availability.active.is_(True)
        )
    )
    for a in result.scalars():
        a.active = False
    await session.commit()


async def get_mine(session: AsyncSession, user: User) -> Availability | None:
    result = await session.execute(
        select(Availability).where(
            Availability.user_id == user.id, Availability.active.is_(True)
        )
    )
    return result.scalar_one_or_none()
