# backend/src/gad/models/enums.py
import enum


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    nonbinary = "nonbinary"
    undisclosed = "undisclosed"


class VerificationLevel(str, enum.Enum):
    none = "none"
    email = "email"
    google = "google"


class GroupSizePreference(str, enum.Enum):
    one_on_one = "one_on_one"
    small_group = "small_group"
    either = "either"


class GenderPreference(str, enum.Enum):
    any_ = "any"
    same = "same"
    mixed = "mixed"
    specific = "specific"


class ActivityType(str, enum.Enum):
    coffee = "coffee"
    drinks = "drinks"
    food = "food"
    walk = "walk"
    park = "park"
    event = "event"
    other = "other"


class PlanMode(str, enum.Enum):
    now = "now"
    scheduled = "scheduled"


class PlanStatus(str, enum.Enum):
    open = "open"
    matched = "matched"
    closed = "closed"
    cancelled = "cancelled"
    expired = "expired"


class ApplicationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"


class MatchStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class MatchRole(str, enum.Enum):
    host = "host"
    participant = "participant"


class SafetyEventType(str, enum.Enum):
    sos = "sos"
    location_shared = "location_shared"
    contact_notified = "contact_notified"


class ContactType(str, enum.Enum):
    email = "email"
    phone = "phone"


class NotificationType(str, enum.Enum):
    new_application = "new_application"
    match = "match"
    new_message = "new_message"
    safety = "safety"
    review = "review"
    plan_alert = "plan_alert"


class ReviewFlag(str, enum.Enum):
    no_show = "no_show"
    inappropriate = "inappropriate"
    false_info = "false_info"


class UserStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    deleted = "deleted"
