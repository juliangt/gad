from datetime import datetime
from uuid import uuid4

from gad.admin.settings_schemas import (
    AuditEventOut,
    FeatureFlagOut,
    MaintenanceIn,
    MaintenanceOut,
    OperationalSettingsOut,
    UserDefaultsIn,
    UserDefaultsOut,
)


def test_user_defaults_in_validates():
    data = UserDefaultsIn(
        default_plan_validity_mins=90,
        default_search_radius_m=1500,
        age_range_min=18,
        age_range_max=65,
        group_size_preference="either",
        gender_preference="any",
        activity_types=["coffee"],
    )
    assert data.default_plan_validity_mins == 90


def test_user_defaults_in_rejects_negative_validity():
    import pytest

    with pytest.raises(ValueError):
        UserDefaultsIn(
            default_plan_validity_mins=0,
            default_search_radius_m=1500,
            age_range_min=18,
            age_range_max=65,
            group_size_preference="either",
            gender_preference="any",
            activity_types=["coffee"],
        )


def test_operational_out_serializes():
    out = OperationalSettingsOut(
        rate_limit_enabled=True,
        default_rate_limit="300/minute",
        access_token_expire_minutes=15,
        refresh_token_expire_days=7,
        max_avatar_bytes=5242880,
        ws_max_message_rate=5,
    )
    assert out.access_token_expire_minutes == 15


def test_maintenance_in_validates_banner_level():
    m = MaintenanceIn(
        enabled=True,
        message="mantenimiento",
        banner_active=False,
        banner_message="",
        banner_level="warning",
    )
    assert m.banner_level == "warning"


def test_maintenance_in_rejects_invalid_level():
    import pytest

    with pytest.raises(ValueError):
        MaintenanceIn(
            enabled=True,
            message="",
            banner_active=False,
            banner_message="",
            banner_level="critical",
        )


def test_audit_event_out_serializes():
    out = AuditEventOut(
        id=uuid4(),
        actor_id=uuid4(),
        action="settings.update",
        target_type="settings",
        target_id="operational",
        detail={"x": 1},
        created_at=datetime.utcnow(),
    )
    assert out.action == "settings.update"
