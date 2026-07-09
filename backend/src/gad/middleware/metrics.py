"""Métricas Prometheus para el monolito GAD."""
from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUEST_COUNT = Counter(
    "gad_http_requests_total",
    "Total de requests HTTP",
    ["method", "path", "status"],
)
REQUEST_DURATION = Histogram(
    "gad_http_request_duration_seconds",
    "Duración de requests HTTP en segundos",
    ["method", "path"],
)
AUTH_EVENTS = Counter(
    "gad_auth_events_total",
    "Eventos de autenticación",
    ["event", "outcome"],
)

metrics_router = APIRouter(tags=["metrics"])


@metrics_router.get("/metrics")
async def metrics_endpoint() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


def record_request(method: str, path: str, status: int, duration_s: float) -> None:
    REQUEST_COUNT.labels(method=method, path=path, status=str(status)).inc()
    REQUEST_DURATION.labels(method=method, path=path).observe(duration_s)


def record_auth_event(event: str, outcome: str) -> None:
    AUTH_EVENTS.labels(event=event, outcome=outcome).inc()
