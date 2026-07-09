from datetime import datetime, timezone

from pydantic import BaseModel

from gad.schemas.pagination import PaginatedOut


class _Item(BaseModel):
    name: str


def test_paginated_out_with_items_and_cursor():
    out = PaginatedOut[_Item](items=[], next_cursor=None)
    assert out.items == []
    assert out.next_cursor is None


def test_paginated_out_serializes_cursor_as_iso():
    ts = datetime(2026, 7, 8, 12, 0, tzinfo=timezone.utc)
    out = PaginatedOut[dict](items=[{"a": 1}], next_cursor=ts.isoformat())
    dumped = out.model_dump()
    assert dumped["next_cursor"] == ts.isoformat()
