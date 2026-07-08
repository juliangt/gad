# backend/tests/test_safety_tokens.py
import uuid

import pytest
from jose import JWTError

from gad.safety.tokens import create_share_link_token, decode_share_link_token


def test_roundtrip_token():
    mid = uuid.uuid4()
    uid = uuid.uuid4()
    token = create_share_link_token(mid, uid)
    payload = decode_share_link_token(token)
    assert payload.match_id == str(mid)
    assert payload.user_id == str(uid)


def test_invalid_token_raises():
    with pytest.raises(JWTError):
        decode_share_link_token("garbage")


def test_tampered_token_raises():
    mid = uuid.uuid4()
    uid = uuid.uuid4()
    token = create_share_link_token(mid, uid)
    with pytest.raises(JWTError):
        decode_share_link_token(token[:-4] + "XXXX")
