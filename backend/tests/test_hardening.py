# backend/tests/test_hardening.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.security_headers import SecurityHeadersMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/x")
    async def x():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_csp_header_present(client):
    async with client as c:
        resp = await c.get("/x")
    assert "content-security-policy" in {k.lower() for k in resp.headers}
    assert "default-src 'self'" in resp.headers["content-security-policy"]


from gad.utils.sanitize import sanitize_text  # noqa: E402


def test_sanitize_text_strips_html_tags():
    # Las etiquetas se eliminan (no se ejecuta el script); el texto entre
    # etiquetas se conserva como texto plano (política: rechazar HTML, no
    # censurar contenido).
    assert sanitize_text("<script>alert(1)</script>hola") == "alert(1)hola"
    assert "<" not in sanitize_text("<b>bold</b><img src=x>")


def test_sanitize_text_preserves_plain_text():
    assert sanitize_text("hola, ¿vamos a tomar un café?") == "hola, ¿vamos a tomar un café?"


def test_sanitize_text_collapses_whitespace():
    assert sanitize_text("hola   mundo\n\n\n") == "hola mundo"


import time  # noqa: E402

from gad.auth.service import login  # noqa: E402
from gad.exceptions import InvalidCredentialsError  # noqa: E402
from gad.schemas.auth import LoginIn  # noqa: E402


@pytest.mark.asyncio
async def test_login_timing_runs_dummy_hash_for_unknown_user(db_session):
    """El login a usuario inexistente ejecuta el hash dummy (timing-safe).

    No asertamos valores exactos (frágil en CI), sólo que no truena de forma
    distinta y que consume tiempo (el verify_password dummy corre).
    """
    t1 = time.perf_counter()
    with pytest.raises(InvalidCredentialsError):
        await login(db_session, LoginIn(email="nope@nope.com", password="12345678"))
    elapsed = time.perf_counter() - t1
    # verify_password (argon2) toma del orden de decenas de ms; si el dummy
    # no corriera, sería ~instantáneo. Umbral bajo para no ser frágil.
    assert elapsed > 0.005
