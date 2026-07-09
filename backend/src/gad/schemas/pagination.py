"""Schema genérico de respuesta paginada por cursor."""
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedOut(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
