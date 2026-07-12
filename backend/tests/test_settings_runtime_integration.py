import pytest

from gad.auth.jwt import create_access_token, decode_token


def test_create_access_token_with_custom_expiry():
    token = create_access_token(user_id="user-123", expires_in_minutes=5)
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    # exp debe estar dentro de un margen de 5 min (±10s)
    import time

    now = int(time.time())
    assert now + 4 * 60 < payload["exp"] <= now + 5 * 60 + 10


def test_create_access_token_default_when_no_arg():
    token = create_access_token(user_id="user-123")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
