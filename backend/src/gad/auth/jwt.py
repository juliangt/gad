# backend/src/gad/auth/jwt.py
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from jwt import PyJWTError

from gad.config import get_settings


def create_access_token(user_id: str, expires_in_minutes: int | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    minutes = expires_in_minutes if expires_in_minutes is not None else settings.access_token_expire_minutes
    payload = {
        "sub": user_id,
        "type": "access",
        # iat con resolución sub-segundo para comparaciones exactas contra
        # password_changed_at (revocación de sesiones al cambiar contraseña).
        "iat": now.timestamp(),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, expires_in_days: int | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    days = expires_in_days if expires_in_days is not None else settings.refresh_token_expire_days
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": now.timestamp(),
        "exp": int((now + timedelta(days=days)).timestamp()),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except PyJWTError as e:
        raise PyJWTError(f"Token inválido: {e}") from e
