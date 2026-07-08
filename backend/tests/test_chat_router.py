# backend/tests/test_chat_router.py
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.chat.router import router as chat_router
from gad.db import get_session


@pytest.fixture
def app(db_engine):
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    from gad.exceptions import GADError

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(chat_router)

    @app.exception_handler(GADError)
    async def gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    app.state.test_session_maker = test_session_maker
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_history_requires_auth(client):
    async with client as c:
        resp = await c.get(f"/matches/{uuid.uuid4()}/messages")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_history_and_mark_read_flow(app, client):
    from gad.auth.service import register
    from gad.matching.schemas import ApplicationIn
    from gad.matching.service import accept_application, apply_to_plan
    from gad.models.enums import ActivityType, PlanMode
    from gad.models.user import User
    from gad.plans.schemas import PlanIn, PlanLocationIn
    from gad.plans.service import create_plan
    from gad.schemas.auth import RegisterIn

    test_session_maker: async_sessionmaker = app.state.test_session_maker
    async with test_session_maker() as session:
        host_t = await register(
            session, RegisterIn(email="ch@example.com", password="12345678", display_name="H")
        )
        app_t = await register(
            session, RegisterIn(email="ca@example.com", password="12345678", display_name="A")
        )
        host = (
            await session.execute(select(User).where(User.id == host_t.user_id))
        ).scalar_one()
        applicant = (
            await session.execute(select(User).where(User.id == app_t.user_id))
        ).scalar_one()
        plan = await create_plan(
            session, host,
            PlanIn(
                activity_type=ActivityType.coffee, mode=PlanMode.now, title="X",
                max_participants=1,
                location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X"),
            ),
        )
        application = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
        match = await accept_application(session, host, application.id)

        # Host envía un mensaje directamente vía servicio
        from gad.chat.service import send_message

        await send_message(session, host, match.id, "hola desde host")
        match_id = match.id

    async with client as c:
        # Applicant se loguea
        resp = await c.post(
            "/auth/login",
            json={"email": "ca@example.com", "password": "12345678"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Historial
        resp = await c.get(f"/matches/{match_id}/messages", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["content"] == "hola desde host"

        # Mark read
        resp = await c.post(f"/matches/{match_id}/read", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["read"] == 1
