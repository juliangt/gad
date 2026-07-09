# backend/src/gad/safety/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.safety.schemas import (
    PeerLocationOut,
    PingIn,
    SosOut,
    TrustedContactIn,
    TrustedContactOut,
)
from gad.safety.service import (
    add_trusted_contact,
    delete_trusted_contact,
    generate_share_link,
    get_peer_location,
    list_trusted_contacts,
    ping_location,
    revoke_share_link,
    trigger_sos,
)

router = APIRouter(tags=["safety"])


@router.get("/me/trusted-contacts", response_model=list[TrustedContactOut])
async def list_contacts_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TrustedContactOut]:
    contacts = await list_trusted_contacts(session, current_user)
    return [
        TrustedContactOut(
            id=c.id, contact_type=c.contact_type, contact_value=c.contact_value,
            label=c.label, created_at=c.created_at,
        )
        for c in contacts
    ]


@router.post("/me/trusted-contacts", response_model=TrustedContactOut, status_code=201)
async def add_contact_endpoint(
    data: TrustedContactIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TrustedContactOut:
    contact = await add_trusted_contact(session, current_user, data)
    return TrustedContactOut(
        id=contact.id, contact_type=contact.contact_type,
        contact_value=contact.contact_value, label=contact.label,
        created_at=contact.created_at,
    )


@router.delete("/me/trusted-contacts/{contact_id}")
async def delete_contact_endpoint(
    contact_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await delete_trusted_contact(session, current_user, contact_id)
    return {"message": "Contacto eliminado"}


@router.post("/safety/{match_id}/ping")
async def ping_endpoint(
    match_id: UUID,
    data: PingIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await ping_location(session, current_user, match_id, data.lat, data.lng)
    return {"message": "Ubicación actualizada"}


@router.get("/safety/{match_id}/peer", response_model=PeerLocationOut)
async def peer_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PeerLocationOut:
    lat, lng, ts = await get_peer_location(session, current_user, match_id)
    return PeerLocationOut(lat=lat, lng=lng, last_ping_at=ts)


@router.post("/safety/{match_id}/share-link")
async def share_link_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    token = await generate_share_link(session, current_user, match_id)
    return {"token": token, "url": f"/s/{token}"}


@router.delete("/safety/{match_id}/share-link")
async def revoke_share_link_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    token: str = Query(..., description="Token de share-link a revocar"),
) -> dict[str, str]:
    from gad.auth.dependencies import get_token_store

    await revoke_share_link(get_token_store(), token)
    return {"message": "Link revocado"}


@router.post("/safety/{match_id}/sos", response_model=SosOut)
async def sos_endpoint(
    match_id: UUID,
    data: PingIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SosOut:
    event = await trigger_sos(session, current_user, match_id, data.lat, data.lng)
    return SosOut(event_id=event.id, message="SOS registrado y notificado")
