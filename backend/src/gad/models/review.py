# backend/src/gad/models/review.py
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import ReviewFlag


class Review(Base, TimestampMixin):
    __tablename__ = "reviews"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewer_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewee_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    flag: Mapped[ReviewFlag | None] = mapped_column(
        Enum(ReviewFlag, name="reviewflag"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "match_id", "reviewer_id", "reviewee_id", name="uq_reviews_match_reviewer_reviewee"
        ),
        CheckConstraint("rating >= 1 AND rating <= 5", name="rating_between_1_and_5"),
    )
