# backend/tests/test_availability_schemas.py
import pytest
from pydantic import ValidationError

from gad.availability.schemas import AvailabilityIn, AvailabilityLocationIn


def test_availability_in_defaults():
    a = AvailabilityIn(location=AvailabilityLocationIn(lat=-34.5, lng=-58.4))
    assert a.radius_m == 2000


def test_availability_rejects_bad_coords():
    with pytest.raises(ValidationError):
        AvailabilityLocationIn(lat=95, lng=0)
