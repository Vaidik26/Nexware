"""
NexWare Backend — Application entry point.

Responsibilities:
- Configure structured logging (must be first)
- Validate critical settings on startup
- Mount all routers under root path AND /api prefix (for Vercel routing)
- Configure CORS — reads origin list from environment, never uses wildcard regex
- Log unhandled exceptions with their request and answer in JSON

The schema is owned by Alembic; startup deliberately does NOT call create_all.
See the lifespan handler below for why.
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

from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.routers import (
    access,
    auth,
    users,
    catalogue,
    orders,
    picklists,
    market,
    lpos,
    customers,
    sales_dashboard,
)


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

    # Storage is checked here rather than only at upload time: an anon key in
    # SUPABASE_SERVICE_KEY fails as an opaque RLS violation halfway through a
    # customer's LPO upload, which is a bad place to discover it.
    try:
        from backend.services.storage_service import storage_config_error

        problem = storage_config_error()
        if problem:
            logger.warning("Supabase storage will not work:\n%s", problem)
        else:
            logger.info("Supabase storage configured with a service-role key.")
    except Exception as exc:
        logger.warning("Could not verify Supabase storage configuration: %s", exc)

    # Same reasoning for the sales data source: an unset key surfaces as an
    # opaque failure halfway through loading somebody's dashboard, which is a
    # bad place to discover a missing environment variable.
    problem = settings.sales_app_config_error()
    if problem:
        logger.warning("Sales Dashboard will not load:\n%s", problem)
    else:
        logger.info("Sales Dashboard data source configured.")

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


# ─── Unhandled errors ──────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Log any unhandled exception with its request, and answer in JSON.

    Starlette's default replies with the plain text "Internal Server Error" and
    no body structure, so a crash reaches the client as a 500 the UI cannot
    describe — every client here reads ``detail``, finds nothing, and falls back
    to a generic message. That turned real backend crashes into "could not
    confirm photos" and "incorrect email or password", which sent debugging
    after the wrong problem more than once.

    The response names the error type and the request id only. The message is
    deliberately withheld: it can carry SQL fragments and identifiers. The full
    traceback goes to the log, where it belongs.
    """
    request_id = request.headers.get("x-request-id") or "-"
    logger.exception(
        "Unhandled %s on %s %s (request_id=%s)",
        type(exc).__name__,
        request.method,
        request.url.path,
        request_id,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                f"The server hit an unexpected error ({type(exc).__name__}). "
                "It has been logged — please report this if it keeps happening."
            ),
            "error_type": type(exc).__name__,
            "path": request.url.path,
            "request_id": request_id,
        },
    )

# ─── Routers ───────────────────────────────────────────────────────────────────
# Each router is mounted at root AND under /api prefix.
# The /api prefix is required for Vercel rewrites where the frontend and backend
# share a domain (frontend calls /api/..., which Vercel proxies to the backend).

_all_routers = [
    auth.router,
    access.router,
    users.router,
    catalogue.router,
    orders.router,
    picklists.router,
    market.router,
    lpos.router,
    customers.router,
    sales_dashboard.router,
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

