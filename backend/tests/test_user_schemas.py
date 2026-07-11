# backend/tests/test_user_schemas.py
import pytest
from pydantic import ValidationError

from gad.schemas.user import PreferencesIn, UserUpdateIn


def test_preferences_in_defaults():
    p = PreferencesIn()
    assert p.default_search_radius_m == 2000
    assert p.default_plan_validity_mins == 120
    assert p.age_range_min == 18


def test_preferences_in_rejects_radius_below_min():
    with pytest.raises(ValidationError):
        PreferencesIn(default_search_radius_m=50)


def test_preferences_in_rejects_invalid_validity():
    with pytest.raises(ValidationError):
        PreferencesIn(default_plan_validity_mins=-1)
    with pytest.raises(ValidationError):
        PreferencesIn(default_plan_validity_mins=1441)


def test_user_update_all_optional():
    u = UserUpdateIn()
    assert u.display_name is None
