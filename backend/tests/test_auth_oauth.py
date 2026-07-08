# backend/tests/test_auth_oauth.py
import pytest
import respx
from httpx import Response

from gad.auth.oauth import GoogleUserInfo, get_google_userinfo


@respx.mock
async def test_get_google_userinfo_success():
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=Response(
            200, json={"access_token": "ya29.test-token", "expires_in": 3599}
        )
    )
    respx.get("https://www.googleapis.com/oauth2/v3/userinfo").mock(
        return_value=Response(
            200,
            json={
                "sub": "google-123",
                "email": "ana@example.com",
                "name": "Ana",
                "picture": "https://img/ana.png",
            },
        )
    )

    info = await get_google_userinfo(code="valid-code")

    assert isinstance(info, GoogleUserInfo)
    assert info.google_id == "google-123"
    assert info.email == "ana@example.com"
    assert info.display_name == "Ana"


@respx.mock
async def test_get_google_userinfo_invalid_code():
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=Response(400, json={"error": "invalid_grant"})
    )

    from gad.exceptions import OAuthError

    with pytest.raises(OAuthError):
        await get_google_userinfo(code="bad-code")
