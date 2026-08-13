import asyncio
import os
import sys

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import AsyncSessionLocal, engine, Base
from backend.models.customer import Customer
from sqlalchemy.future import select

async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        customers_to_add = [
            {"customer_code": "NOOR-DXB-001", "name": "Noor Ghazal Gen Trading - Deira"},
            {"customer_code": "NOOR-DXB-002", "name": "Noor Ghazal Supermarket - Al Karama"},
            {"customer_code": "NOOR-SHJ-001", "name": "Noor Ghazal Grocery - Sharjah"},
            {"customer_code": "ALFUT-01", "name": "Al Futtaim Retail Group"},
            {"customer_code": "SPIN-DXB", "name": "Spinneys Dubai LLC"},
            {"customer_code": "LULU-HYP", "name": "LuLu Hypermarket - Al Barsha"},
            {"customer_code": "CARR-MOE", "name": "Carrefour - Mall of the Emirates"},
            {"customer_code": "CHOI-01", "name": "Choithrams - DIFC"},
            {"customer_code": "UNION-COOP", "name": "Union Coop - Jumeirah"},
            {"customer_code": "ALMAYA-01", "name": "Al Maya Supermarket - Marina"},
        ]
        
        for c in customers_to_add:
            exists = await db.execute(select(Customer).filter_by(customer_code=c["customer_code"]))
            if not exists.scalar_one_or_none():
                new_cust = Customer(customer_code=c["customer_code"], name=c["name"])
                db.add(new_cust)
        
        await db.commit()
        print("Successfully seeded Dubai dummy customers into the database!")

if __name__ == "__main__":
    asyncio.run(seed())
