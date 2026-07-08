# backend/tests/test_plan_schemas.py
import pytest
from pydantic import ValidationError

from gad.models.enums import ActivityType, PlanMode
from gad.plans.schemas import PlanIn, PlanLocationIn


def _loc():
    return PlanLocationIn(lat=-34.59, lng=-58.43, label="Palermo")


def test_plan_in_now_mode_ok():
    p = PlanIn(
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Café",
        location=_loc(),
    )
    assert p.window_minutes == 120


def test_plan_in_scheduled_requires_scheduled_at():
    with pytest.raises(ValidationError):
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.scheduled,
            title="Café",
            location=_loc(),
        )


def test_plan_in_rejects_window_too_short():
    with pytest.raises(ValidationError):
        PlanIn(
            activity_type=ActivityType.coffee,
            mode=PlanMode.now,
            title="Café",
            window_minutes=5,
            location=_loc(),
        )


def test_plan_location_rejects_bad_lat():
    with pytest.raises(ValidationError):
        PlanLocationIn(lat=95, lng=0, label="X")
