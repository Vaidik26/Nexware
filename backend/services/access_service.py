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
    DashboardUserModule,
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
        explicit_modules=[g.module for g in user.module_grants],
        explicit_areas=[(g.area, g.channel) for g in user.area_grants],
    )


async def replace_grants(
    db: AsyncSession,
    user: DashboardUser,
    modules: Optional[Sequence[str]],
    areas: Optional[Sequence[str]],
    channel: Optional[SalesChannel],
) -> None:
    """
    Rewrite one dashboard account's explicit grants.

    ``None`` for either list leaves that half of the grant untouched — a PATCH
    that only changes a name must not strip a territory. An EMPTY list is the
    deliberate opposite: it clears that half, which is the only way to put the
    account back onto its role defaults.

    ``channel`` applies to every area in the same save, matching the screen it
    is picked on: one selector above the area list, not one per area. A
    both-books grant stores NULL.

    Goes through the relationship collections rather than issuing a bulk DELETE
    against the tables. Two reasons, both of which bit the obvious version:

    * ``user.area_grants`` is already loaded, and a Core DELETE does not empty
      it. The response would then be serialised from rows that no longer exist.
    * the old rows must be gone from the database BEFORE the new ones are
      written, or re-saving an unchanged area violates the UNIQUE(user_id,
      area) constraint. SQLAlchemy's unit of work orders inserts before deletes
      for a mapper, so the flush between the two halves below is load-bearing.

    Does not commit. The caller owns the transaction, so the grant rewrite lands
    or rolls back together with whatever else that request changed.
    """
    if modules is None and areas is None:
        return

    if modules is not None:
        user.module_grants.clear()
    if areas is not None:
        user.area_grants.clear()

    # delete-orphan turns the clears above into DELETEs. They have to reach the
    # database before the inserts below are prepared — see the docstring.
    await db.flush()

    if modules is not None:
        user.module_grants.extend(
            DashboardUserModule(module=m) for m in _unique(modules)
        )
    if areas is not None:
        stored_channel = channel.value if channel is not None else None
        user.area_grants.extend(
            DashboardUserArea(area=a, channel=stored_channel) for a in _unique(areas)
        )

    logger.info(
        "Dashboard grants rewritten: user_id=%s modules=%s areas=%s channel=%s",
        user.id,
        "unchanged" if modules is None else len(modules),
        "unchanged" if areas is None else len(areas),
        channel.value if channel else "both",
    )


def _unique(values: Iterable[str]) -> list[str]:
    """De-duplicate while preserving order — the grant tables are UNIQUE on it."""
    return list(dict.fromkeys(values))
