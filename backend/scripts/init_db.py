"""
Development bootstrap.

Creates the schema directly from the models, bypassing Alembic. Use this only on
a throwaway database — the application no longer creates tables at startup, and
any environment you care about should be built with ``alembic upgrade head`` so
its migration history is real.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy.ext.asyncio import create_async_engine

from backend.config import settings
from backend.models import Base  # noqa: F401 — importing registers every model


async def init_db():
    try:
        db_url = settings.get_async_database_url()
    except ValueError as e:
        print(e)
        return

    engine = create_async_engine(db_url, echo=True)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("All database tables created.")
    except Exception as err:
        print(
            "\n[Database Connection Error]: Could not connect to the PostgreSQL database."
            f"\nDetails: {err}"
        )
        return

    print("\n[OK] Database schema initialisation complete.")
    print(
        "Next: create your first admin with\n"
        "   python -m backend.scripts.seed_admin"
    )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_db())
