# backend/src/gad/auth/dependencies.py
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gad.auth.jwt import decode_token
from gad.auth.token_store import TokenStore
from gad.db import get_session
from gad.exceptions import AuthError, InvalidTokenError
from gad.models.enums import UserStatus
from gad.models.user import User

# Inicializado perezosamente; los tests pueden sobreescribir `_token_store`.
_token_store: TokenStore | None = None


def get_token_store() -> TokenStore:
    global _token_store
    if _token_store is None:
        from gad.redis_client import redis_client

        _token_store = TokenStore(redis_client)
    return _token_store


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Falta token de autorización")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except Exception as e:
        raise InvalidTokenError("Token inválido") from e

    if payload.get("type") != "access":
        raise InvalidTokenError("Token no es de tipo access")

    jti = payload.get("jti")
    store = get_token_store()
    if jti is not None and await store.is_revoked(jti):
        raise InvalidTokenError("Token revocado")

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise InvalidTokenError("Token malformado") from e

    result = await session.execute(
        select(User).options(selectinload(User.preferences)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise AuthError("Usuario no encontrado")
    if user.status != UserStatus.active:
        raise AuthError("Cuenta no activa")

    return user
