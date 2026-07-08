# backend/tests/test_models.py
from gad.models import (
    ActivityType,
    ApplicationStatus,
    Gender,
    MatchStatus,
    PlanMode,
    PlanStatus,
    VerificationLevel,
)
from gad.models.base import NAMING_CONVENTION


def test_enums_have_expected_values():
    assert ActivityType.coffee.value == "coffee"
    assert PlanMode.now.value == "now"
    assert PlanStatus.open.value == "open"
    assert ApplicationStatus.pending.value == "pending"
    assert MatchStatus.active.value == "active"
    assert Gender.male.value == "male"
    assert VerificationLevel.google.value == "google"


def test_base_metadata_has_naming_convention():
    from gad.models.base import Base

    assert "pk" in NAMING_CONVENTION
    assert Base.metadata.naming_convention is NAMING_CONVENTION
