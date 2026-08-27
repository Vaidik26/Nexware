"""
Reading and writing portal access grants.

This is the only module that touches ``dashboard_user_modules`` and
``dashboard_user_areas``. It does two things:

* :func:`access_for` — turn an authenticated persona row into the one
  :class:`~backend.core.access.EffectiveAccess` answer the rest of the
  application asks its questions of.
* :func:`replace_grants` — rewrite one account's explicit grants.

WHY REPLACE AND NOT MERGE. The user-admin screen shows the complete grant as a
set of ticks and a multi-select; saving it means "this is now the whole grant",
so a module that was granted and is no longer ticked has been *removed*, not
left alone. Merging would make it impossible to take anything away.

The delete and the re-insert both happen inside the caller's transaction, which
is the one thing the legacy PostgREST implementation could not do: there, the
DELETE landed, the INSERT failed on a schema mismatch, and a live account came
out of the save reaching nobody. Here a failed insert rolls the delete back with
it, so a refused save changes nothing at all.
"""
import logging
from typing import Iterable, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from backend.constants import SalesChannel
from backend.core.access import NO_ACCESS, PORTAL_OWNER, EffectiveAccess, resolve
from backend.models.users import (
    USER_TYPE_ADMIN,
    USER_TYPE_DASHBOARD,
    DashboardUser,
    DashboardUserArea,
)

logger = logging.getLogger(__name__)


def access_for(user, user_type: Optional[str]) -> EffectiveAccess:
    """
    The effective portal access of an authenticated caller.

    Standing is decided by which table the token names, then — for dashboard
    users only — by the hybrid role/grant rule:

    * ``admin``     the platform operator, who owns the portal outright.
    * ``dashboard`` resolved from ``role`` plus any explicit grant rows.
    * anything else (picker, sales rep, unknown) has no portal standing. They
      sign into the mobile apps, which enforce their own rules; this portal
      offers them nothing rather than guessing at an equivalent.

    ``user`` must have been loaded with its grant relationships populated —
    :class:`~backend.models.users.DashboardUser` declares them ``selectin``, so
    that is true of any ordinary ``select()``.
    """
    if user_type == USER_TYPE_ADMIN:
        return PORTAL_OWNER
    if user_type != USER_TYPE_DASHBOARD or not isinstance(user, DashboardUser):
        return NO_ACCESS

    return resolve(
        role=user.role,
        explicit_areas=[(g.area, g.channel) for g in user.area_grants],
    )


async def replace_grants(
    db: AsyncSession,
    user: DashboardUser,
    areas: Optional[Sequence[str]],
    channel: Optional[SalesChannel],
) -> None:
    """
    Rewrite one dashboard account's explicit grants.
    """
    if areas is None:
        return

    user.area_grants.clear()
    await db.flush()

    if areas is not None:
        stored_channel = channel.value if channel is not None else None
        user.area_grants.extend(
            DashboardUserArea(area=a, channel=stored_channel) for a in _unique(areas)
        )

    logger.info(
        "Dashboard grants rewritten: user_id=%s areas=%s channel=%s",
        user.id,
        len(areas) if areas is not None else "unchanged",
        channel.value if channel else "both",
    )


def _unique(values: Iterable[str]) -> list[str]:
    """De-duplicate while preserving order — the grant tables are UNIQUE on it."""
    return list(dict.fromkeys(values))
