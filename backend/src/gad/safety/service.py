# backend/src/gad/safety/service.py
from datetime import UTC, datetime
from uuid import UUID

import structlog
from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, InvalidTokenError, NotFoundError, ValidationError
from gad.models.enums import NotificationType, SafetyEventType
from gad.models.match import MatchParticipant
from gad.models.safety import SafetyEvent, SafetySession, TrustedContact
from gad.models.user import User
from gad.notifications.service import create_notifications_bulk
from gad.safety.schemas import TrustedContactIn
from gad.safety.tokens import create_share_link_token, decode_share_link_token

logger = structlog.get_logger().bind(component="safety")

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


async def trigger_sos(
    session: AsyncSession, user: User, match_id: UUID, lat: float, lng: float
) -> SafetyEvent:
    await _verify_participant(session, match_id, user.id)

    event = SafetyEvent(
        match_id=match_id,
        user_id=user.id,
        type=SafetyEventType.sos,
        payload={"lat": lat, "lng": lng},
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)

    # Notificar al otro participante
    other_participants = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id != user.id,
        )
    )

    other_user_ids = [p.user_id for p in other_participants.scalars()]
    if other_user_ids:
        await create_notifications_bulk(
            session,
            other_user_ids,
            NotificationType.safety,
            {"type": "sos", "match_id": str(match_id), "from": str(user.id)},
        )

    logger.warning("sos_triggered", user_id=str(user.id), match_id=str(match_id))
    return event


async def generate_share_link(
    session: AsyncSession, user: User, match_id: UUID
) -> str:
    await _verify_participant(session, match_id, user.id)
    return create_share_link_token(match_id, user.id)


async def revoke_share_link(store, token: str) -> None:
    """Marca el token de share-link como revocado en Redis (denylist).

    El token safety_link no tiene jti propio, así que usamos un sufijo del token
    como identificador de revocación. Idempotente si el token es inválido/expirado.
    """
    import jwt

    from gad.config import settings

    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except Exception:
        return
    jti = payload.get("jti") or token[-16:]
    exp = payload.get("exp", 0)
    now = int(datetime.now(UTC).timestamp())
    ttl = max(1, exp - now)
    await store.revoke_jti(str(payload.get("sub", "")), jti, ttl_seconds=ttl)


async def get_public_location(
    session: AsyncSession, token: str
) -> dict:
    """Resuelve el link público: valida token, devuelve ubicación del user."""
    try:
        payload = decode_share_link_token(token)
    except Exception as e:
        raise InvalidTokenError("Link inválido o expirado") from e

    match_id = UUID(payload.match_id)
    user_id = UUID(payload.user_id)

    # Info del user
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("Usuario no encontrado")

    # Última sesión de safety
    safety_result = await session.execute(
        select(SafetySession).where(
            SafetySession.match_id == match_id,
            SafetySession.user_id == user_id,
        )
    )
    safety = safety_result.scalar_one_or_none()

    lat = lng = None
    last_ping = None
    if safety and safety.last_ping_location and safety.last_ping_at:
        # last_ping_location es geography; ST_X/ST_Y requieren geometry.
        loc_col = cast(safety.__table__.c.last_ping_location, Geometry)
        point = await session.execute(
            select(
                func.ST_Y(loc_col),
                func.ST_X(loc_col),
            ).where(safety.__table__.c.id == safety.id)
        )
        lat, lng = point.one()
        last_ping = safety.last_ping_at

    expired = payload.exp < datetime.now(UTC).timestamp()

    return {
        "match_id": match_id,
        "user_display_name": user.display_name,
        "lat": lat,
        "lng": lng,
        "last_ping_at": last_ping,
        "expired": expired,
    }


