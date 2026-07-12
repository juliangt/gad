# backend/src/gad/main.py
from contextlib import asynccontextmanager, suppress

from sqlalchemy import select

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.availability.router import router as availability_router
from gad.chat.manager import manager
from gad.chat.router import router as chat_rest_router
from gad.chat.websocket import router as chat_router
from gad.config import settings
from gad.exceptions import GADError
from gad.feature_flags import DEFAULT_FLAGS
from gad.health import router as health_router
from gad.jobs.scheduler import shutdown_scheduler, start_scheduler
from gad.logging_setup import setup_logging
from gad.matching.router import router as matching_router
from gad.middleware.body_size import BodySizeLimitMiddleware
from gad.middleware.metrics import metrics_router
from gad.middleware.request_logging import RequestLoggingMiddleware
from gad.middleware.security_headers import SecurityHeadersMiddleware
from gad.models.settings import (
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
from gad.notifications.push_router import router as push_router
from gad.notifications.router import router as notifications_router
from gad.plans.router import router as plans_router
from gad.redis_client import redis_client
from gad.reports.router import router as reports_router
from gad.reviews.router import router as reviews_router
from gad.safety.public_router import router as safety_public_router
from gad.safety.router import router as safety_router
from gad.users.router import router as users_router
from gad.venues.router import router as venues_router


async def _seed_default_settings(session_factory) -> None:
    """Crea los singletons de settings y los feature flags por defecto si no
    existen. Idempotente. Best-effort: el caller envuelve en suppress(Exception)."""
    async with session_factory() as session:
        if (
            await session.execute(select(UserDefaults).where(UserDefaults.id == 1))
        ).scalar_one_or_none() is None:
            session.add(
                UserDefaults(
                    id=1,
                    default_plan_validity_mins=120,
                    default_search_radius_m=2000,
                    age_range_min=18,
                    age_range_max=99,
                    group_size_preference="either",
                    gender_preference="any",
                    activity_types=["coffee", "drinks", "food", "walk", "park", "event", "other"],
                )
            )

        config = settings
        if (
            await session.execute(
                select(OperationalSettings).where(OperationalSettings.id == 1)
            )
        ).scalar_one_or_none() is None:
            session.add(
                OperationalSettings(
                    id=1,
                    rate_limit_enabled=config.rate_limit_enabled,
                    default_rate_limit=config.default_rate_limit,
                    access_token_expire_minutes=config.access_token_expire_minutes,
                    refresh_token_expire_days=config.refresh_token_expire_days,
                    max_avatar_bytes=config.max_avatar_bytes,
                    ws_max_message_rate=config.ws_max_message_rate,
                )
            )

        if (
            await session.execute(
                select(MaintenanceState).where(MaintenanceState.id == 1)
            )
        ).scalar_one_or_none() is None:
            session.add(
                MaintenanceState(
                    id=1,
                    enabled=False,
                    message="",
                    banner_active=False,
                    banner_message="",
                    banner_level="info",
                )
            )

        existing_flags = {
            f.key
            for f in (
                await session.execute(select(FeatureFlag))
            ).scalars().all()
        }
        for key, description in DEFAULT_FLAGS.items():
            if key not in existing_flags:
                session.add(
                    FeatureFlag(
                        key=key,
                        enabled=(key != "maintenance_block"),
                        description=description,
                    )
                )

        await session.commit()


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
    # Seed best-effort de singletons de settings y feature flags por defecto.
    with suppress(Exception):
        from gad.db import async_session_maker

        await _seed_default_settings(async_session_maker)
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

    # Orden de add_middleware (Starlette prepend): la última línea es la
    # más externa. Queremos: TrustedHost > GZip > BodySize > CORS >
    # SecurityHeaders > RequestLogging > app.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(BodySizeLimitMiddleware, max_body=settings.max_request_body_size)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)

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
    app.include_router(venues_router)
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
