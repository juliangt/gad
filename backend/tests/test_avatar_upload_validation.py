import io

import pytest
from PIL import Image

from gad.config import settings


def _jpeg_bytes(size=(100, 100), color="red") -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _png_bytes(size=(100, 100)) -> bytes:
    img = Image.new("RGB", size, "blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class FakeUpload:
    """Simula fastapi.UploadFile mínimo para upload_avatar.

    read(size) avanza un cursor interno como un stream real.
    """

    def __init__(self, data: bytes, content_type: str = "image/jpeg"):
        self._data = data
        self._pos = 0
        self.content_type = content_type

    async def read(self, size: int = -1) -> bytes:
        if size == -1:
            chunk = self._data[self._pos :]
            self._pos = len(self._data)
            return chunk
        chunk = self._data[self._pos : self._pos + size]
        self._pos += len(chunk)
        return chunk

    async def seek(self, offset: int) -> None:
        self._pos = offset


@pytest.mark.asyncio
async def test_rejects_oversized_upload(db_session):
    from gad.exceptions import ValidationError
    from gad.users.service import upload_avatar

    big = b"\xff\xd8\xff" + b"x" * (settings.max_avatar_bytes + 1)

    with pytest.raises(ValidationError):
        await upload_avatar(db_session, object(), FakeUpload(big, "image/jpeg"))


@pytest.mark.asyncio
async def test_rejects_unsupported_content_type(db_session):
    from gad.exceptions import ValidationError
    from gad.users.service import ALLOWED_AVATAR_TYPES, upload_avatar

    assert "image/jpeg" in ALLOWED_AVATAR_TYPES

    data = _jpeg_bytes()
    with pytest.raises(ValidationError):
        await upload_avatar(
            db_session, object(), FakeUpload(data, content_type="application/pdf")
        )


@pytest.mark.asyncio
async def test_rejects_non_image_bytes(db_session):
    from gad.exceptions import ValidationError
    from gad.users.service import upload_avatar

    with pytest.raises(ValidationError):
        await upload_avatar(
            db_session, object(), FakeUpload(b"not an image at all!!!", "image/jpeg")
        )


class FakeStorage:
    def avatar_path(self, *a):
        return "x.jpg"

    async def save(self, *a, **kw):
        return "http://fake/x.jpg"


class FakeUser:
    id = "00000000-0000-0000-0000-000000000001"
    avatar_url = None


class FakeSession:
    """Sesión mínima para tests de upload: commit/refresh son no-ops."""

    async def commit(self):
        pass

    async def refresh(self, *a, **kw):
        pass


@pytest.mark.asyncio
async def test_accepts_valid_jpeg(monkeypatch):
    """Un JPEG válido pasa la validación (storage mockeado)."""
    from gad.users.service import upload_avatar

    monkeypatch.setattr("gad.users.service.get_storage", lambda: FakeStorage())
    url = await upload_avatar(
        FakeSession(), FakeUser(), FakeUpload(_jpeg_bytes(), "image/jpeg")
    )
    assert url == "http://fake/x.jpg"


@pytest.mark.asyncio
async def test_accepts_valid_png(monkeypatch):
    from gad.users.service import upload_avatar

    monkeypatch.setattr("gad.users.service.get_storage", lambda: FakeStorage())
    url = await upload_avatar(
        FakeSession(), FakeUser(), FakeUpload(_png_bytes(), "image/png")
    )
    assert url == "http://fake/x.jpg"


@pytest.mark.asyncio
async def test_rejects_magic_bytes_mismatch(db_session):
    """Content-Type dice image/jpeg pero los bytes no son JPEG."""
    from gad.exceptions import ValidationError
    from gad.users.service import upload_avatar

    # PNG bytes con content-type jpeg
    with pytest.raises(ValidationError):
        await upload_avatar(
            db_session, object(), FakeUpload(_png_bytes(), "image/jpeg")
        )
