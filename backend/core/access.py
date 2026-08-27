"""
The ONE portal access rule.

Two questions are answered here and nowhere else:

* **Which screens may this account open?**  A set of :class:`PortalModule`.
* **Whose data may it see?**  A set of supervisor areas, each optionally
  narrowed to one sales channel.

HYBRID INHERITANCE. Every dashboard account carries a base
:class:`DashboardRole`, and that role supplies a default answer to both
questions (``ROLE_DEFAULT_MODULES`` / ``ROLE_DEFAULT_AREAS`` in
``backend.constants``). An *explicit* grant on the account — one or more rows in
``dashboard_user_modules`` / ``dashboard_user_areas`` — replaces the default
outright rather than adding to it. Deleting every grant row is the only way back
to inheritance: an empty explicit list and "no explicit list" are the same
state, on purpose, because storing "explicitly nothing" and "inherit" as two
different things gives an admin two identical-looking screens with different
meanings. To give somebody nothing, deactivate them or move them to a role whose
default is nothing.

TWO AREA VOCABULARIES, AND A GRANT ONLY EVER SPEAKS THE SECOND.

* the customer's own ERP ``area`` (53 values: ``CAPITAL-1``, ``MABELAH 2``, …)
  is a *reporting* filter on the Sales dashboard. It is never a grant.
* the ``salesmanArea`` — the SUPERVISOR AREA that owns the customer, 9 values —
  is what gets granted and what :meth:`EffectiveAccess.area_allowed` is handed.

Nothing here trims, upper-cases or otherwise tidies an area name. A grant is an
exact string match, because two spellings really are two territories to the
people who own them: ``CAPITAL`` and ``CAPITAL 1`` are different supervisor
areas, and ``CAPITAL-1`` is not a territory at all.

FAILS CLOSED. An unrecognised role, a missing role, or a persona with no portal
standing resolves to :data:`NO_ACCESS` — no modules, no areas — rather than to
anything wider. That matters most for the area half: an empty area list read as
"no filter" by a caller downstream would answer with all-Oman numbers under a
"your territories only" badge, so :attr:`EffectiveAccess.scoped` states the
difference explicitly instead of leaving it to be inferred from an empty list.

This module is pure: no database, no request, no I/O. ``backend.core.access`` is
the rule, ``backend.services.access_service`` reads the grant rows that feed it,
and ``frontend/src/lib/access.ts`` mirrors it so the browser can hide a tile
without a round trip. This side is the enforcing copy.
"""
from dataclasses import dataclass
from types import MappingProxyType
from typing import Iterable, Mapping, Optional, Sequence, Tuple

from backend.constants import (
    ALL_AREAS,
    ROLE_DEFAULT_AREAS,
    ROLE_DEFAULT_MODULES,
    DashboardRole,
    PortalModule,
    SalesChannel,
)

_EMPTY_CHANNELS: Mapping[str, SalesChannel] = MappingProxyType({})


@dataclass(frozen=True)
class EffectiveAccess:
    """
    What one account may do and see, after the hybrid rule has been applied.

    ``modules`` and ``areas`` are the *resolved* answers — a caller never has to
    know whether they came from the role or from a grant. ``explicit_modules``
    and ``explicit_areas`` say which of the two it was, because the user-admin
    screen has to distinguish "inherits its role" from "was given exactly this".
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
    explicit_modules: bool
    explicit_areas: bool

    @property
    def all_areas(self) -> bool:
        """True when this account is scoped to every territory, present and future."""
        return ALL_AREAS in self.areas

    @property
    def scoped(self) -> bool:
        """
        True when the caller must filter by territory before showing anything.

        The distinction a bare ``areas`` list cannot make: ``()`` and
        ``(ALL,)`` both mean "no area names to filter on", but one of them must
        show nothing and the other must show everything.
        """
        return not self.all_areas

    def has_module(self, module: PortalModule) -> bool:
        return module in self.modules

    def area_allowed(self, area: Optional[str]) -> bool:
        """
        Is ``area`` — a SUPERVISOR area — within this account's scope?

        Matched exactly: ``CAPITAL 1`` is not ``CAPITAL``, and the ERP area
        ``CAPITAL-1`` is nobody's territory. A blank area (an unassigned
        customer) is never allowed: it belongs to whoever sees everything, not
        to whoever asks first.
        """
        if not area:
            return False
        return self.all_areas or area in self.areas

    def channel_for(self, area: str) -> Optional[SalesChannel]:
        """The channel this area is narrowed to, or ``None`` meaning both books."""
        return self.area_channels.get(area)


#: The answer for anyone with no portal standing at all — an unknown role, a
#: picker or sales rep who signed into the web portal, a role whose default is
#: nothing. Opens nothing and reaches nobody.
NO_ACCESS = EffectiveAccess(
    role=None,
    modules=(),
    areas=(),
    area_channels=_EMPTY_CHANNELS,
    explicit_modules=False,
    explicit_areas=False,
)

#: The answer for the platform operator persona (``admin_users``). Admins own
#: the portal outright: every module, every territory. Their standing comes from
#: which table their token names, not from a role column, so it is expressed
#: here as a constant rather than as a sixth role nobody can be assigned.
PORTAL_OWNER = EffectiveAccess(
    role=None,
    modules=tuple(PortalModule),
    areas=(ALL_AREAS,),
    area_channels=_EMPTY_CHANNELS,
    explicit_modules=False,
    explicit_areas=False,
)


def parse_role(role: Optional[str]) -> Optional[DashboardRole]:
    """
    Turn a stored role string into a :class:`DashboardRole`, or ``None``.

    ``None`` for anything the enum does not know. Callers treat that as no
    access rather than substituting a default, so a role that drifts out of the
    vocabulary — a hand-written row, a value retired in a later release —
    closes the account rather than quietly widening it.
    """
    if not role:
        return None
    try:
        return DashboardRole(role)
    except ValueError:
        return None


def parse_module(module: Optional[str]) -> Optional[PortalModule]:
    """Turn a stored module string into a :class:`PortalModule`, or ``None``."""
    if not module:
        return None
    try:
        return PortalModule(module)
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
    explicit_modules: Optional[Iterable[str]] = None,
    explicit_areas: Optional[Iterable[Tuple[str, Optional[str]]]] = None,
) -> EffectiveAccess:
    """
    Apply the hybrid rule to one account's stored role and grant rows.

    :param role: the ``dashboard_users.role`` value, verbatim.
    :param explicit_modules: module names from ``dashboard_user_modules``.
    :param explicit_areas: ``(area, channel)`` pairs from
        ``dashboard_user_areas``; ``channel`` is ``None`` for a both-books grant.

    An unknown role resolves to :data:`NO_ACCESS` *even when explicit grants
    exist*: a row naming a role this build does not have is a row nobody can
    reason about, and honouring half of it is worse than honouring none.
    """
    parsed_role = parse_role(role)
    if parsed_role is None:
        return NO_ACCESS

    # Unknown module names are dropped rather than rejected. The grant table's
    # CHECK constraint keeps them out in the first place; this is what happens
    # if a module is retired in a later release while its rows are still there.
    granted_modules = tuple(
        # de-duplicate, preserving the order they were granted in
        dict.fromkeys(
            m for m in (parse_module(x) for x in (explicit_modules or ())) if m
        )
    )
    modules = granted_modules or ROLE_DEFAULT_MODULES[parsed_role]

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
        explicit_modules=bool(granted_modules),
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
