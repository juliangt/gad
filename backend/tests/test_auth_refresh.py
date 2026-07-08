# backend/tests/test_auth_refresh.py
import pytest

from gad.auth.jwt import create_access_token
from gad.auth.service import refresh_tokens, register
from gad.exceptions import InvalidTokenError
from gad.schemas.auth import RegisterIn


@pytest.mark.asyncio
async def test_refresh_issues_new_tokens(db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    new_tokens = await refresh_tokens(tokens.refresh_token)
    assert new_tokens.access_token
    assert new_tokens.refresh_token != tokens.refresh_token


@pytest.mark.asyncio
async def test_refresh_with_access_token_raises(db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="ana@example.com", password="12345678", display_name="Ana"),
    )

    with pytest.raises(InvalidTokenError):
        await refresh_tokens(tokens.access_token)


@pytest.mark.asyncio
async def test_refresh_with_garbage_raises():
    with pytest.raises(InvalidTokenError):
        await refresh_tokens("not-a-token")


@pytest.mark.asyncio
async def test_refresh_with_access_token_string_raises():
    # Un access token válido (no refresh) también debe fallar
    token = create_access_token(user_id="some-user")
    with pytest.raises(InvalidTokenError):
        await refresh_tokens(token)
