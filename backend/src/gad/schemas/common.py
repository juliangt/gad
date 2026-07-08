# backend/src/gad/schemas/common.py
from pydantic import BaseModel


class ErrorOut(BaseModel):
    detail: str
    code: str | None = None


class OKMessage(BaseModel):
    message: str
