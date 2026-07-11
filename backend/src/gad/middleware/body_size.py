# backend/src/gad/middleware/body_size.py
"""Rechaza requests cuyo body excede max_body bytes.

Comprueba Content-Length primero (barato); si no viene o es inválido deja
pasar a la app (que valida en el handler, p.ej. upload_avatar). El tope
global protege contra bodies enormes antes de que lleguen a parsearse.
"""
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_body: int):
        super().__init__(app)
        self.max_body = max_body

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > self.max_body:
                    return Response(status_code=413, content="Body too large")
            except ValueError:
                pass
        return await call_next(request)
