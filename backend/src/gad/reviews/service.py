# backend/src/gad/reviews/service.py
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.models.enums import MatchStatus
from gad.models.match import Match, MatchParticipant
from gad.models.review import Review
from gad.models.user import User
from gad.reviews.reputation import calculate_reputation
from gad.reviews.schemas import ReviewIn

REVIEW_WINDOW_DAYS = 7


async def _verify_can_review(
    session: AsyncSession,
    reviewer: User,
    match_id: UUID,
    reviewee_id: UUID,
) -> Match:
    # Match existe y está completed
    result = await session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise NotFoundError("Match no encontrado")
    if match.status != MatchStatus.completed:
        raise ValidationError("El match no está completado")

    # Ambos son participantes
    for uid in (reviewer.id, reviewee_id):
        is_p = await session.execute(
            select(MatchParticipant).where(
                MatchParticipant.match_id == match_id,
                MatchParticipant.user_id == uid,
            )
        )
        if is_p.scalar_one_or_none() is None:
            raise ValidationError("Ambos deben ser participantes del match")

    # Dentro de ventana de 7 días desde ended_at
    if match.ended_at is None:
        raise ValidationError("El match no tiene fecha de finalización")
    if datetime.now(UTC) - match.ended_at > timedelta(days=REVIEW_WINDOW_DAYS):
        raise ValidationError("La ventana de reseña de 7 días expiró")

    # No reseñó ya
    existing = await session.execute(
        select(Review).where(
            Review.match_id == match_id,
            Review.reviewer_id == reviewer.id,
            Review.reviewee_id == reviewee_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Ya reseñaste a esta persona en este match")

    return match


async def create_review(
    session: AsyncSession, reviewer: User, data: ReviewIn
) -> Review:
    if reviewer.id == data.reviewee_id:
        raise ValidationError("No podés reseñarte a vos mismo")

    await _verify_can_review(session, reviewer, data.match_id, data.reviewee_id)

    review = Review(
        match_id=data.match_id,
        reviewer_id=reviewer.id,
        reviewee_id=data.reviewee_id,
        rating=data.rating,
        comment=data.comment,
        flag=data.flag,
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)

    # Recalcular reputación del reviewee
    await recalc_reputation(session, data.reviewee_id)
    return review


async def recalc_reputation(session: AsyncSession, user_id: UUID) -> float:
    result = await session.execute(
        select(Review).where(Review.reviewee_id == user_id)
    )
    reviews = list(result.scalars().all())
    score = calculate_reputation(reviews)

    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is not None:
        user.reputation_score = score
        await session.commit()
    return score


async def list_reviews_for_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Review]:
    stmt = (
        select(Review)
        .where(Review.reviewee_id == user_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Review.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_review(session: AsyncSession, reviewer: User, review_id: UUID) -> UUID:
    result = await session.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if review is None:
        raise NotFoundError("Reseña no encontrada")
    if review.reviewer_id != reviewer.id:
        raise ValidationError("Solo podés borrar tus propias reseñas")
    reviewee_id = review.reviewee_id
    await session.delete(review)
    await session.commit()
    # Recalcular reputación del reviewee tras el borrado
    await recalc_reputation(session, reviewee_id)
    return reviewee_id
