# backend/src/gad/admin/dependencies.py
from typing import Annotated

from fastapi import Depends

from gad.auth.dependencies import get_current_user
from gad.exceptions import ForbiddenError
from gad.models.user import User


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_admin:
        raise ForbiddenError("Se requieren permisos de administrador")
    return current_user
