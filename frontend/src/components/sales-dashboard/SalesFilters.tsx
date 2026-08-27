import { clsx } from 'clsx';
import { useMemo } from 'react';

interface SalesFiltersProps {
  filters: any;
  onChange: (filters: any) => void;
  bootData: any;
  currentData: any;
}

export default function SalesFilters({ filters, onChange, bootData, currentData }: SalesFiltersProps) {
  const update = (key: string, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const areas = Object.keys(bootData?.areas || {}).sort();
  const sAreas = Object.keys(bootData?.salesmanAreas || {}).sort();

  // Extract products and SKUs from catalogue
  const allProducts = useMemo(() => {
    if (!bootData?.catalogue) return [];
    const set = new Set(bootData.catalogue.map((c: any) => c.product));
    return Array.from(set).sort();
  }, [bootData]);

  const allSkus = useMemo(() => {
    if (!bootData?.catalogue) return [];
    return bootData.catalogue.map((c: any) => ({ value: c.code, label: `${c.code} - ${c.desc}` })).sort((a: any, b: any) => a.label.localeCompare(b.label));
  }, [bootData]);

  const allCustomers = useMemo(() => {
    // bootData.custs is { id: name } — the full name dictionary (3859 entries)
    // currentData.custIds is an array of customer IDs that had sales in the current view
    if (!bootData?.custs) return [];
    const inScope: Set<string> = new Set(
      (currentData?.custIds || []).map((id: any) => String(id))
    );
    return Object.entries(bootData.custs as Record<string, string>)
      .filter(([id]) => inScope.size === 0 || inScope.has(id))
      .map(([id, name]) => ({ value: id, label: `${id} - ${name}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bootData, currentData]);

  const Segment = ({ label, options, value, keyName, scrollable = false }: { label: string, options: any[], value: string, keyName: string, scrollable?: boolean }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className={clsx("flex bg-white border border-slate-200 rounded-lg p-1 gap-1 w-fit", scrollable ? "overflow-x-auto max-w-[300px] sm:max-w-md no-scrollbar" : "flex-wrap")}>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => update(keyName, opt.value)}
            className={clsx(
              "text-xs font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap",
              value === opt.value 
                ? "bg-primary text-white" 
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 relative">
      <button 
        onClick={() => onChange({
          channel: 'all',
          area: 'all',
          sarea: 'all',
          period: 'last12',
          active: 'all',
          products: new Set(),
          skus: new Set(),
          customers: new Set(),
          customStart: new Date('2021-01-01'),
          customEnd: new Date('2025-12-01')
        })}
        className="absolute top-4 right-4 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
      >
        Reset Filters
      </button>
      
      <div className="flex flex-wrap gap-4 items-end pr-24">
        <Segment 
          label="Channel" 
          keyName="channel"
          value={filters.channel}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Key Sales', value: 'key' },
            { label: 'Van Sales', value: 'van' }
          ]} 
        />
        
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Area</label>
          <select
            value={filters.area}
            onChange={(e) => update('area', e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All areas (overall)</option>
            {areas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supervisor Area</label>
          <select
            value={filters.sarea}
            onChange={(e) => update('sarea', e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All supervisor areas</option>
            {sAreas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <Segment 
          label="Period" 
          keyName="period"
          value={filters.period}
          options={[
            { label: '12 mo', value: 'last12' },
            { label: '3 yr', value: 'last36' },
            { label: '5 yr', value: 'last60' },
            { label: 'YTD', value: 'ytd' },
            { label: 'All', value: 'all' },
            { label: 'Custom', value: 'custom' },
          ]} 
        />

        <Segment 
          label="Active SKUs" 
          keyName="active"
          value={filters.active}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Discontinued', value: 'inactive' }
          ]} 
        />
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product</label>
          <select
            value={filters.products.size === 0 ? 'all' : Array.from(filters.products)[0] as string}
            onChange={(e) => {
              const val = e.target.value;
              update('products', val === 'all' ? new Set() : new Set([val]));
            }}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All products</option>
            {allProducts.map((p: any) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</label>
          <select
            value={filters.skus.size === 0 ? 'all' : Array.from(filters.skus)[0] as string}
            onChange={(e) => {
              const val = e.target.value;
              update('skus', val === 'all' ? new Set() : new Set([val]));
            }}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All SKUs</option>
            {allSkus.map((s: any) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</label>
          <select
            value={filters.customers.size === 0 ? 'all' : Array.from(filters.customers)[0] as string}
            onChange={(e) => {
              const val = e.target.value;
              update('customers', val === 'all' ? new Set() : new Set([val]));
            }}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All customers</option>
            {allCustomers.map((c: any) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
