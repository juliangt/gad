# backend/src/gad/safety/tokens.py
"""Tokens firmados para el link público de ubicación compartida.

El token contiene: match_id, user_id (quien comparte), y timestamp de creación.
Se firma con JWT_SECRET. Expira a las 24hs o cuando el match termina.
"""
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
from jwt import PyJWTError

from gad.config import settings

LINK_TTL_HOURS = 24


@dataclass
class LinkPayload:
    match_id: str
    user_id: str
    iat: int
    exp: int


def create_share_link_token(match_id: UUID, user_id: UUID) -> str:
    now = datetime.now(UTC)
    payload = {
        "match_id": str(match_id),
        "user_id": str(user_id),
        "type": "safety_link",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=LINK_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_share_link_token(token: str) -> LinkPayload:
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except PyJWTError as e:
        raise PyJWTError(f"Link inválido: {e}") from e

    if payload.get("type") != "safety_link":
        raise PyJWTError("Token no es safety_link")

    return LinkPayload(
        match_id=payload["match_id"],
        user_id=payload["user_id"],
        iat=payload["iat"],
        exp=payload["exp"],
    )
