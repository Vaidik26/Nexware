import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import {
  ALL_AREAS,
  CHANNEL_LABELS,
  DashboardRole,
  PortalModule,
  ROLE_HAS_AREAS,
  ROLE_HAS_CHANNEL,
  ROLE_MODULES,
  SalesChannel,
  Territory,
  TerritoryCatalog,
  grantReach,
  grantReachesNobody,
  territoriesForChannel,
} from '@/lib/access';

/**
 * What the form holds while a dashboard account is being edited.
 *
 * Modules are NOT here — they are strictly determined by role and cannot be
 * overridden per user. Only area grants are stored explicitly.
 */
export interface GrantDraft {
  role: DashboardRole;
  areas: string[];
  channel: SalesChannel | null;
}

/** One role's defaults, as served by GET /access/catalog. */
export interface RoleDefaults {
  role: DashboardRole;
  label: string;
  modules: PortalModule[];
  areas: string[];
}

export interface AccessCatalog {
  modules: PortalModule[];
  channels: { channel: SalesChannel; label: string }[];
  roles: RoleDefaults[];
  all_areas: string;
}

interface Props {
  catalog: AccessCatalog | null;
  value: GrantDraft;
  onChange: (next: GrantDraft) => void;
  /** True when editing your own account — role and grants go read-only. */
  lockSelf?: boolean;
  /**
   * When set, restricts the role dropdown to this list.
   * A MANAGER caller passes ['SALES'] so they cannot promote anyone.
   */
  assignableRoles?: DashboardRole[];
}

export function AccessGrantEditor({ catalog, value, onChange, lockSelf, assignableRoles }: Props) {
  const [territories, setTerritories] = useState<TerritoryCatalog | null>(null);
  const [territoryError, setTerritoryError] = useState(false);

  useEffect(() => {
    api
      .get('/access/territories')
      .then((res) => setTerritories(res.data))
      .catch(() => setTerritoryError(true));
  }, []);


  const offeredRoles = useMemo(() => {
    const all = catalog?.roles ?? [];
    if (assignableRoles && assignableRoles.length > 0) {
      return all.filter((r) => assignableRoles.includes(r.role));
    }
    return all;
  }, [catalog, assignableRoles]);

  const hasAreas   = ROLE_HAS_AREAS[value.role]   ?? false;
  const hasChannel = ROLE_HAS_CHANNEL[value.role]  ?? false;
  const fixedMods  = ROLE_MODULES[value.role]      ?? [];

  const offered: Territory[] = useMemo(
    () => (territories ? territoriesForChannel(territories.territories, value.channel) : []),
    [territories, value.channel]
  );

  const byName = useMemo(
    () => new Map((territories?.territories ?? []).map((t) => [t.name, t])),
    [territories]
  );

  const set = (patch: Partial<GrantDraft>) => onChange({ ...value, ...patch });

  const changeRole = (role: DashboardRole) => {
    // When role changes, clear areas/channel if the new role doesn't use them.
    set({
      role,
      areas: ROLE_HAS_AREAS[role] ? value.areas : [],
      channel: ROLE_HAS_CHANNEL[role] ? value.channel : null,
    });
  };

  const changeChannel = (channel: SalesChannel | null) => {
    if (!territories) return set({ channel, areas: [] });
    const survivors = new Set(
      territoriesForChannel(territories.territories, channel).map((t) => t.name)
    );
    set({ channel, areas: value.areas.filter((a) => survivors.has(a)) });
  };

  const toggleArea = (area: string) =>
    set({
      areas: value.areas.includes(area)
        ? value.areas.filter((a) => a !== area)
        : [...value.areas, area],
    });

  const totalReach = value.areas.reduce((n, a) => {
    const t = byName.get(a);
    return n + (t ? grantReach(t, value.channel) : 0);
  }, 0);

  const disabled = !!lockSelf;
  const roleIsLocked = disabled || (assignableRoles !== undefined && assignableRoles.length < 2);

  return (
    <div className="space-y-5 rounded-xl border border-outline-variant bg-surface-container/40 p-4">
      {lockSelf && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This is your own account. Your role and grants are read-only — changing your own access
          is the one edit a user administrator must not make alone. Ask another one.
        </p>
      )}

      {/* ── Role ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Role
        </label>

        {roleIsLocked && !lockSelf && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            A Sales Manager may create <b>Sales Users only</b>. Managers and Procurement Managers
            are created by a system administrator.
          </p>
        )}

        <select
          value={value.role}
          disabled={disabled || roleIsLocked}
          onChange={(e) => changeRole(e.target.value as DashboardRole)}
          className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        >
          {offeredRoles.map((r) => (
            <option key={r.role} value={r.role}>
              {r.role} — {r.label}
            </option>
          ))}
        </select>

        {/* Role blurb: fixed modules + area scope description */}
        <div className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant space-y-0.5">
          <p>
            <span className="font-semibold">Opens: </span>
            {fixedMods.length
              ? fixedMods.join(', ')
              : <span className="italic">nothing</span>}
          </p>
          {value.role === 'SALES' && (
            <p>Sales Dashboard, filtered to the channel and supervisor area configured below.</p>
          )}
          {value.role === 'MANAGER' && (
            <p>
              Sales Dashboard for <b>every</b> supervisor area in the channel set below, plus User
              Management (can create Sales Users only).
            </p>
          )}
          {value.role === 'FINANCE' && (
            <p>Buying Desk only — no channel or supervisor area applies.</p>
          )}
        </div>
      </div>

      {/* ── Sales channel (SALES + MANAGER only) ─────────────────────────── */}
      {hasChannel && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Sales channel
          </label>
          <select
            value={value.channel ?? ''}
            disabled={disabled}
            onChange={(e) => changeChannel((e.target.value || null) as SalesChannel | null)}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            <option value="">Both channels — key accounts and van routes</option>
            {(catalog?.channels ?? []).map((c) => (
              <option key={c.channel} value={c.channel}>
                {c.label} only
              </option>
            ))}
          </select>
          <p className="text-xs text-on-surface-variant">
            {value.role === 'MANAGER'
              ? value.channel
                ? `Sales Manager sees every supervisor area, ${CHANNEL_LABELS[value.channel]} book only.`
                : 'Sales Manager sees every supervisor area, both books.'
              : value.channel
                ? `Stored as channel = '${value.channel}'. Only territories with ${CHANNEL_LABELS[value.channel]} customers are offered below.`
                : 'Stored as no channel — both books. All territories are offered.'}
          </p>
        </div>
      )}

      {/* ── Supervisor areas (SALES only) ────────────────────────────────── */}
      {hasAreas && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Supervisor area
          </label>

          {territoryError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The territory list could not be read from the server.
              Check that{' '}
              <code className="mx-1 rounded bg-amber-100 px-1">backend/data/area_customers.json</code>
              is present and readable.
            </p>
          ) : !territories ? (
            <p className="text-xs text-on-surface-variant">Loading territories…</p>
          ) : offered.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {territories.territories.length === 0
                ? 'The territory map is empty — regenerate backend/data/area_customers.json from the customer master.'
                : `No territory has ${value.channel ? CHANNEL_LABELS[value.channel] : ''} customers under this channel.`}
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-2">
              {!value.channel && (
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-container ${
                    disabled ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={value.areas.includes(ALL_AREAS)}
                    disabled={disabled}
                    onChange={() => toggleArea(ALL_AREAS)}
                  />
                  <span className="font-semibold">{ALL_AREAS}</span>
                  <span className="text-xs text-on-surface-variant">
                    every supervisor area, both channels, including ones added later
                  </span>
                </label>
              )}

              {offered.map((territory) => {
                const reach = grantReach(territory, value.channel);
                const empty = grantReachesNobody(territory, value.channel);
                const supersededByAll = value.areas.includes(ALL_AREAS);
                return (
                  <label
                    key={territory.name}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-container ${
                      disabled || supersededByAll ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={value.areas.includes(territory.name)}
                      disabled={disabled || supersededByAll}
                      onChange={() => toggleArea(territory.name)}
                    />
                    <span className="font-medium">{territory.name}</span>
                    <span className="ml-auto text-xs text-on-surface-variant">
                      {empty ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> reaches nobody
                        </span>
                      ) : (
                        `${reach} customers`
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <p className="text-xs text-on-surface-variant">
            {value.areas.includes(ALL_AREAS) ? (
              <>Every territory, both books.</>
            ) : value.areas.length ? (
              <>
                Reaches <span className="font-semibold">{totalReach}</span> customers matched to
                sales data.
              </>
            ) : (
              <>No supervisor area selected — this account will reach no customers.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
