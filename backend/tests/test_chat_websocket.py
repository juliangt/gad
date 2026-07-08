# backend/tests/test_chat_websocket.py
"""Tests del WebSocket de chat.

Cubren los caminos de rechazo (sin token, inválido) que no requieren DB.
El flujo completo de envío de mensaje se cubre en el smoke test de Fase 3.
"""
import uuid

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from gad.chat.manager import ConnectionManager
from gad.main import create_app


@pytest.fixture
def app():
    app = create_app()
    # Manager local sin Redis real: publicar es best-effort.
    app.state.chat_manager = ConnectionManager()
    return app


def test_websocket_rejects_without_token(app):
    client = TestClient(app)
    # Sin token, FastAPI rechaza la conexión (query param requerido).
    with (
        pytest.raises(WebSocketDisconnect) as exc_info,
        client.websocket_connect(f"/chat/{uuid.uuid4()}"),
    ):
        pass
    assert exc_info.value.code == 1008


def test_websocket_rejects_invalid_token(app):
    client = TestClient(app)
    with (
        pytest.raises(WebSocketDisconnect) as exc_info,
        client.websocket_connect(f"/chat/{uuid.uuid4()}?token=invalid"),
    ):
        pass
    assert exc_info.value.code == 4401
