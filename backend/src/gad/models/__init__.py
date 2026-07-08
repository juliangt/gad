# backend/src/gad/models/__init__.py
from gad.models.base import Base, TimestampMixin
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    ContactType,
    Gender,
    GenderPreference,
    GroupSizePreference,
    MatchRole,
    MatchStatus,
    NotificationType,
    PlanMode,
    PlanStatus,
    ReviewFlag,
    SafetyEventType,
    VerificationLevel,
)

__all__ = [
    "Base",
    "TimestampMixin",
    "ActivityType",
    "ApplicationStatus",
    "ContactType",
    "Gender",
    "GenderPreference",
    "GroupSizePreference",
    "MatchRole",
    "MatchStatus",
    "NotificationType",
    "PlanMode",
    "PlanStatus",
    "ReviewFlag",
    "SafetyEventType",
    "VerificationLevel",
    "User",
    "UserPreferences",
]


from gad.models.user import User, UserPreferences  # noqa: E402, F401
