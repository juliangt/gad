# backend/src/gad/schemas/block.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BlockOut(BaseModel):
    blocked_id: UUID
    created_at: datetime
