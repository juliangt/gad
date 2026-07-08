# backend/src/gad/reports/schemas.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=1000)


class ReportOut(BaseModel):
    id: UUID
    reporter_id: UUID
    reported_id: UUID
    reason: str
    description: str | None
    status: str
    payload: dict[str, Any] | None
    created_at: datetime
