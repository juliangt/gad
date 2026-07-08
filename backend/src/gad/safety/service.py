# backend/src/gad/safety/service.py
from datetime import UTC, datetime
from uuid import UUID

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.models.match import MatchParticipant
from gad.models.safety import SafetySession, TrustedContact
from gad.models.user import User
from gad.safety.schemas import TrustedContactIn

MAX_TRUSTED_CONTACTS = 2


async def list_trusted_contacts(session: AsyncSession, user: User) -> list[TrustedContact]:
    result = await session.execute(
        select(TrustedContact)
        .where(TrustedContact.user_id == user.id)
        .order_by(TrustedContact.created_at.desc())
    )
    return list(result.scalars().all())


async def add_trusted_contact(
    session: AsyncSession, user: User, data: TrustedContactIn
) -> TrustedContact:
    existing = await list_trusted_contacts(session, user)
    if len(existing) >= MAX_TRUSTED_CONTACTS:
        raise ConflictError(
            f"Ya tenés el máximo de {MAX_TRUSTED_CONTACTS} contactos de confianza"
        )
    # Validar duplicado
    for c in existing:
        if c.contact_value == data.contact_value:
            raise ConflictError("Ya tenés ese contacto registrado")

    contact = TrustedContact(
        user_id=user.id,
        contact_type=data.contact_type,
        contact_value=data.contact_value,
        label=data.label,
    )
    session.add(contact)
    await session.commit()
    await session.refresh(contact)
    return contact


async def delete_trusted_contact(
    session: AsyncSession, user: User, contact_id: UUID
) -> None:
    result = await session.execute(
        select(TrustedContact).where(
            TrustedContact.id == contact_id,
            TrustedContact.user_id == user.id,
        )
    )
    contact = result.scalar_one_or_none()
    if contact is None:
        raise NotFoundError("Contacto no encontrado")
    await session.delete(contact)
    await session.commit()


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def _verify_participant(
    session: AsyncSession, match_id: UUID, user_id: UUID
) -> None:
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise ValidationError("No sos participante de este match")


async def _get_or_create_session(
    session: AsyncSession, match_id: UUID, user_id: UUID
) -> SafetySession:
    result = await session.execute(
        select(SafetySession).where(
            SafetySession.match_id == match_id,
            SafetySession.user_id == user_id,
        )
    )
    safety = result.scalar_one_or_none()
    if safety is None:
        safety = SafetySession(
            match_id=match_id,
            user_id=user_id,
            started_at=datetime.now(UTC),
        )
        session.add(safety)
        await session.commit()
        await session.refresh(safety)
    return safety


async def ping_location(
    session: AsyncSession,
    user: User,
    match_id: UUID,
    lat: float,
    lng: float,
) -> SafetySession:
    await _verify_participant(session, match_id, user.id)
    safety = await _get_or_create_session(session, match_id, user.id)
    safety.last_ping_location = _to_geography(lat, lng)
    safety.last_ping_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(safety)
    return safety


async def get_peer_location(
    session: AsyncSession, user: User, match_id: UUID
) -> tuple[float | None, float | None, datetime | None]:
    """Devuelve (lat, lng, last_ping_at) del OTRO participante del match.
    Para grupos, devuelve el del último ping."""
    await _verify_participant(session, match_id, user.id)

    result = await session.execute(
        select(SafetySession)
        .join(MatchParticipant, MatchParticipant.user_id == SafetySession.user_id)
        .where(
            SafetySession.match_id == match_id,
            SafetySession.user_id != user.id,
        )
        .order_by(SafetySession.last_ping_at.desc().nulls_last())
        .limit(1)
    )
    other = result.scalar_one_or_none()
    if other is None or other.last_ping_location is None or other.last_ping_at is None:
        return None, None, None

    # last_ping_location es geography; ST_X/ST_Y requieren geometry.
    loc_col = cast(other.__table__.c.last_ping_location, Geometry)
    point = await session.execute(
        select(
            func.ST_Y(loc_col).label("lat"),
            func.ST_X(loc_col).label("lng"),
        ).where(other.__table__.c.id == other.id)
    )
    lat, lng = point.one()
    return lat, lng, other.last_ping_at

