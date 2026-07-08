# backend/src/gad/health.py
from fastapi import APIRouter, Response, status
from sqlalchemy import text

from gad.db import engine
from gad.redis_client import redis_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready(response: Response) -> dict[str, str]:
    checks = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return checks
