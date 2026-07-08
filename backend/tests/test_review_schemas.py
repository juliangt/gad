# backend/tests/test_review_schemas.py
import uuid

import pytest
from pydantic import ValidationError

from gad.reviews.schemas import ReviewIn


def test_review_in_ok():
    r = ReviewIn(
        match_id=uuid.uuid4(), reviewee_id=uuid.uuid4(), rating=5,
    )
    assert r.rating == 5


def test_review_in_rejects_rating_out_of_range():
    with pytest.raises(ValidationError):
        ReviewIn(match_id=uuid.uuid4(), reviewee_id=uuid.uuid4(), rating=0)
    with pytest.raises(ValidationError):
        ReviewIn(match_id=uuid.uuid4(), reviewee_id=uuid.uuid4(), rating=6)
