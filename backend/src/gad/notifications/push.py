# backend/src/gad/notifications/push.py
"""Web Push con VAPID.

Generar claves una vez:
    python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); \
v.save_key('vapid_private.pem'); v.save_public_key('vapid_public.pem')"
"""
import json
import os

from pywebpush import webpush

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS = {"sub": "mailto:dev@gad.local"}


def send_push(subscription: dict, payload: dict, private_key: str | None = None) -> None:
    key = private_key or VAPID_PRIVATE_KEY
    if not key:
        return  # No-op si no hay clave configurada (dev)
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=key,
        vapid_claims=VAPID_CLAIMS,
    )
