# backend/tests/test_reputation.py
from datetime import UTC, datetime, timedelta

from gad.models.enums import ReviewFlag
from gad.reviews.reputation import calculate_reputation


class FakeReview:
    def __init__(self, rating, flag=None, days_ago=0):
        self.rating = rating
        self.flag = flag
        self.created_at = datetime.now(UTC) - timedelta(days=days_ago)


def test_empty_returns_zero():
    assert calculate_reputation([]) == 0.0


def test_single_review_returns_rating():
    r = FakeReview(rating=4)
    assert calculate_reputation([r]) == 4.0


def test_multiple_reviews_weighted():
    # Reseñas: 5 (hoy, peso 3), 4 (1 día, peso 2), 3 (2 días, peso 1)
    reviews = [
        FakeReview(5, days_ago=0),
        FakeReview(4, days_ago=1),
        FakeReview(3, days_ago=2),
    ]
    # (5*3 + 4*2 + 3*1) / 6 = (15+8+3)/6 = 26/6 = 4.33
    assert calculate_reputation(reviews) == 4.33


def test_no_show_penalized():
    r = FakeReview(rating=4, flag=ReviewFlag.no_show)
    # 4 - 1 = 3
    assert calculate_reputation([r]) == 3.0


def test_more_than_window_caps_to_20():
    reviews = [FakeReview(rating=5, days_ago=i) for i in range(30)]
    score = calculate_reputation(reviews)
    assert 0 <= score <= 5
