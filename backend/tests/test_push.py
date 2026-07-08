# backend/tests/test_push.py
from gad.notifications.push import send_push


def test_send_push_noop_without_key():
    """Sin VAPID_PRIVATE_KEY configurada, send_push no falla."""
    send_push({}, {"x": 1}, private_key="")  # no-op


def test_send_push_returns_none_on_invalid_subscription():
    # Sin clave, es no-op
    assert send_push({}, {"x": 1}, private_key="") is None
