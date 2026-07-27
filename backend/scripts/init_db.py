import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from backend.models import Base
from backend.models.user import User
from backend.config import settings
from backend.services.auth_service import hash_password


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
        print(f"\n[Database Connection Error]: Could not connect to Supabase PostgreSQL database.\nDetails: {err}")
        return

    print("\n[OK] Database schema initialization complete!")
    print("👉 To securely create or update your Admin and Picker credentials without hardcoded passwords, run:\n   python seed.py")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_db())
