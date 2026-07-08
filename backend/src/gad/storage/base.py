# backend/src/gad/storage/base.py
from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, path: str, data: bytes, content_type: str) -> str:
        """Guarda los bytes en path, retorna la URL pública."""

    @abstractmethod
    async def read(self, path: str) -> bytes:
        """Lee los bytes en path."""

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Borra path."""
