# backend/src/gad/auth/router.py
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.auth.oauth import get_google_userinfo
from gad.auth.service import login, login_or_register_google, refresh_tokens, register
from gad.db import get_session
from gad.exceptions import OAuthError
from gad.middleware.rate_limit import limiter
from gad.models.user import User
from gad.schemas.auth import (
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenOut,
    UserPublic,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
@limiter.limit("5/minute")
async def register_endpoint(
    request: Request,
    data: RegisterIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenOut:
    return await register(session, data)


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login_endpoint(
    request: Request,
    data: LoginIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenOut:
    return await login(session, data)


@router.post("/oauth/google", response_model=TokenOut)
async def oauth_google_endpoint(
    body: RefreshIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> TokenOut:
    """`body.refresh_token` transporta el código de autorización de Google."""
    try:
        info = await get_google_userinfo(code=body.refresh_token)
    except OAuthError:
        raise
    return await login_or_register_google(session, info)


@router.post("/refresh", response_model=TokenOut)
async def refresh_endpoint(body: RefreshIn) -> TokenOut:
    return await refresh_tokens(body.refresh_token)


@router.post("/logout")
async def logout_endpoint(response: Response) -> dict[str, str]:
    # Stateless: el cliente descarta los tokens. La cookie se limpia.
    response.delete_cookie("refresh_token")
    return {"message": "Logout OK"}


@router.get("/me", response_model=UserPublic)
async def me_endpoint(current_user: Annotated[User, Depends(get_current_user)]) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        verification_level=current_user.verification_level.value,
        reputation_score=current_user.reputation_score,
    )
