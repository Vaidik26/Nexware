import { useMemo } from 'react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/store/authStore';
import { X } from 'lucide-react';
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown';
import { useDimensionCascade, autoCheckBottomUp } from '@/hooks/useDimensionCascade';

export default function SalesFilters({ filters, onChange, bootData }: any) {
  const access = useAuthStore(s => s.access);

  const allowedChannels = useMemo(() => {
    if (!access) return ['key', 'van'];
    if (access.all_areas) return ['key', 'van'];
    const ch = new Set<string>();
    access.areas.forEach((a: any) => {
      if (a.direct) ch.add('key');
      if (a.van) ch.add('van');
    });
    return Array.from(ch);
  }, [access]);

  const channelOptions = [
    { label: 'All', value: 'all' },
    ...allowedChannels.map(c => ({
      label: c === 'key' ? 'Key Sales' : 'Van Sales',
      value: c
    }))
  ];

  const cascadeOptions = useDimensionCascade(filters, bootData);

  const update = (key: string, value: any) => {
    if (value instanceof Set) {
      const nextFilters = autoCheckBottomUp(key, value, filters, bootData);
      onChange(nextFilters);
    } else {
      onChange({ ...filters, [key]: value });
    }
  };

  const clearAllFilters = () => {
    onChange({
      ...filters,
      channel: 'all',
      areas: new Set<string>(),
      sareas: new Set<string>(),
      categories: new Set<string>(),
      products: new Set<string>(),
      skus: new Set<string>(),
      customers: new Set<string>()
    });
  };

  const removeSingleValue = (key: string, val: string) => {
    const s = new Set<string>(filters[key] as Set<string>);
    s.delete(val);
    update(key, s);
  };

  const activeChips = useMemo(() => {
    const chips: any[] = [];
    if (filters.channel !== 'all') {
      chips.push({
        label: 'Channel:',
        display: filters.channel === 'key' ? 'Key Sales' : 'Van Sales',
        onClear: () => update('channel', 'all')
      });
    }
    if (filters.sareas.size > 0) {
      (Array.from(filters.sareas) as string[]).forEach((s: string) => {
        chips.push({
          label: 'Supervisor Area:',
          display: s,
          onClear: () => removeSingleValue('sareas', s)
        });
      });
    }
    if (filters.areas.size > 0) {
      (Array.from(filters.areas) as string[]).forEach((a: string) => {
        chips.push({
          label: 'Area:',
          display: a,
          onClear: () => removeSingleValue('areas', a)
        });
      });
    }
    if (filters.customers.size > 0) {
      (Array.from(filters.customers) as string[]).forEach((c: string) => {
        chips.push({
          label: 'Customer:',
          display: cascadeOptions.customerOptions.find((o: any) => o.value === c)?.label || c,
          onClear: () => removeSingleValue('customers', c)
        });
      });
    }
    if (filters.categories.size > 0) {
      (Array.from(filters.categories) as string[]).forEach((c: string) => {
        chips.push({
          label: 'Category:',
          display: c,
          onClear: () => removeSingleValue('categories', c)
        });
      });
    }
    if (filters.products.size > 0) {
      (Array.from(filters.products) as string[]).forEach((p: string) => {
        chips.push({
          label: 'Product:',
          display: p,
          onClear: () => removeSingleValue('products', p)
        });
      });
    }
    if (filters.skus.size > 0) {
      (Array.from(filters.skus) as string[]).forEach((s: string) => {
        chips.push({
          label: 'SKU:',
          display: cascadeOptions.skuOptions.find((o: any) => o.value === s)?.label || s,
          onClear: () => removeSingleValue('skus', s)
        });
      });
    }
    return chips;
  }, [filters, cascadeOptions]);

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
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-5 relative">
      
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
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
      
      {/* CHANNEL DIMENSION */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-1">Channel Dimension (Who)</h3>
        <div className="flex flex-wrap gap-4 items-end">
          {channelOptions.length > 1 && (
            <Segment 
              label="Channel" 
              keyName="channel"
              value={filters.channel}
              options={channelOptions} 
            />
          )}
          
          <MultiSelectDropdown
            label="Supervisor Area"
            placeholder="All supervisor areas"
            options={cascadeOptions.sAreaOptions}
            selected={filters.sareas}
            onChange={(s) => update('sareas', s)}
          />

          <MultiSelectDropdown
            label="Area"
            placeholder="All areas"
            options={cascadeOptions.areaOptions}
            selected={filters.areas}
            onChange={(s) => update('areas', s)}
          />

          <MultiSelectDropdown
            label="Customer"
            placeholder="All customers"
            options={cascadeOptions.customerOptions}
            selected={filters.customers}
            onChange={(s) => update('customers', s)}
          />
        </div>
      </div>

      {/* PRODUCT DIMENSION */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-1">Product Dimension (What)</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <MultiSelectDropdown
            label="Category"
            placeholder="All categories"
            options={cascadeOptions.categoryOptions}
            selected={filters.categories}
            onChange={(s) => update('categories', s)}
          />

          <MultiSelectDropdown
            label="Product"
            placeholder="All products"
            options={cascadeOptions.productOptions}
            selected={filters.products}
            onChange={(s) => update('products', s)}
          />

          <MultiSelectDropdown
            label="SKU"
            placeholder="All SKUs"
            options={cascadeOptions.skuOptions}
            selected={filters.skus}
            onChange={(s) => update('skus', s)}
          />
        </div>
      </div>

      {/* TIME & OTHER */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-1">Time & Other</h3>
        <div className="flex flex-wrap gap-4 items-end">
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
      </div>
    </div>
  );
}
