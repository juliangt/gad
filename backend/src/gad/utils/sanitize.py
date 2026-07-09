"""Sanitización básica de texto de usuario (chat, bio, etc.).

No es un sanitizer HTML completo: la política es rechazar todo HTML y
dejar sólo texto plano. El frontend puede renderizar con escapes.
"""
import re

_TAG_RE = re.compile(r"<[^>]*>")
_WS_RE = re.compile(r"\s+")


def sanitize_text(text: str, *, max_length: int = 2000) -> str:
    cleaned = _TAG_RE.sub("", text)
    cleaned = _WS_RE.sub(" ", cleaned).strip()
    return cleaned[:max_length]
