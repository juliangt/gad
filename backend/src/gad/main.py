# backend/src/gad/main.py
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gad.auth.router import router as auth_router
from gad.config import settings
from gad.exceptions import GADError
from gad.health import router as health_router
from gad.logging_setup import setup_logging
from gad.redis_client import redis_client
from gad.users.router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # El ping a Redis es best-effort: si falla (ej. en tests sin Redis),
    # /health/ready lo reportará. No frenamos el arranque.
    with suppress(Exception):
        await redis_client.ping()
    yield
    with suppress(Exception):
        await redis_client.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(GADError)
    async def gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(users_router)

    from gad.middleware.rate_limit import setup_rate_limit

    setup_rate_limit(app)

    return app


app = create_app()
