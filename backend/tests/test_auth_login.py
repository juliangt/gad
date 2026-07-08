# backend/tests/test_auth_login.py
import pytest

from gad.auth.service import login, register
from gad.exceptions import InvalidCredentialsError
from gad.schemas.auth import LoginIn, RegisterIn


@pytest.mark.asyncio
async def test_login_success(db_session):
    await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    tokens = await login(
        db_session, LoginIn(email="ana@example.com", password="12345678")
    )
    assert tokens.access_token


@pytest.mark.asyncio
async def test_login_wrong_password_raises(db_session):
    await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    with pytest.raises(InvalidCredentialsError):
        await login(
            db_session, LoginIn(email="ana@example.com", password="wrong-password")
        )


@pytest.mark.asyncio
async def test_login_unknown_user_raises(db_session):
    with pytest.raises(InvalidCredentialsError):
        await login(db_session, LoginIn(email="nope@example.com", password="12345678"))
