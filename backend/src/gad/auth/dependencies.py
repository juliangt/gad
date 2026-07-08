# backend/src/gad/auth/dependencies.py
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.jwt import decode_token
from gad.db import get_session
from gad.exceptions import AuthError, InvalidTokenError
from gad.models.user import User


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
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

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise InvalidTokenError("Token malformado") from e

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AuthError("Usuario no encontrado")

    return user
