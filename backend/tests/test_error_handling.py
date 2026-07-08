# backend/tests/test_error_handling.py
from gad.exceptions import (
    AuthError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    NotFoundError,
)


def test_exception_status_codes():
    assert InvalidCredentialsError().status_code == 401
    assert EmailAlreadyExistsError().status_code == 409
    assert NotFoundError().status_code == 404


def test_exception_detail_defaults_to_code_name():
    e = InvalidCredentialsError()
    assert e.detail == "InvalidCredentialsError"


def test_exception_custom_detail():
    e = NotFoundError("Plan no encontrado")
    assert e.detail == "Plan no encontrado"


def test_auth_error_is_gad_error():
    assert issubclass(InvalidCredentialsError, AuthError)
