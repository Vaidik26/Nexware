import sys
import os
import types

current_dir = os.path.abspath(os.path.dirname(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, '..'))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Create a module alias for Vercel serverless execution
if 'backend' not in sys.modules:
    backend_pkg = types.ModuleType('backend')
    backend_pkg.__path__ = [current_dir]
    sys.modules['backend'] = backend_pkg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.config import settings
from backend.routers import auth, users, catalogue, orders, picklists, market, notifications, lpos



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

origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=".*",
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
app.include_router(lpos.router)

# Mount all routers under /api prefix as well to guarantee 100% Vercel routing compatibility
from fastapi import APIRouter
api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalogue.router)
api_router.include_router(orders.router)
api_router.include_router(picklists.router)
api_router.include_router(market.router)
api_router.include_router(notifications.router)
api_router.include_router(lpos.router)
app.include_router(api_router)


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
