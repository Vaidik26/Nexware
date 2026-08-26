import { clsx } from 'clsx';

interface SalesFiltersProps {
  filters: any;
  onChange: (filters: any) => void;
  bootData: any;
}

export default function SalesFilters({ filters, onChange, bootData }: SalesFiltersProps) {
  const update = (key: string, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const areas = Object.keys(bootData?.areas || {}).sort();
  const sAreas = Object.keys(bootData?.salesmanAreas || {}).sort();

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
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap gap-4 items-end">
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
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supervisor Area</label>
          <select
            value={filters.sarea}
            onChange={(e) => update('sarea', e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All Supervisor Areas</option>
            {sAreas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Area</label>
          <select
            value={filters.area}
            onChange={(e) => update('area', e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
          >
            <option value="all">All Areas</option>
            {areas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
