import React from 'react';
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

  const Segment = ({ label, options, value, keyName }: { label: string, options: any[], value: string, keyName: string }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="inline-flex flex-wrap bg-white border border-slate-200 rounded-lg p-1 gap-1 w-fit">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => update(keyName, opt.value)}
            className={clsx(
              "text-xs font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap",
              value === opt.value 
                ? "bg-slate-900 text-white" 
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
      </div>
    </div>
  );
}
