from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.models.enums import NotificationType
from gad.notifications.router import router as notif_router
from gad.notifications.service import create_notification
from gad.schemas.auth import RegisterIn
from gad.schemas.pagination import PaginatedOut


class _Item(BaseModel):
    name: str


def test_paginated_out_with_items_and_cursor():
    out = PaginatedOut[_Item](items=[], next_cursor=None)
    assert out.items == []
    assert out.next_cursor is None


def test_paginated_out_serializes_cursor_as_iso():
    ts = datetime(2026, 7, 8, 12, 0, tzinfo=timezone.utc)
    out = PaginatedOut[dict](items=[{"a": 1}], next_cursor=ts.isoformat())
    dumped = out.model_dump()
    assert dumped["next_cursor"] == ts.isoformat()


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session

    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(notif_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_notifications_pagination_returns_cursor(client, db_session):
    from urllib.parse import quote

    tokens = await register(
        db_session,
        RegisterIn(email="n@example.com", password="12345678", display_name="N"),
    )
    # Crear 3 notificaciones (timestamps distintos en microsegundos)
    for _ in range(3):
        await create_notification(db_session, tokens.user_id, NotificationType.match, {})
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        # Pedir 2
        resp = await c.get("/notifications?limit=2", headers=headers)
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["next_cursor"] is not None
        # Pedir la siguiente página (el cursor debe ir url-encoded: el iso
        # trae '+' que sin encodear se interpretaría como espacio).
        resp2 = await c.get(
            f"/notifications?limit=2&before={quote(body['next_cursor'])}",
            headers=headers,
        )
        body2 = resp2.json()
        assert len(body2["items"]) == 1

