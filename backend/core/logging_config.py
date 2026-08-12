"""
Centralized logging configuration for NexWare backend.

Call configure_logging() once at application startup (in main.py lifespan).
All other modules should use:

    import logging
    logger = logging.getLogger(__name__)
"""
import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """Configure application-wide structured logging to stdout."""
    log_level = getattr(logging, level.upper(), logging.INFO)

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)-40s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,  # override any earlier basicConfig calls
    )

    # Reduce noise from verbose third-party libraries
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
