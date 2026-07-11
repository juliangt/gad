# backend/src/gad/middleware/ip_key.py
"""Resuelve la IP real del cliente para rate limiting tras un reverse proxy.

Lee `X-Forwarded-For` (primer hop = cliente original). Si el header no
existe o está vacío, cae a `request.client.host`. Esto es defensa en
profundidad: complementa el `--proxy-headers` de uvicorn para que el
rate limiting funcione correctamente sin importar cómo llegue la app.
"""
from starlette.requests import Request


def client_ip_key(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if request.client is not None:
        return request.client.host
    return "unknown"
