# backend/tests/test_chat_schemas.py
import pytest
from pydantic import ValidationError

from gad.chat.schemas import MessageIn


def test_message_in_ok():
    m = MessageIn(content="Hola")
    assert m.content == "Hola"


def test_message_in_rejects_empty():
    with pytest.raises(ValidationError):
        MessageIn(content="")


def test_message_in_rejects_too_long():
    with pytest.raises(ValidationError):
        MessageIn(content="x" * 2001)
