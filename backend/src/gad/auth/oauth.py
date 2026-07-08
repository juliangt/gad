# backend/src/gad/auth/oauth.py
from dataclasses import dataclass

import httpx

from gad.config import settings
from gad.exceptions import OAuthError


@dataclass
class GoogleUserInfo:
    google_id: str
    email: str
    display_name: str
    avatar_url: str | None = None


async def get_google_userinfo(code: str) -> GoogleUserInfo:
    """Intercambia un código de autorización de Google por userinfo."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": "postmessage",
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise OAuthError(f"Google token exchange failed: {token_resp.status_code}")

        access_token = token_resp.json()["access_token"]

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise OAuthError(f"Google userinfo failed: {user_resp.status_code}")

        data = user_resp.json()

    return GoogleUserInfo(
        google_id=data["sub"],
        email=data["email"],
        display_name=data.get("name", data["email"].split("@")[0]),
        avatar_url=data.get("picture"),
    )
