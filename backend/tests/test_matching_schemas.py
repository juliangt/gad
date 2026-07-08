# backend/tests/test_matching_schemas.py
import pytest
from pydantic import ValidationError

from gad.matching.schemas import ApplicationIn


def test_application_in_message_optional():
    a = ApplicationIn()
    assert a.message is None


def test_application_in_message_max_length():
    with pytest.raises(ValidationError):
        ApplicationIn(message="x" * 501)
