# backend/tests/test_db_session.py
import types

from gad.db import get_session


def test_get_session_is_async_generator():
    gen = get_session()
    assert isinstance(gen, types.AsyncGeneratorType)
