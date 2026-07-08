# backend/src/gad/storage/local.py
import uuid
from pathlib import Path

from gad.storage.base import StorageBackend

MEDIA_DIR = Path("media")


class LocalFilesystemBackend(StorageBackend):
    def __init__(self, base_dir: Path = MEDIA_DIR, base_url: str = "/media"):
        self.base_dir = base_dir
        self.base_url = base_url
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, path: str, data: bytes, content_type: str) -> str:
        full = self.base_dir / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)
        return f"{self.base_url}/{path}"

    async def read(self, path: str) -> bytes:
        return (self.base_dir / path).read_bytes()

    async def delete(self, path: str) -> None:
        (self.base_dir / path).unlink(missing_ok=True)

    def avatar_path(self, user_id: str, ext: str = "jpg") -> str:
        return f"avatars/{user_id}/{uuid.uuid4().hex}.{ext}"
