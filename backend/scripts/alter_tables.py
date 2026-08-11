import asyncio
import sys
import os
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from backend.config import settings

async def alter_tables():
    db_url = settings.get_async_database_url()
    engine = create_async_engine(db_url, echo=True, connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda *_: f"__asyncpg_{uuid.uuid4().hex}__",
    })
    
    commands = [
        # pick_list_items additions
        "ALTER TABLE pick_list_items ADD COLUMN IF NOT EXISTS is_full_carton BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE pick_list_items ADD COLUMN IF NOT EXISTS box_id INTEGER;",
        "ALTER TABLE pick_list_items ADD COLUMN IF NOT EXISTS missing_reported BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE pick_list_items ADD COLUMN IF NOT EXISTS missing_approved BOOLEAN;",
        "ALTER TABLE pick_list_items ADD COLUMN IF NOT EXISTS bin_location VARCHAR;",
        
        # sales_items additions
        "ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS bin_location VARCHAR;",
        "ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS standard_carton_quantity INTEGER DEFAULT 1;",
        "ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS packaging_weight FLOAT DEFAULT 0.0;",
        "ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS sku_size_category VARCHAR DEFAULT '>100g';"
    ]
    
    async with engine.begin() as conn:
        for cmd in commands:
            await conn.execute(text(cmd))
            
    print("Alter tables completed.")
    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info >= (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(alter_tables())
