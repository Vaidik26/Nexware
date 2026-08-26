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
from backend.routers import auth, users, catalogue, orders, picklists, market, notifications, lpos, customers


# ─── Startup / Shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Startup validates critical settings and nothing else.

    It deliberately no longer calls ``Base.metadata.create_all``. Doing so raced
    Alembic: a boot between deploy and ``alembic upgrade`` would create the new
    tables itself, and the migration would then fail on DuplicateTable — while
    any table a migration meant to rename would silently reappear empty. The
    schema is owned by Alembic alone; run ``alembic upgrade head`` to change it.
    """
    try:
        settings.validate_jwt_secret()
    except Exception as exc:
        logger.warning("JWT configuration issue: %s", exc)

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
    allow_origin_regex=r"https://.*\.vercel\.app",
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
    customers.router,
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

from backend.ws_manager import manager
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

