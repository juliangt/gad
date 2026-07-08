# backend/tests/test_admin.py
from types import SimpleNamespace

import pytest

from gad.admin.dependencies import require_admin
from gad.exceptions import AuthError


@pytest.mark.asyncio
async def test_require_admin_rejects_non_admin():
    user = SimpleNamespace(is_admin=False)
    with pytest.raises(AuthError):
        await require_admin(user)


@pytest.mark.asyncio
async def test_require_admin_accepts_admin():
    user = SimpleNamespace(is_admin=True)
    result = await require_admin(user)
    assert result is user
