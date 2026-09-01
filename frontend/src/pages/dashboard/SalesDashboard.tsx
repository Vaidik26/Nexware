import { useState, useEffect } from 'react';
import { loadBootstrap, fetchDashboardView } from '@/lib/salesDashboardApi';
import { useAuthStore } from '@/store/authStore';
import { grantLabel, channelFor } from '@/lib/access';
import SalesFilters from '@/components/sales-dashboard/SalesFilters';
import SalesKPIs from '@/components/sales-dashboard/SalesKPIs';
import SalesCharts from '@/components/sales-dashboard/SalesCharts';
import SalesDataTables from '@/components/sales-dashboard/SalesDataTables';

export default function SalesDashboard() {
  const access = useAuthStore((s) => s.access);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [filters, setFilters] = useState({
    period: 'last12',
    gran: 'month',
    channel: 'all',
    active: 'all',
    areas: new Set<string>(),
    sareas: new Set<string>(),
    categories: new Set<string>(),
    products: new Set<string>(),
    skus: new Set<string>(),
    customers: new Set<string>(),
    customStart: new Date('2021-01-01'),
    customEnd: new Date('2025-12-01')
  });

  const [bootData, setBootData] = useState<any>(null);

  useEffect(() => {
    loadBootstrap()
      .then((b) => {
        setBootData(b);
        fetchData(b, filters);
      })
      .catch((err: any) => {
        console.error(err);
        setError(
          err?.response?.data?.detail || err?.message || 'Could not load the sales data.'
        );
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The customers the VIEWER filtered to — area, supervisor area, or an
   * explicit pick — collapsed into one id list because the data source has no
   * area parameter of its own.
   *
   * This is a request, not a scope. The account's territory grant is applied on
   * the server and intersected with whatever comes from here, so nothing this
   * function returns can widen the result: an empty selection means "no filter
   * of my own", which the backend answers with the grant alone.
   *
   * The area maps it reads are themselves already scoped to the account, so a
   * territory the viewer cannot see is not in them to be selected.
   */
  const requestedCustomers = (b: any, currentFilters: any): Set<string> => {
    const sets: number[][] = [];

    if (currentFilters.sareas && currentFilters.sareas.size > 0) {
      const sCusts: number[] = [];
      currentFilters.sareas.forEach((s: string) => {
        if (b?.salesmanAreas?.[s]?.customerIds) {
          sCusts.push(...b.salesmanAreas[s].customerIds);
        }
      });
      sets.push(sCusts);
    }
    
    if (currentFilters.areas && currentFilters.areas.size > 0) {
      const aCusts: number[] = [];
      currentFilters.areas.forEach((a: string) => {
        if (b?.areas?.[a]?.customerIds) {
          aCusts.push(...b.areas[a].customerIds);
        }
      });
      sets.push(aCusts);
    }
    
    if (currentFilters.customers && currentFilters.customers.size > 0) {
      sets.push([...currentFilters.customers].map(Number));
    }

    if (sets.length === 0) return new Set();

    const keep = sets.reduce((a, bArr) => {
      const s = new Set(bArr.map(Number));
      return a.filter((id) => s.has(Number(id)));
    });

    // An intersection that came out empty must stay distinguishable from "no
    // filter". -1 matches no customer and survives the server-side intersection
    // as itself, so the view goes empty rather than falling back to the grant.
    return new Set((keep.length ? keep : [-1]).map(String));
  };

  const fetchData = async (b: any, currentFilters: any) => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getRangeForPeriod(
        currentFilters.period,
        currentFilters.customStart,
        currentFilters.customEnd,
        b
      );

      let resolvedProducts = new Set<string>(currentFilters.products as Set<string>);
      if (currentFilters.categories?.size > 0) {
        b?.catalogue?.forEach((c: any) => {
          if (currentFilters.categories.has(c.cat)) {
            resolvedProducts.add(c.product);
          }
        });
      }

      const result = await fetchDashboardView({
        start,
        end,
        channel: currentFilters.channel,
        active: currentFilters.active,
        products: resolvedProducts,
        skus: currentFilters.skus,
        customers: requestedCustomers(b, currentFilters),
      });
      setData(result);
    } catch (err: any) {
      // Surfaced rather than only logged: a failed fetch used to leave the last
      // successful numbers on screen with no indication they were stale, which
      // for a dashboard is worse than showing nothing.
      console.error(err);
      setError(
        err?.response?.data?.detail || err?.message || 'Could not load the sales data.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
    if (bootData) {
      fetchData(bootData, newFilters);
    }
  };

  const getRangeForPeriod = (p: string, customS: Date, customE: Date, b: any) => {
    // Replicating rangeFor logic from index.html
    const s = new Date(b?.months?.[1] ? new Date(b.months[1] + '-01') : new Date('2025-12-01'));
    const e = new Date(s);
    if (p === "last12") s.setMonth(s.getMonth() - 11);
    else if (p === "last36") s.setMonth(s.getMonth() - 35);
    else if (p === "last60") s.setMonth(s.getMonth() - 59);
    else if (p === "ytd") s.setMonth(0);
    else if (p === "custom") return { start: customS <= customE ? customS : customE, end: customS <= customE ? customE : customS };
    else {
       const ds = b?.months?.[0] ? new Date(b.months[0] + '-01') : new Date('2021-01-01');
       return { start: ds, end: e };
    }
    return { start: s, end: e };
  };

  // True on first load (no data yet); false on filter-change refetches so
  // existing content stays visible while the new data comes in.
  const isInitialLoad = loading && !data;
  const isRefetching = loading && !!data;

  return (
    <div className="space-y-6">
      {/* Header — always visible */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Sales Trends</h1>
          <p className="text-sm text-slate-500">
            {filters.channel === 'key' ? 'Key Sales' : filters.channel === 'van' ? 'Van Sales' : 'Key & Van Sales'} · gross & net of returns
          </p>
        </div>

        {access && !access.all_areas && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-amber-700">Your territories</span>
            <span className="ml-2 text-amber-900">
              {access.areas.length
                ? access.areas.map((a) => grantLabel(a, channelFor(access, a))).join(' · ')
                : 'none granted — this view is empty until a territory is assigned'}
            </span>
          </div>
        )}
      </div>

      {/* Thin top-of-page progress bar while refetching (filter change) */}
      {isRefetching && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary/20 overflow-hidden">
          <div className="h-full bg-primary animate-[slide_1.2s_ease-in-out_infinite]" style={{ width: '40%' }} />
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-800">Could not load the sales data</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      ) : isInitialLoad ? (
        /* ── Full-page skeleton matching the real layout ── */
        <div className="space-y-4 animate-pulse">
          {/* Filters skeleton */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="h-3 w-40 bg-slate-200 rounded" />
            <div className="flex flex-wrap gap-4">
              <div className="h-9 w-36 bg-slate-100 rounded-lg" />
              <div className="h-9 flex-1 min-w-[180px] max-w-xs bg-slate-100 rounded-lg" />
              <div className="h-9 flex-1 min-w-[180px] max-w-xs bg-slate-100 rounded-lg" />
              <div className="h-9 flex-1 min-w-[180px] max-w-xs bg-slate-100 rounded-lg" />
            </div>
            <div className="h-3 w-32 bg-slate-200 rounded" />
            <div className="flex flex-wrap gap-4">
              <div className="h-9 flex-1 min-w-[180px] max-w-xs bg-slate-100 rounded-lg" />
              <div className="h-9 flex-1 min-w-[180px] max-w-xs bg-slate-100 rounded-lg" />
              <div className="h-9 flex-1 min-w-[180px] max-w-xs bg-slate-100 rounded-lg" />
            </div>
            <div className="h-3 w-28 bg-slate-200 rounded" />
            <div className="flex flex-wrap gap-4">
              <div className="h-9 w-52 bg-slate-100 rounded-lg" />
              <div className="h-9 w-44 bg-slate-100 rounded-lg" />
            </div>
          </div>

          {/* KPI cards skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="h-3 w-16 bg-slate-200 rounded" />
                <div className="h-6 w-24 bg-slate-100 rounded" />
                <div className="h-2 w-12 bg-slate-100 rounded" />
              </div>
            ))}
          </div>

          {/* Chart skeleton */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
            <div className="h-48 bg-slate-50 rounded-lg flex items-end gap-2 px-4 pb-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-slate-200 rounded-t"
                  style={{ height: `${30 + Math.sin(i) * 20 + 40}%` }}
                />
              ))}
            </div>
          </div>

          {/* Table skeleton */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
              <div className="h-3 w-24 bg-slate-200 rounded" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-100">
                <div className="h-3 flex-1 bg-slate-100 rounded" />
                <div className="h-3 w-20 bg-slate-100 rounded" />
                <div className="h-3 w-20 bg-slate-100 rounded" />
                <div className="h-3 w-20 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <SalesFilters filters={filters} onChange={handleFilterChange} bootData={bootData} />
          <SalesKPIs data={data} />
          <SalesCharts data={data} filters={filters} onFilterChange={handleFilterChange} />
          <SalesDataTables data={data} bootData={bootData} filters={filters} onFilterChange={handleFilterChange} />
        </>
      )}
    </div>
  );
}
