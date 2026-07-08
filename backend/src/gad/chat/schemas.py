# backend/src/gad/chat/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    id: UUID
    match_id: UUID
    sender_id: UUID
    content: str
    created_at: datetime
    read_at: datetime | None


class TypingEvent(BaseModel):
    type: str = "typing"
    user_id: UUID
    is_typing: bool


class SystemEvent(BaseModel):
    type: str = "system"
    content: str
