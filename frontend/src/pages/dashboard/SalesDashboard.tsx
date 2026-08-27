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
    area: 'all',
    sarea: 'all',
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

    if (currentFilters.sarea !== 'all' && b?.salesmanAreas?.[currentFilters.sarea]?.customerIds) {
      sets.push(b.salesmanAreas[currentFilters.sarea].customerIds);
    }
    if (currentFilters.area !== 'all' && b?.areas?.[currentFilters.area]?.customerIds) {
      sets.push(b.areas[currentFilters.area].customerIds);
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

      const result = await fetchDashboardView({
        start,
        end,
        channel: currentFilters.channel,
        active: currentFilters.active,
        products: currentFilters.products,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Sales Trends</h1>
          <p className="text-sm text-slate-500">Key & Van Sales · gross & net of returns</p>
        </div>

        {/*
          A scoped viewer must be able to tell a restricted total from a quiet
          month. Without this, "OMR 0" for a territory they cannot see is
          indistinguishable from "OMR 0" for one they can — so the scope is
          stated wherever the numbers are, not only on the admin screen.
        */}
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

      <SalesFilters filters={filters} onChange={handleFilterChange} bootData={bootData} currentData={data} />
      
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-800">Could not load the sales data</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
        </div>
      ) : (
        <>
          <SalesKPIs data={data} />
          <SalesCharts data={data} filters={filters} onFilterChange={handleFilterChange} />
          <SalesDataTables data={data} bootData={bootData} filters={filters} onFilterChange={handleFilterChange} />
        </>
      )}
    </div>
  );
}
