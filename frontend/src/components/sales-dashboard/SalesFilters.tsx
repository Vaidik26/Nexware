import { clsx } from 'clsx';
import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { areaAllowed } from '@/lib/access';

interface SalesFiltersProps {
  filters: any;
  onChange: (filters: any) => void;
  bootData: any;
  currentData: any;
}

export default function SalesFilters({ filters, onChange, bootData, currentData }: SalesFiltersProps) {
  const access = useAuthStore((s) => s.access);

  const update = (key: string, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const areas = Object.keys(bootData?.areas || {}).sort();

  // Only the supervisor areas this account is granted.
  const sAreas = useMemo(() => {
    const all = Object.keys(bootData?.salesmanAreas || {}).sort();
    if (!access || access.all_areas) return all;
    return all.filter((a) => areaAllowed(access, a));
  }, [bootData, access]);

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
    if (!bootData?.custs) return [];
    const inScope: Set<string> = new Set(
      (currentData?.custIds || []).map((id: any) => String(id))
    );
    return Object.entries(bootData.custs as Record<string, string>)
      .filter(([id]) => inScope.size === 0 || inScope.has(id))
      .map(([id, name]) => ({ value: id, label: `${id} - ${name}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bootData, currentData]);

  const allowedChannels = useMemo(() => {
    if (!access) return ['key', 'van'];
    
    if (access.all_areas) {
      const channel = access.area_channels?.['ALL'];
      if (channel === 'KEY') return ['key'];
      if (channel === 'VAN') return ['van'];
      return ['key', 'van'];
    }
    
    const channels = new Set<string>();
    Object.values(access.area_channels || {}).forEach((ch: any) => {
      if (ch === 'KEY') channels.add('key');
      if (ch === 'VAN') channels.add('van');
    });
    
    if (channels.size === 0 && access.areas?.length > 0) return ['key', 'van'];
    return Array.from(channels);
  }, [access]);

  const channelOptions = [
    ...(allowedChannels.length !== 1 ? [{ label: 'All', value: 'all' }] : []),
    ...(allowedChannels.includes('key') ? [{ label: 'Key Sales', value: 'key' }] : []),
    ...(allowedChannels.includes('van') ? [{ label: 'Van Sales', value: 'van' }] : [])
  ];

  const activeChips = useMemo(() => {
    const chips: any[] = [];
    if (channelOptions.length > 1 && filters.channel !== 'all') {
      chips.push({
        label: 'Channel',
        display: filters.channel === 'key' ? 'Key Sales' : 'Van Sales',
        onClear: () => update('channel', allowedChannels.length === 1 ? allowedChannels[0] : 'all')
      });
    }
    if (filters.area !== 'all') {
      chips.push({
        label: 'Area',
        display: filters.area,
        onClear: () => update('area', 'all')
      });
    }
    if (filters.sarea !== 'all') {
      chips.push({
        label: 'Supervisor Area',
        display: filters.sarea,
        onClear: () => update('sarea', 'all')
      });
    }
    if (filters.products.size > 0) {
      const p = Array.from(filters.products)[0] as string;
      chips.push({
        label: 'Product',
        display: p,
        onClear: () => update('products', new Set())
      });
    }
    if (filters.skus.size > 0) {
      const s = Array.from(filters.skus)[0] as string;
      const skuObj = allSkus.find((x: any) => x.value === s);
      chips.push({
        label: 'SKU',
        display: skuObj ? skuObj.label : s,
        onClear: () => update('skus', new Set())
      });
    }
    if (filters.customers.size > 0) {
      const c = Array.from(filters.customers)[0] as string;
      const custObj = allCustomers.find((x: any) => x.value === c);
      chips.push({
        label: 'Customer',
        display: custObj ? custObj.label : c,
        onClear: () => update('customers', new Set())
      });
    }
    return chips;
  }, [filters, channelOptions, allowedChannels, allSkus, allCustomers]);

  const clearAllFilters = () => {
    onChange({
      channel: allowedChannels.length === 1 ? allowedChannels[0] : 'all',
      area: 'all',
      sarea: 'all',
      period: 'last12',
      active: 'all',
      products: new Set(),
      skus: new Set(),
      customers: new Set(),
      customStart: new Date('2021-01-01'),
      customEnd: new Date('2025-12-01')
    });
  };

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
      
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          {activeChips.map((chip, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm px-2.5 py-1 rounded-full text-xs transition-transform hover:scale-[1.02]">
              <span className="text-slate-500 font-semibold">{chip.label}</span>
              <span className="font-bold text-slate-800 truncate max-w-[200px]">{chip.display}</span>
              <button 
                onClick={chip.onClear} 
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors ml-1"
                title="Remove filter"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ))}
          <button 
            onClick={clearAllFilters}
            className="text-xs font-bold text-red-600 hover:text-red-700 ml-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {activeChips.length === 0 && (
        <button 
          onClick={clearAllFilters}
          className="absolute top-4 right-4 text-xs font-semibold text-primary hover:text-primary/80 transition-colors bg-primary/5 px-2 py-1 rounded"
        >
          Reset Filters
        </button>
      )}
      
      <div className="flex flex-wrap gap-4 items-end pr-24">
        {channelOptions.length > 1 && (
          <Segment 
            label="Channel" 
            keyName="channel"
            value={filters.channel}
            options={channelOptions} 
          />
        )}
        
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
