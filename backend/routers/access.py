"""
Portal access router.

``GET /access/me`` is the authority on what the signed-in account may open. The
browser mirrors the same rule in ``frontend/src/lib/access.ts`` so it can hide a
tile without waiting for a round trip, but it must READ this on every boot
rather than trust the user object it cached at login: that object lives in
``localStorage``, where its holder can edit it.

``GET /access/catalog`` hands the User Management screen the vocabulary — roles
and their defaults, modules, channels — so the pickers offer exactly what this
build enforces and cannot drift from it.

Neither endpoint is itself a gate. The gates are ``require_module`` on the
routers that serve the data.
"""
from fastapi import APIRouter, Depends

from backend.constants import (
    ALL_AREAS,
    CHANNEL_LABELS,
    ROLE_DEFAULT_AREAS,
    ROLE_MODULES,
    ROLE_LABELS,
    DashboardRole,
    PortalModule,
)
from backend.dependencies import get_current_user, require_module
from backend.schemas.access import (
    AccessCatalogOut,
    ChannelOut,
    EffectiveAccessOut,
    RoleDefaultsOut,
    TerritoryCatalogOut,
    TerritoryOut,
)
from backend.services.access_service import access_for
from backend.services.sales_data_service import load_area_map, fetch_area_map_from_rpc

router = APIRouter(prefix="/access", tags=["access"])


@router.get("/me", response_model=EffectiveAccessOut)
async def read_my_access(current_user=Depends(get_current_user)):
    """The resolved access of the signed-in account."""
    return EffectiveAccessOut.of(
        current_user.user_type, access_for(current_user, current_user.user_type)
    )


@router.get("/catalog", response_model=AccessCatalogOut)
async def read_access_catalog(_=Depends(get_current_user)):
    """Roles, modules and channels this build enforces."""
    return AccessCatalogOut(
        modules=list(PortalModule),
        channels=[
            ChannelOut(channel=c, label=label) for c, label in CHANNEL_LABELS.items()
        ],
        roles=[
            RoleDefaultsOut(
                role=role,
                label=ROLE_LABELS[role],
                modules=list(ROLE_MODULES[role]),
                areas=list(ROLE_DEFAULT_AREAS[role]),
            )
            for role in DashboardRole
        ],
        all_areas=ALL_AREAS,
    )


@router.get("/territories", response_model=TerritoryCatalogOut)
async def read_territories(_=Depends(require_module(PortalModule.USER_ADMIN))):
    """
    Supervisor areas a grant may name, fetched live from the legacy Supabase
    ``ng2_bootstrap`` RPC so the picker and enforcement share the same source.

    The live fetch also warms the in-process cache used by territory-scoping,
    so the first dashboard request after boot does not have to wait for it.
    """
    sareas = await fetch_area_map_from_rpc()
    if not sareas:
        # RPC unavailable — fall back to the static file if it has data.
        data = load_area_map()
        sareas = data.get("salesmanAreas") or {}

    return TerritoryCatalogOut(
        source_dated=None,   # live data has no file date
        territories=[
            TerritoryOut(
                name=name,
                direct=slot.get("direct") or 0,
                van=slot.get("van") or 0,
                direct_reach=len(slot.get("directIds") or []),
                van_reach=len(slot.get("vanIds") or []),
                both_reach=len(slot.get("customerIds") or []),
            )
            for name, slot in sorted(sareas.items())
        ],
    )
