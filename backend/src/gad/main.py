# backend/src/gad/main.py
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.availability.router import router as availability_router
from gad.chat.manager import manager
from gad.chat.router import router as chat_rest_router
from gad.chat.websocket import router as chat_router
from gad.config import settings
from gad.exceptions import GADError
from gad.health import router as health_router
from gad.jobs.scheduler import shutdown_scheduler, start_scheduler
from gad.logging_setup import setup_logging
from gad.matching.router import router as matching_router
from gad.middleware.metrics import metrics_router
from gad.middleware.request_logging import RequestLoggingMiddleware
from gad.middleware.security_headers import SecurityHeadersMiddleware
from gad.notifications.push_router import router as push_router
from gad.notifications.router import router as notifications_router
from gad.plans.router import router as plans_router
from gad.redis_client import redis_client
from gad.reports.router import router as reports_router
from gad.reviews.router import router as reviews_router
from gad.safety.public_router import router as safety_public_router
from gad.safety.router import router as safety_router
from gad.users.router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # El ping a Redis es best-effort: si falla (ej. en tests sin Redis),
    # /health/ready lo reportará. No frenamos el arranque.
    with suppress(Exception):
        await redis_client.ping()
    # El scheduler de expiración también es best-effort: en tests/e2e sin
    # infra completa no debe frenar el arranque.
    with suppress(Exception):
        await start_scheduler()
    # El subscriber de chat (Redis pub/sub) también es best-effort.
    with suppress(Exception):
        await manager.start_subscriber()
    yield
    with suppress(Exception):
        await manager.stop_subscriber()
    with suppress(Exception):
        await shutdown_scheduler()
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
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)

    @app.exception_handler(GADError)
    async def gad_error_handler(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    app.include_router(health_router)
    app.include_router(metrics_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(plans_router)
    app.include_router(matching_router)
    app.include_router(chat_router)
    app.include_router(chat_rest_router)
    app.include_router(notifications_router)
    app.include_router(push_router)
    app.include_router(safety_router)
    app.include_router(safety_public_router)
    app.include_router(reviews_router)
    app.include_router(reports_router)
    app.include_router(admin_router)
    app.include_router(availability_router)

    from gad.middleware.rate_limit import setup_rate_limit

    setup_rate_limit(app)

    return app


app = create_app()
