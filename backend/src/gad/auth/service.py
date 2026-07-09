# backend/src/gad/auth/service.py
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.jwt import create_access_token, create_refresh_token, decode_token
from gad.auth.oauth import GoogleUserInfo
from gad.auth.passwords import hash_password, verify_password
from gad.auth.token_store import TokenStore
from gad.config import settings
from gad.exceptions import (
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    InvalidTokenError,
)
from gad.models.enums import VerificationLevel
from gad.models.user import User
from gad.schemas.auth import LoginIn, RegisterIn, TokenOut


async def register(session: AsyncSession, data: RegisterIn) -> TokenOut:
    existing = await session.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none() is not None:
        raise EmailAlreadyExistsError("Email ya registrado")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        verification_level=VerificationLevel.none,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return _issue_tokens(user)


async def login(session: AsyncSession, data: LoginIn) -> TokenOut:
    result = await session.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None:
        raise InvalidCredentialsError("Credenciales inválidas")
    if not verify_password(data.password, user.password_hash):
        raise InvalidCredentialsError("Credenciales inválidas")

    return _issue_tokens(user)


async def login_or_register_google(
    session: AsyncSession, info: GoogleUserInfo
) -> TokenOut:
    result = await session.execute(select(User).where(User.google_id == info.google_id))
    user = result.scalar_one_or_none()

    if user is None:
        # Si ya existe el email, vincular google_id; si no, crear
        by_email = await session.execute(select(User).where(User.email == info.email))
        user = by_email.scalar_one_or_none()
        if user is None:
            user = User(
                email=info.email,
                google_id=info.google_id,
                display_name=info.display_name,
                avatar_url=info.avatar_url,
                verification_level=VerificationLevel.google,
            )
            session.add(user)
        else:
            user.google_id = info.google_id
            user.verification_level = VerificationLevel.google
        await session.commit()
        await session.refresh(user)

    return _issue_tokens(user)


async def refresh_tokens(refresh_token: str) -> TokenOut:
    try:
        payload = decode_token(refresh_token)
    except Exception as e:
        raise InvalidTokenError("Refresh token inválido") from e

    if payload.get("type") != "refresh":
        raise InvalidTokenError("Token no es de tipo refresh")

    user_id = payload["sub"]
    access = create_access_token(user_id=user_id)
    new_refresh = create_refresh_token(user_id=user_id)
    return TokenOut(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=UUID(user_id) if isinstance(user_id, str) else user_id,
    )


def _issue_tokens(user: User) -> TokenOut:
    access = create_access_token(user_id=str(user.id))
    refresh = create_refresh_token(user_id=str(user.id))
    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=user.id,
    )


async def logout(store: TokenStore, access_token: str) -> None:
    """Revoca el access token (y futuros refreshes de esta sesión vía jti).

    No falla si el token ya expiró o es inválido: logout es idempotente.
    """
    try:
        payload = decode_token(access_token)
    except Exception:
        return
    jti = payload.get("jti")
    user_id = str(payload.get("sub", ""))
    exp = payload.get("exp", 0)
    now = int(datetime.now(UTC).timestamp())
    ttl = max(1, exp - now)
    if jti and user_id:
        await store.revoke_jti(user_id, jti, ttl_seconds=ttl)
