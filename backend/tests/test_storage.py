# backend/tests/test_storage.py
import pytest

from gad.storage import get_storage, set_storage
from gad.storage.local import LocalFilesystemBackend


@pytest.fixture
def storage(tmp_path):
    backend = LocalFilesystemBackend(base_dir=tmp_path, base_url="/media")
    set_storage(backend)
    yield backend
    set_storage(LocalFilesystemBackend())


@pytest.mark.asyncio
async def test_save_returns_url_and_read_returns_bytes(storage):
    url = await storage.save("avatars/u1/abc.jpg", b"imgbytes", "image/jpeg")
    assert url == "/media/avatars/u1/abc.jpg"
    data = await storage.read("avatars/u1/abc.jpg")
    assert data == b"imgbytes"


@pytest.mark.asyncio
async def test_delete_removes_file(storage):
    await storage.save("x.txt", b"x", "text/plain")
    await storage.delete("x.txt")

    with pytest.raises(FileNotFoundError):
        await storage.read("x.txt")


def test_get_storage_returns_singleton():
    set_storage(LocalFilesystemBackend())
    assert get_storage() is get_storage()
