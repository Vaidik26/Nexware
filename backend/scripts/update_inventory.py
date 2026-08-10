import asyncio
import sys
import os

# Add root directory to sys path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from backend.config import settings
import uuid

async def run_update():
    print("Updating sales_items inventory and schema...")
    
    db_url = settings.get_async_database_url()
    engine = create_async_engine(
        db_url, 
        echo=False,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda *_: f"__asyncpg_{uuid.uuid4().hex}__",
        }
    )
    
    async with engine.begin() as conn:
        # Add column if it doesn't exist
        try:
            await conn.execute(text("ALTER TABLE sales_items ADD COLUMN available_quantity INTEGER DEFAULT 0;"))
            print("Added available_quantity column.")
        except Exception as e:
            print("Column available_quantity already exists or error:", e)

        # Update NOOR items with dummy bin locations, sku sizes, and available stock
        updates = [
            # 1. 2731 NOOR CURRY (barcode 6294003017293)
            "UPDATE sales_items SET bin_location='B1-R1-S1', sku_size_category='>100g', available_quantity=50 WHERE barcode='6294003017293'",
            # 2. 3051 NOOR CUMIN (barcode 6294003020521)
            "UPDATE sales_items SET bin_location='B1-R1-S2', sku_size_category='>100g', available_quantity=20 WHERE barcode='6294003020521'",
            # 3. 1002 NOOR PUTTUPODI (barcode 6294003000028)
            "UPDATE sales_items SET bin_location='B2-R2-S1', sku_size_category='>100g', available_quantity=0 WHERE barcode='6294003000028'", # To test 0 quantity logic
            # 4. 1058 NOOR CLOVES (barcode 6294003000585)
            "UPDATE sales_items SET bin_location='B2-R2-S2', sku_size_category='<=100g', available_quantity=100 WHERE barcode='6294003000585'",
            
            # Ensure dummy ITM items have stock too
            "UPDATE sales_items SET available_quantity=200 WHERE barcode='1001'",
            "UPDATE sales_items SET available_quantity=10 WHERE barcode='1002'",
            "UPDATE sales_items SET available_quantity=5 WHERE barcode='1003'",
            "UPDATE sales_items SET available_quantity=0 WHERE barcode='1004'", # Another 0 logic test
        ]
        
        for q in updates:
            await conn.execute(text(q))
            
        print("Updated dummy data.")

    await engine.dispose()
    print("Update complete!")

if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info >= (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_update())
