# backend/src/gad/admin/schemas.py
from pydantic import BaseModel


class AdminStatsOut(BaseModel):
    total_users: int
    total_plans: int
    total_matches: int
    open_reports: int


class ReportStatusUpdate(BaseModel):
    status: str
