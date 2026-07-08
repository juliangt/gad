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


def test_user_table_columns():
    from gad.models import User

    cols = {c.name for c in User.__table__.columns}
    expected = {
        "id", "email", "password_hash", "google_id", "display_name",
        "avatar_url", "bio", "birth_date", "gender", "locale", "timezone",
        "reputation_score", "verification_level", "last_active_at",
        "created_at", "updated_at",
    }
    assert expected.issubset(cols)


def test_user_preferences_has_correct_pk():
    from gad.models import UserPreferences

    cols = {c.name: c for c in UserPreferences.__table__.columns}
    assert cols["user_id"].primary_key is True
    assert len(cols["user_id"].foreign_keys) == 1


def test_user_has_is_admin():
    from gad.models import User

    assert "is_admin" in {c.name for c in User.__table__.columns}


def test_report_table_exists():
    from gad.models import Report

    expected = {
        "id", "reporter_id", "reported_id", "reason", "description",
        "status", "payload", "created_at", "updated_at",
    }
    actual = {c.name for c in Report.__table__.columns}
    assert expected.issubset(actual)


def test_all_expected_tables_exist():
    from gad.models import Base

    expected = {
        "users", "user_preferences", "plans", "plan_applications",
        "matches", "match_participants", "messages", "reviews",
        "availability", "trusted_contacts", "safety_sessions",
        "safety_events", "blocks", "notifications", "push_subscriptions",
        "reports",
    }
    actual = set(Base.metadata.tables.keys())
    missing = expected - actual
    assert not missing, f"Faltan tablas: {missing}"
