# backend/tests/test_safety_schemas.py
import pytest
from pydantic import ValidationError

from gad.models.enums import ContactType
from gad.safety.schemas import PingIn, TrustedContactIn


def test_trusted_contact_ok():
    c = TrustedContactIn(
        contact_type=ContactType.email, contact_value="mom@example.com", label="Mom"
    )
    assert c.contact_type == ContactType.email


def test_ping_rejects_bad_lat():
    with pytest.raises(ValidationError):
        PingIn(lat=95, lng=0)


def test_trusted_contact_label_required():
    with pytest.raises(ValidationError):
        TrustedContactIn(contact_type=ContactType.phone, contact_value="+1234", label="")
