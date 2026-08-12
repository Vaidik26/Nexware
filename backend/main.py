"""
NexWare Backend — Application entry point.

Responsibilities:
- Configure structured logging (must be first)
- Validate critical settings on startup
- Run DB schema creation via create_all (idempotent — safe every boot)
- Mount all routers under root path AND /api prefix (for Vercel routing)
- Configure CORS — reads origin list from environment, never uses wildcard regex
"""
import sys
import os
import types
import logging

# ─── sys.path bootstrap (needed for Vercel serverless module resolution) ───────
current_dir = os.path.abspath(os.path.dirname(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, ".."))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Create a module alias for Vercel serverless execution
if "backend" not in sys.modules:
    backend_pkg = types.ModuleType("backend")
    backend_pkg.__path__ = [current_dir]
    sys.modules["backend"] = backend_pkg

# ─── Logging must be configured before any other imports ──────────────────────
from backend.core.logging_config import configure_logging  # noqa: E402
configure_logging()
logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.routers import auth, users, catalogue, orders, picklists, market, notifications, lpos


# ─── Startup / Shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    On startup:
        1. Validate critical settings (JWT secret must be set & strong).
        2. Run Base.metadata.create_all — idempotent, creates only missing tables.
           No raw ALTER TABLE statements — use Alembic migrations for schema changes.
    """
    # 1. Validate JWT secret before accepting any requests
    try:
        settings.validate_jwt_secret()
    except ValueError as exc:
        logger.critical("JWT configuration error: %s", exc)
        raise SystemExit(1) from exc

    # 2. Create / verify DB schema
    try:
        from backend.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema verified/created successfully.")
    except Exception as exc:
        logger.error("Database schema initialisation failed: %s", exc, exc_info=True)
        # Allow startup to continue — DB may be available on next request after retry

    yield
    logger.info("Application shutdown.")


# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Nexware API",
    description="Warehouse Picking & Market Price Management",
    version=settings.VERSION,
    lifespan=lifespan,
)

# ─── CORS ──────────────────────────────────────────────────────────────────────
# Origins are read from ALLOWED_ORIGINS env var (comma-separated list).
# We NEVER use allow_origin_regex=".*" — that bypasses all origin restrictions.
_origins = [
    o.strip()
    for o in settings.ALLOWED_ORIGINS.split(",")
    if o.strip() and o.strip() != "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("CORS configured for origins: %s", _origins)

# ─── Routers ───────────────────────────────────────────────────────────────────
# Each router is mounted at root AND under /api prefix.
# The /api prefix is required for Vercel rewrites where the frontend and backend
# share a domain (frontend calls /api/..., which Vercel proxies to the backend).

_all_routers = [
    auth.router,
    users.router,
    catalogue.router,
    orders.router,
    picklists.router,
    market.router,
    notifications.router,
    lpos.router,
]

for _r in _all_routers:
    app.include_router(_r)

_api_router = APIRouter(prefix="/api")
for _r in _all_routers:
    _api_router.include_router(_r)

app.include_router(_api_router)


# ─── Health & Root ─────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "product": "NexWare Enterprise API",
        "status": "online",
        "version": settings.VERSION,
    }


@app.get("/health")
def health():
    return {"status": "ok"}
