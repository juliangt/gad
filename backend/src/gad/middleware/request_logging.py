"""Middleware: loguea cada request (estructurado) y registra métricas."""
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from gad.middleware.metrics import record_request

logger = structlog.get_logger().bind(component="http")

# Paths que no generan ruido (health checks, scraping de métricas).
_QUIET_PATHS = {"/health", "/health/ready", "/metrics"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start

        path = request.url.path
        method = request.method
        status = response.status_code

        record_request(method, path, status, duration)

        if path not in _QUIET_PATHS:
            logger.info(
                "request",
                method=method,
                path=path,
                status=status,
                duration_ms=round(duration * 1000, 2),
            )
        return response
