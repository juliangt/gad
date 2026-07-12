# backend/src/gad/admin/plans_schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import ActivityType, PlanMode, PlanStatus


class AdminPlanListItem(BaseModel):
    """Ítem del listado admin (ligero)."""

    id: UUID
    title: str
    activity_type: ActivityType
    status: PlanStatus
    mode: PlanMode
    host_id: UUID
    host_name: str
    current_participants: int
    max_participants: int
    created_at: datetime
    expires_at: datetime
    hidden_by_host: bool


class AdminPlanOut(BaseModel):
    """Detalle admin de un plan: host sin anonimizar + ubicación del grid."""

    id: UUID
    title: str
    activity_type: ActivityType
    status: PlanStatus
    mode: PlanMode
    scheduled_at: datetime | None
    window_minutes: int
    max_participants: int
    current_participants: int
    description: str | None
    location_label: str
    location_lat: float
    location_lng: float
    search_radius_m: int
    expires_at: datetime
    created_at: datetime
    hidden_by_host: bool
    host_id: UUID
    host_email: str
    host_name: str
