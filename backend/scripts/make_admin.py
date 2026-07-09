"""Otorga o quita privilegios de admin a un usuario por email.

Uso:
    uv run python -m scripts.make_admin user@example.com
    uv run python -m scripts.make_admin user@example.com --revoke
"""
import argparse
import asyncio

from sqlalchemy import select

from gad.db import async_session_maker
from gad.models.user import User


async def set_admin(email: str, revoke: bool = False) -> None:
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"Usuario no encontrado: {email}")
            return
        user.is_admin = not revoke
        await session.commit()
        action = "removido de" if revoke else "promovido a"
        print(f"{email} {action} admin")


def main() -> None:
    parser = argparse.ArgumentParser(description="Gestionar rol admin de un usuario")
    parser.add_argument("email", help="Email del usuario")
    parser.add_argument("--revoke", action="store_true", help="Quitar admin")
    args = parser.parse_args()
    asyncio.run(set_admin(args.email, revoke=args.revoke))


if __name__ == "__main__":
    main()
