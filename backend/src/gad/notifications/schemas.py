# backend/src/gad/notifications/schemas.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import NotificationType


class NotificationOut(BaseModel):
    id: UUID
    type: NotificationType
    payload: dict[str, Any] | None
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
