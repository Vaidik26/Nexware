import { useState, useEffect } from 'react';
import { loadBootstrap, fetchDashboardView } from '@/lib/salesDashboardApi';
import SalesFilters from '@/components/sales-dashboard/SalesFilters';
import SalesKPIs from '@/components/sales-dashboard/SalesKPIs';
import SalesCharts from '@/components/sales-dashboard/SalesCharts';
import SalesDataTables from '@/components/sales-dashboard/SalesDataTables';

export default function SalesDashboard() {
  const [loading, setLoading] = useState(true);
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
    loadBootstrap().then(b => {
      setBootData(b);
      fetchData(b, filters);
    }).catch(console.error);
  }, []);

  const fetchData = async (b: any, currentFilters: any) => {
    setLoading(true);
    try {
      const { start, end } = getRangeForPeriod(currentFilters.period, currentFilters.customStart, currentFilters.customEnd, b);
      
      const args = {
        p_start: start.toISOString().split('T')[0],
        p_end: end.toISOString().split('T')[0],
        p_channel: currentFilters.channel === "all" ? null : currentFilters.channel,
        p_salesman: null,
        p_active: currentFilters.active === "all" ? null : currentFilters.active,
        p_products: currentFilters.products.size ? [...currentFilters.products] : null,
        p_skus: currentFilters.skus.size ? [...currentFilters.skus] : null,
        p_customers: currentFilters.customers.size ? [...currentFilters.customers].map(Number) : null
      };

      const result = await fetchDashboardView(args);
      setData(result);
    } catch (err) {
      console.error(err);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary">Sales Trends</h1>
          <p className="text-sm text-slate-500">Key & Van Sales · gross & net of returns</p>
        </div>
      </div>
      
      <SalesFilters filters={filters} onChange={handleFilterChange} bootData={bootData} currentData={data} />
      
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
        </div>
      ) : (
        <>
          <SalesKPIs data={data} />
          <SalesCharts data={data} filters={filters} onFilterChange={handleFilterChange} />
          <SalesDataTables data={data} bootData={bootData} />
        </>
      )}
    </div>
  );
}
