"""
Shared helpers that are not tied to any single model or router.
"""
import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

#: Prefixes for the human-facing short IDs. Kept here so the format is declared
#: in one place rather than spelled out at each insert site.
PREFIX_PICKLIST = "PL"
PREFIX_LPO = "LPO"

#: Number of hex characters in the random tail. Four gives 65,536 possibilities
#: within a single month-bucket, which is why callers still retry on collision.
_RANDOM_HEX_LENGTH = 4

#: How many times a caller should regenerate before giving up. Exposed so the
#: retry loops in the routers do not each invent their own number.
ID_GENERATION_MAX_ATTEMPTS = 5


def generate_prefixed_id(prefix: str) -> str:
    """
    Build a short, collision-resistant, human-readable identifier.

    The shape is ``PREFIX-YYMM-XXXX`` (for example ``PL-2408-9F3A``): a caller
    prefix, a UTC year/month bucket so IDs sort and read chronologically, and a
    cryptographically random hex tail.

    The tail is random rather than sequential so that two concurrent requests
    cannot derive the same value from the same read, which is what a
    ``SELECT max(...) + 1`` scheme would do. It is *not* a uniqueness guarantee:
    the column carries a UNIQUE constraint and callers retry on IntegrityError.

    Args:
        prefix: Short uppercase tag identifying the record type, e.g. ``"PL"``.

    Returns:
        The generated identifier.
    """
    period = datetime.now(timezone.utc).strftime("%y%m")
    tail = secrets.token_hex(_RANDOM_HEX_LENGTH // 2).upper()
    return f"{prefix.strip().upper()}-{period}-{tail}"


def violated_constraint(exc: IntegrityError, *names: str) -> bool:
    """
    Report whether ``exc`` was caused by one of the named columns or constraints.

    Callers use this to tell "the id I generated collided, regenerate it" apart
    from "the caller supplied a value that is already taken", which needs a 4xx
    rather than a retry. Matching on the driver's message text is crude, but
    asyncpg does not expose the constraint name in a portable way through
    SQLAlchemy's wrapper.
    """
    haystack = str(getattr(exc, "orig", exc))
    return any(name in haystack for name in names)


async def flush_with_prefixed_id(
    db: AsyncSession,
    obj,
    field: str,
    prefix: str,
):
    """
    Assign a generated id to ``obj.<field>`` and INSERT it, retrying on collision.

    The insert runs inside a SAVEPOINT. That matters: a UNIQUE violation poisons
    the whole transaction in PostgreSQL, so without a savepoint a retry would
    have to discard every other change the caller has already staged. With one,
    only the failed INSERT is undone and the caller's work survives.

    Args:
        db: The active session.
        obj: An unsaved model instance.
        field: Name of the unique column to populate, e.g. ``"picklist_number"``.
        prefix: Prefix passed to :func:`generate_prefixed_id`.

    Returns:
        The same instance, now flushed and holding a primary key.

    Raises:
        IntegrityError: if every attempt collided, or if the violation was on a
            different constraint (a duplicate ``lpo_number``, say) — in which
            case retrying would be wrong and the error is re-raised immediately.
    """
    last_error = None
    for attempt in range(1, ID_GENERATION_MAX_ATTEMPTS + 1):
        setattr(obj, field, generate_prefixed_id(prefix))
        try:
            async with db.begin_nested():
                db.add(obj)
                await db.flush()
            return obj
        except IntegrityError as exc:
            last_error = exc
            if field not in str(exc.orig):
                # A different constraint failed — retrying cannot help.
                raise
            logger.warning(
                "Generated %s collided on attempt %d/%d; regenerating",
                field,
                attempt,
                ID_GENERATION_MAX_ATTEMPTS,
            )

    logger.error(
        "Could not allocate a unique %s after %d attempts", field, ID_GENERATION_MAX_ATTEMPTS
    )
    assert last_error is not None  # the loop always runs at least once
    raise last_error
