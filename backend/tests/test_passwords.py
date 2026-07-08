# backend/tests/test_passwords.py
from gad.auth.passwords import hash_password, verify_password


def test_hash_password_returns_string():
    h = hash_password("mysecret123")
    assert isinstance(h, str)
    assert h != "mysecret123"


def test_verify_password_correct():
    h = hash_password("mysecret123")
    assert verify_password("mysecret123", h) is True


def test_verify_password_wrong():
    h = hash_password("mysecret123")
    assert verify_password("wrong", h) is False


def test_hashed_passwords_differ_for_same_input():
    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2
