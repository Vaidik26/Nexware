"""
Create the first admin account.

The refactor drops the old ``users`` table, so a freshly migrated database has no
accounts at all and nobody can log in. Run this once after
``alembic upgrade head``.

    python -m backend.scripts.seed_admin --email you@example.com --name "Your Name"

The password is read from the ADMIN_PASSWORD environment variable, never from an
argument — arguments land in shell history and process listings.
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.future import select

from backend.config import settings
from backend.models.users import AdminUser
from backend.services.auth_service import hash_password


async def seed_admin(email: str, full_name: str, password: str) -> None:
    engine = create_async_engine(settings.get_async_database_url())
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        existing = await db.execute(select(AdminUser).filter(AdminUser.email.ilike(email)))
        if existing.scalars().first():
            print(f"An admin with email {email} already exists. Nothing to do.")
            await engine.dispose()
            return

        db.add(
            AdminUser(
                email=email,
                full_name=full_name,
                hashed_password=hash_password(password),
                is_active=True,
            )
        )
        await db.commit()

    print(f"Admin created: {email}")
    print("Log in with this email and the password from ADMIN_PASSWORD.")
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first admin account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True, help="Full name shown in the portal")
    args = parser.parse_args()

    password = os.environ.get("ADMIN_PASSWORD", "")
    if len(password) < 8:
        parser.error(
            "Set the ADMIN_PASSWORD environment variable to a password of at least "
            "8 characters before running this script."
        )

    asyncio.run(seed_admin(args.email.strip(), args.name.strip(), password))


if __name__ == "__main__":
    main()
