# backend/src/gad/venues/admin_service.py
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError
from gad.models.enums import VenueStatus
from gad.models.venue import Venue, VenueOffer


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def _get_venue(session: AsyncSession, venue_id: UUID) -> Venue:
    result = await session.execute(select(Venue).where(Venue.id == venue_id))
    venue = result.scalar_one_or_none()
    if venue is None:
        raise NotFoundError("Venue no encontrado")
    return venue


async def create_venue(session: AsyncSession, data) -> Venue:
    venue = Venue(
        name=data.name,
        category=data.category,
        address=data.address,
        location=_to_geography(data.lat, data.lng),
        status=VenueStatus.pending,
        owner_name=data.owner_name,
        owner_email=data.owner_email,
        owner_phone=data.owner_phone,
    )
    session.add(venue)
    await session.commit()
    await session.refresh(venue)
    return venue


async def list_venues_admin(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
) -> list[Venue]:
    stmt = select(Venue).order_by(Venue.created_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(Venue.status == VenueStatus(status))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_venue_admin(session: AsyncSession, venue_id: UUID) -> Venue:
    return await _get_venue(session, venue_id)


async def update_venue(session: AsyncSession, venue: Venue, data) -> Venue:
    dump = data.model_dump(exclude_unset=True)
    for field in ("name", "category", "address", "owner_name", "owner_email", "owner_phone"):
        if field in dump and dump[field] is not None:
            setattr(venue, field, dump[field])
    # Location se actualiza sólo si ambos coords vienen.
    if dump.get("lat") is not None and dump.get("lng") is not None:
        venue.location = _to_geography(dump["lat"], dump["lng"])
    await session.commit()
    await session.refresh(venue)
    return venue


async def approve_venue(session: AsyncSession, venue: Venue) -> Venue:
    if venue.status != VenueStatus.pending:
        raise ConflictError("Solo se pueden aprobar venues en estado pending")
    venue.status = VenueStatus.active
    await session.commit()
    await session.refresh(venue)
    return venue


async def pause_venue(session: AsyncSession, venue: Venue) -> Venue:
    if venue.status != VenueStatus.active:
        raise ConflictError("Solo se pueden pausar venues en estado active")
    venue.status = VenueStatus.paused
    await session.commit()
    await session.refresh(venue)
    return venue


async def revoke_venue(session: AsyncSession, venue: Venue) -> Venue:
    # Revocar es terminal: desde cualquier estado.
    venue.status = VenueStatus.revoked
    await session.commit()
    await session.refresh(venue)
    return venue


async def create_offer(session: AsyncSession, venue_id: UUID, data) -> VenueOffer:
    venue = await _get_venue(session, venue_id)
    if data.valid_from >= data.valid_until:
        raise ConflictError("valid_from debe ser anterior a valid_until")
    offer = VenueOffer(
        venue_id=venue.id,
        title=data.title,
        description=data.description,
        redemption_method=data.redemption_method,
        valid_from=data.valid_from,
        valid_until=data.valid_until,
    )
    session.add(offer)
    await session.commit()
    await session.refresh(offer)
    return offer


async def _get_offer(
    session: AsyncSession, venue_id: UUID, offer_id: UUID
) -> VenueOffer:
    result = await session.execute(
        select(VenueOffer).where(
            VenueOffer.id == offer_id, VenueOffer.venue_id == venue_id
        )
    )
    offer = result.scalar_one_or_none()
    if offer is None:
        raise NotFoundError("Oferta no encontrada")
    return offer


async def update_offer(
    session: AsyncSession, venue_id: UUID, offer_id: UUID, data
) -> VenueOffer:
    offer = await _get_offer(session, venue_id, offer_id)
    dump = data.model_dump(exclude_unset=True)
    for field in (
        "title",
        "description",
        "redemption_method",
        "valid_from",
        "valid_until",
        "active",
    ):
        if field in dump:
            setattr(offer, field, dump[field])
    # Re-validar fechas si alguna cambió.
    if offer.valid_from >= offer.valid_until:
        raise ConflictError("valid_from debe ser anterior a valid_until")
    await session.commit()
    await session.refresh(offer)
    return offer


async def delete_offer(
    session: AsyncSession, venue_id: UUID, offer_id: UUID
) -> None:
    offer = await _get_offer(session, venue_id, offer_id)
    await session.delete(offer)
    await session.commit()
