# backend/src/gad/auth/router.py
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user, get_token_store
from gad.auth.oauth import get_google_userinfo
from gad.auth.password_reset import get_password_reset_store
from gad.auth.service import (
    change_password,
    confirm_password_reset,
    login,
    login_or_register_google,
    logout,
    refresh_tokens,
    register,
    request_password_reset,
)
from gad.db import get_session
from gad.exceptions import InvalidTokenError, OAuthError
from gad.middleware.rate_limit import limiter
from gad.models.user import User
from gad.schemas.auth import (
    ChangePasswordIn,
    LoginIn,
    LogoutIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
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
async def logout_endpoint(body: LogoutIn) -> dict[str, str]:
    await logout(get_token_store(), body.access_token)
    return {"message": "Logout OK"}


@router.post("/change-password")
async def change_password_endpoint(
    data: ChangePasswordIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await change_password(
        session, get_token_store(), current_user, data.old_password, data.new_password
    )
    return {"message": "Contraseña actualizada"}


@router.post("/password-reset/request", status_code=202)
@limiter.limit("3/minute")
async def password_reset_request_endpoint(
    request: Request,
    data: PasswordResetRequestIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await request_password_reset(session, get_password_reset_store(), data.email)
    return {"message": "Si el email existe, recibirás instrucciones"}


@router.post("/password-reset/confirm")
async def password_reset_confirm_endpoint(
    data: PasswordResetConfirmIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    reset_store = get_password_reset_store()
    email = await reset_store.find_email_for_token(data.token)
    if email is None:
        raise InvalidTokenError("Token de reset inválido o expirado")
    await confirm_password_reset(
        session,
        reset_store,
        get_token_store(),
        email,
        data.token,
        data.new_password,
    )
    return {"message": "Contraseña restablecida"}


@router.get("/me", response_model=UserPublic)
async def me_endpoint(current_user: Annotated[User, Depends(get_current_user)]) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        verification_level=current_user.verification_level.value,
        reputation_score=current_user.reputation_score,
    )
