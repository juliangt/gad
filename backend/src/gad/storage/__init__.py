# backend/src/gad/storage/__init__.py
from gad.storage.base import StorageBackend
from gad.storage.local import LocalFilesystemBackend

_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        _storage = LocalFilesystemBackend()
    return _storage


def set_storage(backend: StorageBackend) -> None:
    global _storage
    _storage = backend
