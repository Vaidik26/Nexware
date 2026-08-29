/**
 * The browser's mirror of the portal access rule.
 *
 * The ENFORCING copy is the backend — `backend/core/access.py` resolves the
 * same rule, and `require_module` refuses a request that this file would have
 * hidden a tile for. This exists so the sidebar can hide that tile without a
 * round trip, and so the User Management screen can offer only grants the
 * database will accept. If the two ever disagree, the backend wins and this
 * file is the bug.
 *
 * Nothing here derives an account's access from anything cached. `EffectiveAccess`
 * arrives already resolved from `GET /access/me`, which is re-read on every boot:
 * the user object in localStorage is editable by whoever holds the browser, so a
 * permission read out of it is not a permission.
 */

export const PORTAL_MODULES = ['SALES_DASH', 'PROCUREMENT', 'USER_ADMIN'] as const;
export type PortalModule = (typeof PORTAL_MODULES)[number];

export const DASHBOARD_ROLES = ['FINANCE', 'MANAGER', 'SALES'] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export const SALES_CHANNELS = ['KEY', 'VAN'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

/** Every supervisor area, present and future. Not one of the territories. */
export const ALL_AREAS = 'ALL';

export const MODULE_LABELS: Record<PortalModule, string> = {
  SALES_DASH: 'Sales Dashboard',
  PROCUREMENT: 'Procurement Desk',
  USER_ADMIN: 'User Management',
};

export const ROLE_LABELS: Record<DashboardRole, string> = {
  SALES: 'Sales User',
  MANAGER: 'Sales Manager',
  FINANCE: 'Procurement Manager',
};

/** Modules are strictly fixed by role — no per-user overrides. */
export const ROLE_MODULES: Record<DashboardRole, PortalModule[]> = {
  SALES: ['SALES_DASH'],
  MANAGER: ['SALES_DASH', 'USER_ADMIN'],
  FINANCE: ['PROCUREMENT'],
};

/** Does this role carry supervisor areas? Only SALES. */
export const ROLE_HAS_AREAS: Record<DashboardRole, boolean> = {
  SALES: true,
  MANAGER: false,
  FINANCE: false,
};

/** Does this role have a sales channel configured? SALES + MANAGER. */
export const ROLE_HAS_CHANNEL: Record<DashboardRole, boolean> = {
  SALES: true,
  MANAGER: true,
  FINANCE: false,
};

export const CHANNEL_LABELS: Record<SalesChannel, string> = {
  KEY: 'Key Sales',
  VAN: 'Van Sales',
};

export interface EffectiveAccess {
  user_type: string;
  role: DashboardRole | null;
  modules: PortalModule[];
  areas: string[];
  /** area -> channel. An area absent from this map reaches both books. */
  area_channels: Record<string, SalesChannel>;
  all_areas: boolean;
  explicit_areas: boolean;
}


/**
 * One supervisor area, as `GET /access/territories` describes it.
 *
 * COUNTS, NOT ID LISTS. The picker has to say how many customers a grant would
 * reach; it has no need to know which ones, and the backend does not send them.
 */
export interface Territory {
  name: string;
  /** Customers in the master, per book — not all are matched to sales data. */
  direct: number;
  van: number;
  /** Matched customers, per book. THIS is what a grant actually reaches. */
  direct_reach: number;
  van_reach: number;
  both_reach: number;
}

export interface TerritoryCatalog {
  territories: Territory[];
  source_dated: string | null;
}

// ── Asking the access questions ──────────────────────────────────────────────

export const hasModule = (access: EffectiveAccess | null, module: PortalModule): boolean =>
  !!access && access.modules.includes(module);

/**
 * Admins own the portal outright — every module, and the screens that belong to
 * no module at all (warehouse, delivery, market intelligence, master data).
 *
 * Those screens are served by admin-gated endpoints, so this is not a rule this
 * file invents: it is what the backend already enforces, mirrored so the sidebar
 * does not offer a link that would 403.
 */
export const ownsPortal = (access: EffectiveAccess | null): boolean =>
  access?.user_type === 'admin';

/**
 * Is `area` — a SUPERVISOR area — within this account's scope?
 *
 * Matched exactly. 'CAPITAL 1' is not 'CAPITAL', the ERP area 'CAPITAL-1' is
 * nobody's territory, and a blank area (an unassigned customer) belongs to
 * whoever sees everything, not to whoever asks first.
 */
export const areaAllowed = (access: EffectiveAccess | null, area: string | null): boolean => {
  if (!access || !area) return false;
  return access.all_areas || access.areas.includes(area);
};

/** The channel an area is narrowed to, or null meaning both books. */
export const channelFor = (
  access: EffectiveAccess | null,
  area: string
): SalesChannel | null => access?.area_channels?.[area] ?? null;

/** What to call a channel on screen. null is a real answer and says so. */
export const channelLabel = (channel: SalesChannel | null | undefined): string =>
  channel ? CHANNEL_LABELS[channel] ?? `${channel} (unknown channel)` : 'both channels';

export const grantLabel = (area: string, channel: SalesChannel | null): string =>
  area === ALL_AREAS ? area : `${area} · ${channelLabel(channel)}`;

// A grant no longer becomes a list of customer ids in the browser. That
// translation is `granted_customer_ids` in backend/services/sales_data_service.py,
// applied to every dashboard query server-side — doing it here as well would be
// a second copy of the rule that could disagree with the enforcing one, and
// would need the territory-to-customer map in the bundle to do it.

// ── Routing ──────────────────────────────────────────────────────────────────

/** The screen each module opens. One entry per module, and no module has two. */
export const MODULE_ROUTES: Record<PortalModule, string> = {
  SALES_DASH: '/dashboard/sales',
  PROCUREMENT: '/dashboard/procurement',
  USER_ADMIN: '/admin/users',
};

/**
 * Where to send this account after login, or when it asks for `/`.
 *
 * Admins land on the executive summary, as before. Everyone else lands on the
 * first module they hold, in the order above. An account holding nothing gets
 * `null` — the caller shows the "opens nothing" screen rather than bouncing
 * between redirects.
 */
export function landingPath(access: EffectiveAccess | null): string | null {
  if (ownsPortal(access)) return '/dashboard';
  const first = PORTAL_MODULES.find((m) => hasModule(access, m));
  return first ? MODULE_ROUTES[first] : null;
}

// ── The supervisor-area catalogue ────────────────────────────────────────────

/**
 * Which territories may be granted for a channel.
 *
 * Driven by the counts the backend reports, never by a hardcoded list: 7 of the
 * 9 areas hold Direct Sales customers and 5 hold Van Sales ones, and if the
 * customer master changes that, the picker follows without a code change.
 *
 * This is the UI guardrail — offering BATHINA under Key Sales would write a
 * grant that reaches nothing and looks, on screen, exactly like a quiet month.
 */
export function territoriesForChannel(
  territories: Territory[],
  channel: SalesChannel | null
): Territory[] {
  return territories.filter((t) => {
    if (channel === 'KEY') return t.direct > 0;
    if (channel === 'VAN') return t.van > 0;
    return true;
  });
}

/**
 * How many customers a territory/channel pair REACHES.
 *
 * The matched count, not the customer-master count: CAPITAL's 121 key accounts
 * are 112 matched ids, and printing the master figure puts a number above the
 * picker that no grant made with it can deliver.
 */
export function grantReach(
  territory: Territory,
  channel: SalesChannel | null
): number {
  if (channel === 'KEY') return territory.direct_reach;
  if (channel === 'VAN') return territory.van_reach;
  return territory.both_reach;
}

/**
 * True when this pair reaches nobody.
 *
 * The picker cannot offer such a pair, but the database only polices the VALUE
 * of the channel — so a row written by hand, or one left behind when the
 * customer master changed under it, can hold one. The scoping then fails
 * closed, correctly, but silently: the holder gets an empty dashboard that
 * reads like a quiet month. This is what lets the admin screen say so out loud.
 */
export function grantReachesNobody(
  territory: Territory,
  channel: SalesChannel | null
): boolean {
  if (!channel) return false;
  return channel === 'KEY' ? territory.direct === 0 : territory.van === 0;
}
