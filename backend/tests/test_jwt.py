# backend/tests/test_jwt.py
import time

import pytest
from jose import JWTError

from gad.auth.jwt import create_access_token, create_refresh_token, decode_token
from gad.config import get_settings

SECRET = "test-secret-12345678901234567890"
ENV = {
    "JWT_SECRET": SECRET,
    "DATABASE_URL": "postgresql+asyncpg://u:p@db:5432/gad",
    "REDIS_URL": "redis://redis:6379/0",
}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_access_token_has_sub_type_and_expiry():
    token = create_access_token(user_id="user-123")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    assert payload["exp"] > payload["iat"]


def test_refresh_token_has_type_refresh():
    token = create_refresh_token(user_id="user-123")
    payload = decode_token(token)
    assert payload["type"] == "refresh"


def test_decode_invalid_signature_raises():
    token = create_access_token(user_id="user-123")
    # Manipular la firma
    tampered = token[:-4] + "XXXX"
    with pytest.raises(JWTError):
        decode_token(tampered)


def test_decode_expired_token_raises(monkeypatch):
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "-1")
    get_settings.cache_clear()
    token = create_access_token(user_id="user-123")
    time.sleep(1)
    with pytest.raises(JWTError):
        decode_token(token)
