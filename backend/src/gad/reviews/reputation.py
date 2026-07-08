# backend/src/gad/reviews/reputation.py
"""Algoritmo de reputación.

Promedio ponderado de las últimas N reseñas. Las reseñas más recientes pesan más
(decaimiento lineal). Las reseñas con flag=no_show aplican una penalización de
1 estrella adicional.
"""
from datetime import UTC, datetime

from gad.models.enums import ReviewFlag
from gad.models.review import Review

REVIEW_WINDOW = 20  # últimas N reseñas
NO_SHOW_PENALTY = 1.0  # estrellas


def calculate_reputation(reviews: list[Review], now: datetime | None = None) -> float:
    """Calcula score 0-5 basado en las últimas N reseñas."""
    if not reviews:
        return 0.0

    now = now or datetime.now(UTC)
    recent = sorted(reviews, key=lambda r: r.created_at, reverse=True)[:REVIEW_WINDOW]

    total_weight = 0.0
    weighted_sum = 0.0

    # La más reciente tiene peso N, la más vieja peso 1
    n = len(recent)
    for i, review in enumerate(recent):
        weight = n - i  # más reciente → mayor peso

        rating = review.rating
        if review.flag == ReviewFlag.no_show:
            rating = max(0, rating - NO_SHOW_PENALTY)

        weighted_sum += rating * weight
        total_weight += weight

    return round(weighted_sum / total_weight if total_weight else 0.0, 2)
