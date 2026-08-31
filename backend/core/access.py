
from dataclasses import dataclass
from types import MappingProxyType
from typing import Iterable, Mapping, Optional, Sequence, Tuple

from backend.constants import (
    ALL_AREAS,
    ROLE_DEFAULT_AREAS,
    ROLE_MODULES,
    DashboardRole,
    PortalModule,
    SalesChannel,
)

_EMPTY_CHANNELS: Mapping[str, SalesChannel] = MappingProxyType({})


@dataclass(frozen=True)
class EffectiveAccess:
    """
    What one account may do and see, after the rule has been applied.
    """

    #: The base role, or ``None`` for a persona that has no dashboard role
    #: (admins, pickers, sales reps).
    role: Optional[DashboardRole]
    modules: Tuple[PortalModule, ...]
    areas: Tuple[str, ...]
    #: area -> channel, for the areas that are channel-scoped. An area ABSENT
    #: from this map carries the null channel: both books. A map rather than a
    #: list parallel to ``areas`` because a positional pairing holds only while
    #: both are built in the same order, and getting it wrong labels one area
    #: with another's channel.
    area_channels: Mapping[str, SalesChannel]
    explicit_areas: bool

    @property
    def all_areas(self) -> bool:
        """True when this account is scoped to every territory, present and future."""
        return ALL_AREAS in self.areas

    @property
    def scoped(self) -> bool:
        """
        True when the caller must filter by territory before showing anything.
        """
        return not self.all_areas

    def has_module(self, module: PortalModule) -> bool:
        return module in self.modules

    def area_allowed(self, area: Optional[str]) -> bool:
        """
        Is ``area`` — a SUPERVISOR area — within this account's scope?
        """
        if not area:
            return False
        return self.all_areas or area in self.areas

    def channel_for(self, area: str) -> Optional[SalesChannel]:
        """The channel this area is narrowed to, or ``None`` meaning both books."""
        return self.area_channels.get(area)


#: The answer for anyone with no portal standing at all
NO_ACCESS = EffectiveAccess(
    role=None,
    modules=(),
    areas=(),
    area_channels=_EMPTY_CHANNELS,
    explicit_areas=False,
)

#: The answer for the platform operator persona (``admin_users``).
PORTAL_OWNER = EffectiveAccess(
    role=None,
    modules=tuple(PortalModule),
    areas=(ALL_AREAS,),
    area_channels=_EMPTY_CHANNELS,
    explicit_areas=False,
)


def parse_role(role: Optional[str]) -> Optional[DashboardRole]:
    """Turn a stored role string into a :class:`DashboardRole`, or ``None``."""
    if not role:
        return None
    try:
        return DashboardRole(role)
    except ValueError:
        return None


def parse_channel(channel: Optional[str]) -> Optional[SalesChannel]:
    """Turn a stored channel string into a :class:`SalesChannel`, or ``None``."""
    if not channel:
        return None
    try:
        return SalesChannel(channel)
    except ValueError:
        return None


def resolve(
    role: Optional[str],
    explicit_areas: Optional[Iterable[Tuple[str, Optional[str]]]] = None,
) -> EffectiveAccess:
    """
    Apply the rule to one account's stored role and area grant rows.

    :param role: the ``dashboard_users.role`` value, verbatim.
    :param explicit_areas: ``(area, channel)`` pairs from
        ``dashboard_user_areas``; ``channel`` is ``None`` for a both-books grant.
    """
    parsed_role = parse_role(role)
    if parsed_role is None:
        return NO_ACCESS

    modules = ROLE_MODULES[parsed_role]

    areas: list[str] = []
    channels: dict[str, SalesChannel] = {}
    for area, channel in explicit_areas or ():
        if not area or area in areas:
            continue
        areas.append(area)
        parsed_channel = parse_channel(channel)
        if parsed_channel is not None:
            channels[area] = parsed_channel

    explicit_area_grant = bool(areas)
    if not explicit_area_grant:
        areas = list(ROLE_DEFAULT_AREAS[parsed_role])
        channels = {}

    return EffectiveAccess(
        role=parsed_role,
        modules=tuple(modules),
        areas=tuple(areas),
        area_channels=MappingProxyType(channels),
        explicit_areas=explicit_area_grant,
    )


def refuse_grant(
    areas: Sequence[str], channel: Optional[SalesChannel]
) -> Optional[str]:
    """
    Check an area grant *before* it is written, returning a reason to refuse it.

    Returns ``None`` when the grant is storable. The database's CHECK
    constraints enforce the same two rules, but reaching them means the refusal
    arrives as a constraint-violation traceback rather than a sentence an
    operator can act on.

    Membership of the nine territories is deliberately NOT checked. The
    supervisor-area list comes from the customer master and is regenerated
    whenever that changes; pinning it here would make a legitimately new
    territory unassignable until the backend was redeployed. What a typo costs
    instead is visibility, not secrecy: an area nobody owns matches no customer,
    and :attr:`EffectiveAccess.scoped` keeps that closed.
    """
    if channel is not None and ALL_AREAS in areas:
        return (
            f"'{ALL_AREAS}' means every supervisor area of both books, so it cannot also "
            "name a sales channel. Grant ALL on its own, or list the individual areas "
            "you want narrowed to that channel."
        )
    if any(not area.strip() for area in areas):
        return "A supervisor area cannot be blank."
    return None
