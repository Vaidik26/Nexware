import sys
import os
import random
import asyncio

# Ensure backend directory is in path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.database import AsyncSessionLocal
from backend.models.catalogue import SalesItem
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SalesItem))
        items = result.scalars().all()
        
        updated_count = 0
        for item in items:
            new_qty = random.choice([10, 20])
            item.standard_carton_quantity = new_qty
            updated_count += 1
            
        await db.commit()
        print(f"Updated {updated_count} items with random carton quantity of 10 or 20.")

if __name__ == "__main__":
    asyncio.run(main())
