import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath('.'))
from backend.config import settings
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def query():
    engine = create_async_engine(settings.get_async_database_url(), connect_args={'statement_cache_size': 0})
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT * FROM sales_items"))
        rows = res.mappings().all()
        for row in rows:
            print(dict(row))
    await engine.dispose()

asyncio.run(query())
