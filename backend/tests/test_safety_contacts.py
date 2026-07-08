# backend/tests/test_safety_contacts.py
import pytest
from sqlalchemy import select

from gad.auth.service import register
from gad.exceptions import ConflictError
from gad.models.enums import ContactType
from gad.models.user import User
from gad.safety.schemas import TrustedContactIn
from gad.safety.service import add_trusted_contact, list_trusted_contacts
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    tokens = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == tokens.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_add_and_list_contacts(db_session):
    user = await _user(db_session, "c@example.com")
    await add_trusted_contact(
        db_session,
        user,
        TrustedContactIn(
            contact_type=ContactType.email, contact_value="m@example.com", label="Mom"
        ),
    )

    contacts = await list_trusted_contacts(db_session, user)
    assert len(contacts) == 1
    assert contacts[0].label == "Mom"


@pytest.mark.asyncio
async def test_max_two_contacts(db_session):
    user = await _user(db_session, "max@example.com")
    await add_trusted_contact(
        db_session,
        user,
        TrustedContactIn(contact_type=ContactType.email, contact_value="a@example.com", label="A"),
    )
    await add_trusted_contact(
        db_session,
        user,
        TrustedContactIn(contact_type=ContactType.phone, contact_value="+1234", label="B"),
    )
    with pytest.raises(ConflictError):
        await add_trusted_contact(
            db_session,
            user,
            TrustedContactIn(
                contact_type=ContactType.email, contact_value="c@example.com", label="C"
            ),
        )


@pytest.mark.asyncio
async def test_duplicate_contact_raises(db_session):
    user = await _user(db_session, "dup@example.com")
    await add_trusted_contact(
        db_session,
        user,
        TrustedContactIn(contact_type=ContactType.email, contact_value="x@example.com", label="X"),
    )
    with pytest.raises(ConflictError):
        await add_trusted_contact(
            db_session,
            user,
            TrustedContactIn(
                contact_type=ContactType.email, contact_value="x@example.com", label="X"
            ),
        )
