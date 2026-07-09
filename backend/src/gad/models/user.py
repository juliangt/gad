# backend/src/gad/models/user.py
from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    Gender,
    GenderPreference,
    GroupSizePreference,
    UserStatus,
    VerificationLevel,
)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[Gender] = mapped_column(
        Enum(Gender, name="gender"), nullable=False, default=Gender.undisclosed
    )
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="es-AR")
    timezone: Mapped[str] = mapped_column(
        String(50), nullable=False, default="America/Argentina/Buenos_Aires"
    )
    reputation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    verification_level: Mapped[VerificationLevel] = mapped_column(
        Enum(VerificationLevel, name="verificationlevel"),
        nullable=False,
        default=VerificationLevel.none,
    )
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="userstatus"),
        nullable=False,
        default=UserStatus.active,
        server_default="active",
    )
    last_active_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    preferences: Mapped["UserPreferences"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserPreferences(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    default_search_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    activity_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    group_size_preference: Mapped[GroupSizePreference] = mapped_column(
        Enum(GroupSizePreference, name="groupsizepreference"),
        nullable=False,
        default=GroupSizePreference.either,
    )
    age_range_min: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    age_range_max: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    gender_preference: Mapped[GenderPreference] = mapped_column(
        Enum(GenderPreference, name="genderpreference"),
        nullable=False,
        default=GenderPreference.any_,
    )
    notify_new_plans: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_messages: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_pending_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped["User"] = relationship(back_populates="preferences")
