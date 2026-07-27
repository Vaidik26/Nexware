import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.config import settings
from backend.routers import auth, users, catalogue, orders, picklists, market, notifications


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from backend.database import engine, Base
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            try:
                await conn.execute(text("ALTER TABLE raw_materials ADD COLUMN weight_unit VARCHAR(20) DEFAULT 'kg'"))
            except Exception:
                pass
        print("[OK] Database schema verified successfully.")
    except Exception as e:
        print(f"[Notice] Database schema verification check encountered an issue: {e}")
    yield


app = FastAPI(
    title="Nexware API",
    description="Warehouse Picking & Market Price Management",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(catalogue.router)
app.include_router(orders.router)
app.include_router(picklists.router)
app.include_router(market.router)
app.include_router(notifications.router)


@app.get("/")
def root():
    return {
        "product": "NexWare Enterprise API",
        "status": "online",
        "version": "1.0.0",
        "documentation_url": "http://localhost:8000/docs",
        "health_url": "http://localhost:8000/health"
    }


@app.get("/health")
def health():
    return {"status": "ok"}
