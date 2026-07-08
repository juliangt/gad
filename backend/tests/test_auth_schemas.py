# backend/tests/test_auth_schemas.py
import pytest
from pydantic import ValidationError

from gad.schemas.auth import LoginIn, RegisterIn


def test_register_in_valid():
    r = RegisterIn(email="a@b.com", password="12345678", display_name="Ana")
    assert r.email == "a@b.com"


def test_register_in_rejects_short_password():
    with pytest.raises(ValidationError):
        RegisterIn(email="a@b.com", password="123", display_name="Ana")


def test_register_in_rejects_invalid_email():
    with pytest.raises(ValidationError):
        RegisterIn(email="not-an-email", password="12345678", display_name="Ana")


def test_login_in_valid():
    data = LoginIn(email="a@b.com", password="anypassword")
    assert data.email == "a@b.com"
