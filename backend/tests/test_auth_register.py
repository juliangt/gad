# backend/tests/test_auth_register.py
import pytest

from gad.auth.service import register
from gad.exceptions import EmailAlreadyExistsError
from gad.schemas.auth import RegisterIn


@pytest.mark.asyncio
async def test_register_creates_user(db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )
    assert tokens.access_token
    assert tokens.refresh_token
    assert tokens.user_id


@pytest.mark.asyncio
async def test_register_duplicate_email_raises(db_session):
    data = RegisterIn(email="ana@example.com", password="12345678", display_name="Ana")
    await register(db_session, data)

    with pytest.raises(EmailAlreadyExistsError):
        await register(db_session, data)
