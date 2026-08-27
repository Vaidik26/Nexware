/**
 * The Sales Dashboard's data layer.
 *
 * IT TALKS TO OUR BACKEND, NOT TO THE SALES-APP SUPABASE PROJECT. That project
 * still holds the sales history, but the browser has no route to it any more:
 * `/sales-dashboard/*` on our API calls it server-side, applies the signed-in
 * account's territory grant, and cuts the response down to it before replying.
 *
 * What that fixed, and why it could not be fixed here:
 *
 *  · the project's anon key used to be in this bundle, so the customer filter
 *    was advisory — anyone could call the RPC themselves and omit it;
 *  · `ng2_dashboard` ignores `p_customers` when building its `custIds` reply,
 *    and `ng2_bootstrap` returns all 3,859 customer names, so even a correctly
 *    scoped call handed over the whole customer master.
 *
 * Both are now handled on the server. Nothing in this file decides what the
 * viewer may see; it asks, and the backend answers with what is theirs.
 */
import api from '@/lib/api';

let BOOT: any = null;
let BOOT_PROMISE: Promise<any> | null = null;

/** The dashboard's filter state, as the UI holds it. */
export interface DashboardQuery {
  start: Date;
  end: Date;
  channel: string;
  active: string;
  products: Set<string>;
  skus: Set<string>;
  customers: Set<string>;
}

const asDate = (d: Date) => d.toISOString().split('T')[0];

/**
 * Reference data: month range, supervisors, SKU catalogue, and the customers
 * and territories this account reaches.
 *
 * Cached per session like before. The cache is keyed to nothing because the
 * answer is per-account and a sign-out clears the page — but `resetBootstrap`
 * exists for the case where that assumption stops holding.
 */
export async function loadBootstrap() {
  if (BOOT) return BOOT;
  if (BOOT_PROMISE) return BOOT_PROMISE;

  BOOT_PROMISE = (async () => {
    const res = await api.get('/sales-dashboard/bootstrap', { bypassCache: true } as any);
    const b = res.data || {};
    if (!b.skus) throw new Error('No published data yet in the sales database.');

    // The catalogue is a sorted, named view of the SKU dictionary. Built here
    // rather than server-side because it is presentation shaping — the backend
    // returns the SKU data as the source holds it.
    const catalogue = Object.entries(b.skus as Record<string, any[]>)
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([code, att]: any) => ({
        code,
        desc: att[0] || code,
        product: att[1] || 'Other',
        cat: att[2] || 'OTHER ITEMS',
        active: att[4] === 0 ? 0 : 1,
      }));

    BOOT = {
      ...b,
      catalogue,
      areas: b.areas || {},
      salesmanAreas: b.salesmanAreas || {},
    };
    return BOOT;
  })().catch((err) => {
    BOOT_PROMISE = null;
    throw err;
  });

  return BOOT_PROMISE;
}

/** Drop the cached bootstrap — call on sign-out, or after a grant changes. */
export function resetBootstrap() {
  BOOT = null;
  BOOT_PROMISE = null;
}

/**
 * One dashboard view.
 *
 * `customers` is what the viewer filtered to. The backend intersects it with
 * the account's grant, so sending nothing falls back to the grant rather than
 * to everything — there is no argument this function can pass that widens the
 * result.
 */
export async function fetchDashboardView(query: DashboardQuery) {
  const res = await api.post(
    '/sales-dashboard/view',
    {
      start: asDate(query.start),
      end: asDate(query.end),
      channel: query.channel === 'all' ? null : query.channel,
      active: query.active === 'all' ? null : query.active,
      products: query.products.size ? [...query.products] : null,
      skus: query.skus.size ? [...query.skus] : null,
      customers: query.customers.size ? [...query.customers].map(Number) : null,
    },
    { bypassCache: true } as any
  );
  return res.data;
}
