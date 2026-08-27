"""
Portal access schemas.

Two shapes cross the wire:

* :class:`EffectiveAccessOut` — what the signed-in caller may do and see, fully
  resolved. The browser mirrors the same rule so it can hide a tile without a
  round trip, but it must READ this rather than compute it from a cached user
  object: a permission held in ``localStorage`` is a permission its holder can
  edit.
* :class:`AccessCatalogOut` — the vocabulary the User Management screen builds
  its pickers from, so the roles, modules and channels on screen are the ones
  this build actually enforces.
"""
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from backend.constants import DashboardRole, PortalModule, SalesChannel
from backend.core.access import EffectiveAccess


class RoleDefaultsOut(BaseModel):
    """What one role grants before any explicit override."""

    role: DashboardRole
    label: str
    modules: List[PortalModule]
    areas: List[str]


class ChannelOut(BaseModel):
    channel: SalesChannel
    label: str


class AccessCatalogOut(BaseModel):
    """The access vocabulary, for building the admin pickers."""

    modules: List[PortalModule]
    channels: List[ChannelOut]
    roles: List[RoleDefaultsOut]
    #: The sentinel area meaning "every territory, present and future".
    all_areas: str


class TerritoryOut(BaseModel):
    """
    One supervisor area, as the grant picker needs to describe it.

    COUNTS ONLY, never the customer id lists the map also holds. The picker has
    to say how many customers a grant would reach; it has no need to know which
    ones, and handing an admin screen the full territory-to-customer mapping
    would put the thing the scoping protects into a second place.
    """

    name: str
    #: Customers in the master, per book. What a territory nominally holds.
    direct: int
    van: int
    #: Customers matched to sales data, per book. What a grant actually REACHES —
    #: CAPITAL's 121 key accounts are 112 ids, and quoting the first number puts
    #: a figure above the picker that no grant made with it can deliver.
    direct_reach: int
    van_reach: int
    both_reach: int


class TerritoryCatalogOut(BaseModel):
    territories: List[TerritoryOut]
    #: When the underlying customer master was exported, so an admin can tell
    #: whether a territory they expected is missing or merely not yet regenerated.
    source_dated: Optional[str] = None


class EffectiveAccessOut(BaseModel):
    """One account's resolved access. Modules come strictly from the role."""

    user_type: str
    role: Optional[DashboardRole] = None
    modules: List[PortalModule]
    areas: List[str]
    area_channels: Dict[str, SalesChannel] = Field(default_factory=dict)
    all_areas: bool
    explicit_areas: bool

    @classmethod
    def of(cls, user_type: str, access: EffectiveAccess) -> "EffectiveAccessOut":
        """Project a resolved :class:`EffectiveAccess` onto the wire shape."""
        return cls(
            user_type=user_type,
            role=access.role,
            modules=list(access.modules),
            areas=list(access.areas),
            area_channels=dict(access.area_channels),
            all_areas=access.all_areas,
            explicit_areas=access.explicit_areas,
        )


class GrantIn(BaseModel):
    """
    The grant half of a dashboard-user create or update.
    Only area grants are accepted — modules are strictly determined by role.
    """

    areas: Optional[List[str]] = None
    #: Applied to every area in the same save. ``None`` stores a NULL channel,
    #: which reaches both books.
    channel: Optional[SalesChannel] = None
