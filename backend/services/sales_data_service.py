"""
The Sales Dashboard's data source, and the territory scoping applied to it.

WHY THE BACKEND IS IN THE MIDDLE. The sales history lives in the legacy sales
app's Supabase project, behind two RPCs (``ng2_bootstrap``, ``ng2_dashboard``).
The browser used to call them directly with that project's anon key, and the
territory filter was a list of customer ids the browser chose to send. Both
halves of that were unenforceable:

* the key was in the JS bundle, so anyone could call ``ng2_dashboard``
  themselves and simply omit the customer filter;
* ``ng2_dashboard`` ignores ``p_customers`` when building its ``custIds``
  reply, and ``ng2_bootstrap`` returns the whole 3,859-name customer
  dictionary, so even a correctly-scoped call handed the full customer master
  to a viewer entitled to one territory.

So the scope is applied HERE, on a server the viewer cannot edit, and the
response is cut down to it before it is sent. The key never leaves the server.
This does not move the data — it still lives in that project — but the browser
no longer has any way to reach it except through a scoped request.

WHERE THE TERRITORY MAP COMES FROM. ``backend/data/area_customers.json``, the
generated map of supervisor area -> customer ids, per channel. It is the one
copy: the frontend reads it from this backend rather than keeping its own, so
the picker that WRITES a grant and the code that ENFORCES one cannot disagree
about which customers a territory holds.
"""
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import httpx
from fastapi import HTTPException, status

from backend.config import settings
from backend.constants import SalesChannel
from backend.core.access import EffectiveAccess

logger = logging.getLogger(__name__)

#: Which of a supervisor area's id lists each channel may see.
_CHANNEL_ID_FIELD = {SalesChannel.KEY: "directIds", SalesChannel.VAN: "vanIds"}

_AREA_FILE = Path(__file__).resolve().parent.parent / "data" / "area_customers.json"

_MATCHES_NOBODY = [-1]

# In-memory cache populated from the legacy RPC at first territory request.
# Keyed by supervisor-area name → slot dict (same shape as area_customers.json).
_rpc_area_cache: Dict[str, Any] = {}


@lru_cache(maxsize=1)
def load_area_map() -> Dict[str, Any]:
    """
    The supervisor-area / ERP-area customer map.

    Reads from ``backend/data/area_customers.json`` if present. Falls back to
    ``_rpc_area_cache`` (populated by ``fetch_area_map_from_rpc``) when the
    file is missing or empty so the territories endpoint can warm the cache
    from the legacy Supabase and the enforcement path can then use it.
    """
    try:
        with _AREA_FILE.open(encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("salesmanAreas"):
            return data
    except (OSError, json.JSONDecodeError):
        pass

    # Fall back to RPC cache if the file is absent / empty.
    if _rpc_area_cache:
        return {"salesmanAreas": _rpc_area_cache, "areas": {}}

    logger.warning(
        "area_customers.json is missing or empty and the RPC cache is cold. "
        "Territory enforcement will fail closed until /access/territories is called."
    )
    return {"areas": {}, "salesmanAreas": {}}


def _invalidate_area_cache() -> None:
    """Clear the lru_cache so load_area_map re-reads on the next call."""
    load_area_map.cache_clear()


async def fetch_area_map_from_rpc() -> Dict[str, Any]:
    """
    Fetch supervisor-area data from the legacy Supabase ``ng2_bootstrap`` RPC
    and store it in ``_rpc_area_cache``.

    Called by the territories endpoint so the picker always reflects live data.
    Also warms the cache used by ``supervisor_areas()`` / enforcement.

    The bootstrap response already contains ``salesmanAreas`` keyed by the
    exact area name stored in grants.  Each slot has:
      - ``direct`` / ``van``          — customer-master counts per channel
      - ``directIds`` / ``vanIds``    — matched ids per channel
      - ``customerIds``               — all matched ids (both channels)
    """
    raw = await _rpc("ng2_bootstrap", {})
    sareas: Dict[str, Any] = (raw or {}).get("salesmanAreas") or {}
    if sareas:
        global _rpc_area_cache
        _rpc_area_cache = sareas
        _invalidate_area_cache()   # force load_area_map to pick up new cache
    return sareas


def supervisor_areas() -> Dict[str, Any]:
    """The supervisor areas, keyed by the exact name a grant is stored as."""
    return load_area_map().get("salesmanAreas") or {}


def granted_customer_ids(access: EffectiveAccess) -> Optional[List[int]]:
    """
    THE ONE PLACE A GRANT BECOMES CUSTOMER IDS, server side.

    Returns ``None`` when the account reaches every customer (ALL grant) and a
    list otherwise. Resolves to ``_MATCHES_NOBODY`` rather than [] so that an
    empty result is never confused with "no filter" by ``ng2_dashboard``.
    """
    if access.all_areas:
        return None

    areas = supervisor_areas()
    ids: List[int] = []
    for area in access.areas:
        slot = areas.get(area)
        if not slot:
            continue
        channel = access.channel_for(area)
        field = "customerIds" if channel is None else _CHANNEL_ID_FIELD[channel]
        ids.extend(slot.get(field) or [])

    return sorted(set(ids)) or _MATCHES_NOBODY


def intersect_scope(
    granted: Optional[List[int]], requested: Optional[Sequence[int]]
) -> Optional[List[int]]:
    """
    Combine the account's grant with the filter the viewer asked for.

    The grant is one more set in an intersection, never an alternative to the
    viewer's filter — which is what makes it impossible to widen by filtering.
    Asking for a territory outside your grant narrows to nothing; it never
    reaches across.

    ``None`` from both sides means no filter at all, which only an ALL grant
    with no customer filter can produce.
    """
    if requested is None:
        return granted
    wanted = {int(c) for c in requested}
    if granted is None:
        return sorted(wanted) or _MATCHES_NOBODY
    return sorted(wanted & set(granted)) or _MATCHES_NOBODY


async def _rpc(function: str, args: Dict[str, Any]) -> Any:
    """
    Call one RPC on the sales-app project.

    Read-only by construction: only ``ng2_bootstrap`` and ``ng2_dashboard`` are
    ever named by a caller in this module, and the function name is never taken
    from a request — a proxy that forwarded an arbitrary function name would
    hand the browser back everything moving it here just took away.
    """
    problem = settings.sales_app_config_error()
    if problem:
        logger.error("Sales data source unusable: %s", problem)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Sales Dashboard data source is not configured on the server.",
        )

    base = settings.SALES_APP_SUPABASE_URL.strip().rstrip("/")
    key = settings.SALES_APP_SUPABASE_KEY.strip()
    try:
        async with httpx.AsyncClient(timeout=settings.SALES_APP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{base}/rest/v1/rpc/{function}",
                json=args,
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.HTTPError as exc:
        logger.error("Sales data source unreachable calling %s: %s", function, exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The Sales Dashboard data source did not respond.",
        ) from exc

    if response.status_code >= 400:
        # The upstream body can name tables and columns of a project the caller
        # has no business knowing about, so it is logged and not returned.
        logger.error(
            "Sales data source refused %s: %s %.300s",
            function,
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The Sales Dashboard data source returned an error.",
        )

    return response.json()


def _scope_customer_dict(
    custs: Any, allowed: Optional[Iterable[int]]
) -> Dict[str, Any]:
    """
    Cut a ``{customer_id: name}`` dictionary down to the ids in scope.

    ``ng2_bootstrap`` returns the entire customer master — 3,859 names — with no
    regard for who asked. That dictionary is the source for the customer picker,
    so leaving it whole would show a viewer scoped to one territory the name of
    every shop in the country.
    """
    if not isinstance(custs, dict):
        return {}
    if allowed is None:
        return custs
    keep = {str(c) for c in allowed}
    return {k: v for k, v in custs.items() if str(k) in keep}


def _scope_id_list(ids: Any, allowed: Optional[Iterable[int]]) -> List[int]:
    """
    Cut ``custIds`` down to the ids in scope.

    ``ng2_dashboard`` builds this list without applying ``p_customers`` at all —
    a call scoped to three customers still comes back with all 3,859 ids — so
    the filtering has to happen here or not at all.
    """
    if not isinstance(ids, list):
        return []
    if allowed is None:
        return [int(i) for i in ids]
    keep = {int(c) for c in allowed}
    return [int(i) for i in ids if int(i) in keep]


def _scope_area_maps(access: EffectiveAccess) -> Dict[str, Any]:
    """
    The territory maps, trimmed to what this account may see.

    A viewer scoped to SALALAH has no use for CAPITAL's id list and should not
    be handed it; an ALL grant gets the map whole.
    """
    data = load_area_map()
    if access.all_areas:
        return {"areas": data.get("areas") or {}, "salesmanAreas": data.get("salesmanAreas") or {}}

    allowed = set(access.areas)
    sareas = {k: v for k, v in (data.get("salesmanAreas") or {}).items() if k in allowed}
    # The ERP areas are a reporting filter, not a territory, so they are scoped
    # by which of THEIR customers are in reach rather than by name.
    granted = set(granted_customer_ids(access) or [])
    areas = {}
    for name, slot in (data.get("areas") or {}).items():
        visible = [i for i in (slot.get("customerIds") or []) if i in granted]
        if visible:
            areas[name] = {**slot, "customerIds": visible, "customerCount": len(visible)}
    return {"areas": areas, "salesmanAreas": sareas}


async def bootstrap(access: EffectiveAccess) -> Dict[str, Any]:
    """
    The dashboard's reference data — months, supervisors, SKU catalogue, the
    customers in reach, and the territory maps — already scoped to the caller.
    """
    raw = await _rpc("ng2_bootstrap", {})
    if not isinstance(raw, dict) or not raw.get("skus"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The Sales Dashboard data source has no published data yet.",
        )

    allowed = granted_customer_ids(access)
    return {
        "months": raw.get("months") or [],
        "supervisors": raw.get("supervisors") or [],
        # The SKU catalogue is product data, not customer data — the same for
        # everyone, and nothing about it is territory-scoped.
        "skus": raw.get("skus") or {},
        "custs": _scope_customer_dict(raw.get("custs"), allowed),
        **_scope_area_maps(access),
    }


async def dashboard(access: EffectiveAccess, filters: Dict[str, Any]) -> Dict[str, Any]:
    """
    One dashboard view, scoped to the caller's territories.

    ``filters`` carries the viewer's own selections. Its customer list is
    treated as a REQUEST, not an instruction: it is intersected with the grant,
    so it can only ever narrow. The response is then cut down again, because two
    of the fields the RPC returns ignore the filter it was given.
    """
    allowed = granted_customer_ids(access)
    scope = intersect_scope(allowed, filters.get("p_customers"))

    raw = await _rpc("ng2_dashboard", {**filters, "p_customers": scope})
    if not isinstance(raw, dict):
        return {"trend": [], "skus": [], "custs": [], "custIds": []}

    return {
        **raw,
        # Re-scoped on the way out: see _scope_id_list.
        "custIds": _scope_id_list(raw.get("custIds"), allowed),
    }
