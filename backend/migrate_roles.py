import sys
import os
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import AsyncSessionLocal
from backend.models.user import User
from sqlalchemy import select

async def migrate():
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(User).filter(User.role == 'lpo'))
            users = result.scalars().all()
            for u in users:
                u.role = 'sales_person'
            await db.commit()
            print(f"Successfully migrated {len(users)} users from 'lpo' to 'sales_person'.")
        except Exception as e:
            print(f"Error: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(migrate())
