import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.models.enums import UserStatus
from gad.models.user import User
from gad.schemas.auth import RegisterIn
from gad.users.router import router as users_router


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
    app.include_router(users_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_delete_account_soft_deletes_and_anonymizes(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="bye@example.com", password="12345678", display_name="Bye"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete("/me", headers=headers)
        assert resp.status_code == 204
        # El token queda inválido (usuario no activo)
        resp_me = await c.get("/me", headers=headers)
        assert resp_me.status_code == 401
    # El email fue anonimizado y el status = deleted
    result = await db_session.execute(select(User).where(User.id == tokens.user_id))
    user = result.scalar_one()
    assert user.status == UserStatus.deleted
    assert user.email != "bye@example.com"
    assert user.password_hash is None
