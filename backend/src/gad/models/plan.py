# backend/src/gad/models/plan.py
from datetime import datetime
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    PlanMode,
    PlanStatus,
)


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    host_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activitytype"), nullable=False
    )
    mode: Mapped[PlanMode] = mapped_column(Enum(PlanMode, name="planmode"), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    window_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    max_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_label: Mapped[str] = mapped_column(String(200), nullable=False)
    location_grid: Mapped[object] = mapped_column(
        Geography("POINT", srid=4326), nullable=False
    )
    exact_location: Mapped[object | None] = mapped_column(
        Geography("POINT", srid=4326), nullable=True
    )
    search_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="planstatus"), nullable=False, default=PlanStatus.open
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class PlanApplication(Base, TimestampMixin):
    __tablename__ = "plan_applications"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    applicant_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="applicationstatus"),
        nullable=False,
        default=ApplicationStatus.pending,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("plan_id", "applicant_id", name="uq_plan_applications_plan_applicant"),
    )
