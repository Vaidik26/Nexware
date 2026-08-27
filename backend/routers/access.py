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
from backend.services.sales_data_service import load_area_map

router = APIRouter(prefix="/access", tags=["access"])


@router.get("/me", response_model=EffectiveAccessOut)
async def read_my_access(current_user=Depends(get_current_user)):
    """
    The resolved access of the signed-in account.

    Available to every authenticated persona, including those that hold nothing:
    a picker signing into the web portal gets an honest empty answer rather than
    a 403, so the client can say "your account opens nothing here" instead of
    "something went wrong".
    """
    return EffectiveAccessOut.of(
        current_user.user_type, access_for(current_user, current_user.user_type)
    )


@router.get("/catalog", response_model=AccessCatalogOut)
async def read_access_catalog(_=Depends(get_current_user)):
    """
    The roles, modules and channels this build enforces, with each role's
    defaults so the admin screen can show what a role grants before it is saved.
    """
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
    The supervisor areas a grant may name, with how many customers each reaches
    per channel.

    Behind USER_ADMIN because this is the grant picker's data and nobody else
    has a use for it. Served from the backend's own copy of the generated map —
    the same file the scoping enforces with — so the screen that WRITES a grant
    and the code that ENFORCES one cannot disagree about which customers a
    territory holds.

    The counts are what drive the picker's guardrail: an area with no Direct
    Sales customers is not offered under Key Sales, because that pair would
    write a grant reaching nothing and look, on screen, exactly like a quiet
    month.
    """
    data = load_area_map()
    areas = data.get("salesmanAreas") or {}
    return TerritoryCatalogOut(
        source_dated=data.get("sourceDated"),
        territories=[
            TerritoryOut(
                name=name,
                direct=slot.get("direct") or 0,
                van=slot.get("van") or 0,
                direct_reach=len(slot.get("directIds") or []),
                van_reach=len(slot.get("vanIds") or []),
                both_reach=len(slot.get("customerIds") or []),
            )
            for name, slot in sorted(areas.items())
        ],
    )
