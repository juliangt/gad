# backend/src/gad/safety/service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError
from gad.models.safety import TrustedContact
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
