import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import {
  ALL_AREAS,
  CHANNEL_LABELS,
  DashboardRole,
  PortalModule,
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
 * `modules` and `areas` are the EXPLICIT grant. Empty means "inherit the role
 * default" — not "grant nothing" — which is why the notes below say which of
 * the two the account is currently on. To give somebody nothing, move them to a
 * role whose default is nothing, or deactivate them.
 */
export interface GrantDraft {
  role: DashboardRole;
  modules: PortalModule[];
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
}

/**
 * The role / module / territory half of the dashboard-user form.
 *
 * A GRANT IS A CHANNEL **AND** AN AREA, in that order, because that is the
 * order the ask was made in: pick Key Sales or Van Sales, then pick the areas.
 * The channel selector narrows the area list under it, and that narrowing is
 * not cosmetic — BATHINA and SHARQIYA have no key accounts at all and
 * 'CAPITAL 1' has no van routes, so offering those pairs would write a grant
 * that reaches nothing and looks, on screen, exactly like a quiet month.
 *
 * THE AREA NAMES ARE STORED VERBATIM. Every option's text IS its value, the
 * exact string the backend matches character-for-character. Nothing here
 * tidies, trims or prefixes a name: 'CAPITAL' and 'CAPITAL 1' are two different
 * territories to the people who own them.
 */
export function AccessGrantEditor({ catalog, value, onChange, lockSelf }: Props) {
  // The territory list comes from the backend's copy of the generated map — the
  // same file the scoping enforces with — so the screen that WRITES a grant and
  // the code that ENFORCES one cannot disagree about what a territory holds.
  const [territories, setTerritories] = useState<TerritoryCatalog | null>(null);
  const [territoryError, setTerritoryError] = useState(false);

  useEffect(() => {
    api
      .get('/access/territories')
      .then((res) => setTerritories(res.data))
      .catch(() => setTerritoryError(true));
  }, []);

  const roleDefaults = useMemo(
    () => catalog?.roles.find((r) => r.role === value.role) ?? null,
    [catalog, value.role]
  );

  const offered: Territory[] = useMemo(
    () => (territories ? territoriesForChannel(territories.territories, value.channel) : []),
    [territories, value.channel]
  );

  const byName = useMemo(
    () => new Map((territories?.territories ?? []).map((t) => [t.name, t])),
    [territories]
  );

  const set = (patch: Partial<GrantDraft>) => onChange({ ...value, ...patch });

  /**
   * Changing the channel re-offers the territory list, keeping any pick that
   * survives the narrowing. A pick that does not survive is dropped rather than
   * silently re-labelled: switching to Key Sales cannot turn a BATHINA grant
   * into a pair that reaches nobody.
   */
  const changeChannel = (channel: SalesChannel | null) => {
    if (!territories) return set({ channel, areas: [] });
    const survivors = new Set(
      territoriesForChannel(territories.territories, channel).map((t) => t.name)
    );
    set({ channel, areas: value.areas.filter((a) => survivors.has(a)) });
  };

  const toggleModule = (module: PortalModule) =>
    set({
      modules: value.modules.includes(module)
        ? value.modules.filter((m) => m !== module)
        : [...value.modules, module],
    });

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
        <select
          value={value.role}
          disabled={disabled}
          onChange={(e) => set({ role: e.target.value as DashboardRole })}
          className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        >
          {(catalog?.roles ?? []).map((r) => (
            <option key={r.role} value={r.role}>
              {r.role} — {r.label}
            </option>
          ))}
        </select>
        {roleDefaults && (
          <p className="text-xs text-on-surface-variant">
            By default this role opens{' '}
            <span className="font-semibold">
              {roleDefaults.modules.length ? roleDefaults.modules.join(', ') : 'nothing'}
            </span>{' '}
            and reaches{' '}
            <span className="font-semibold">
              {roleDefaults.areas.includes(ALL_AREAS)
                ? 'every territory'
                : roleDefaults.areas.length
                  ? roleDefaults.areas.join(', ')
                  : 'no customers'}
            </span>
            .
          </p>
        )}
      </div>

      {/* ── Modules ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Modules
        </label>
        <div className="flex flex-wrap gap-2">
          {(catalog?.modules ?? []).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                value.modules.includes(m)
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-outline-variant bg-surface-container-lowest text-on-surface'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={value.modules.includes(m)}
                disabled={disabled}
                onChange={() => toggleModule(m)}
              />
              {m}
            </label>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant">
          {value.modules.length
            ? 'Explicitly granted — these replace the role default entirely.'
            : 'Nothing ticked, so this account INHERITS its role default. Ticking anything replaces it for this user only; unticking everything puts it back.'}
        </p>
      </div>

      {/* ── Sales channel ────────────────────────────────────────────────── */}
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
          {value.channel
            ? `Stored as channel = '${value.channel}' on every area picked. Only the territories that have ${CHANNEL_LABELS[value.channel]} customers are offered below — the rest would reach nobody.`
            : 'Stored as no channel, which reaches both books. All territories are offered.'}
        </p>
      </div>

      {/* ── Supervisor areas ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Supervisor area
        </label>

        {territoryError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The territory list could not be read from the server, so no territory can be picked.
            Check that
            <code className="mx-1 rounded bg-amber-100 px-1">backend/data/area_customers.json</code>
            is present and readable.
          </p>
        ) : !territories ? (
          <p className="text-xs text-on-surface-variant">Loading territories…</p>
        ) : offered.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {/* An empty list because the map did not load reads exactly like
                "this channel has no territories", which is a different and much
                more alarming statement. Say which it is. */}
            {territories.territories.length === 0
              ? 'The territory map is empty — regenerate backend/data/area_customers.json from the customer master.'
              : `No territory has ${value.channel ? CHANNEL_LABELS[value.channel] : ''} customers, so none can be granted under this channel.`}
          </p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-2">
            {/* ALL belongs to the both-channels state only: it means every area
                of both books, and the database refuses to pair it with a
                channel rather than inventing a third thing. */}
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
              // ALL is every territory by definition, so naming one alongside
              // it is noise. The individual picks are disabled rather than
              // hidden so it stays clear what ALL replaced.
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
              Explicitly granted — reaches <span className="font-semibold">{totalReach}</span>{' '}
              customers matched to sales data. This replaces the role default entirely.
            </>
          ) : (
            <>
              Nothing picked, so this account INHERITS its role default. Untick everything to put a
              configured account back on it.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
