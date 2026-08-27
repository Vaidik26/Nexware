import { useMemo, useState } from 'react';
import { groupCalc, n3, pc } from '@/lib/procurementLogic';
import { clsx } from 'clsx';

export default function MPPIView({ data, settings }: { data: any, settings: any }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const rows = useMemo(() => {
    if (!data || !data.rms) return [];
    
    let results = data.rms.map((r: any) => {
      const g = groupCalc(r, settings);
      return { r, g };
    });

    const query = q.toLowerCase().trim();
    if (query) {
      results = results.filter((row: any) => 
        row.r.name.toLowerCase().includes(query) || 
        row.r.code.toLowerCase().includes(query)
      );
    }
    if (cat) {
      results = results.filter((row: any) => row.r.cat === cat);
    }

    results.sort((a: any, b: any) => a.r.name.localeCompare(b.r.name));

    return results;
  }, [data, settings, q, cat]);

  const cats = useMemo(() => {
    if (!data || !data.rms) return [];
    return [...new Set(data.rms.map((r: any) => r.cat))].sort() as string[];
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex-1 min-w-[200px]">
          <input
            type="search"
            placeholder="Search raw material or code..."
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Category:</label>
          <select value={cat} onChange={e => setCat(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md text-sm">
            <option value="">All Categories</option>
            {cats.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold text-slate-600">
            <tr>
              <th className="p-3">Raw Material</th>
              <th className="p-3">Category</th>
              <th className="p-3 text-right">Standard Cost</th>
              <th className="p-3 text-right">MPPI Ceiling</th>
              <th className="p-3 text-right">Headroom</th>
              <th className="p-3 text-right">Binding Margin</th>
              <th className="p-3 text-right">Spread</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row: any, i: number) => {
              const headroomColor = row.g.headroom != null 
                ? (row.g.headroom < 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium')
                : 'text-slate-600';

              return (
                <tr key={`${row.r.code}-${i}`} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{row.r.code}</span>
                      {row.r.name}
                    </div>
                  </td>
                  <td className="p-3 text-slate-600">{row.r.cat}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.r.cost != null ? n3(row.r.cost) : '-'}
                  </td>
                  <td className="p-3 text-right font-bold text-slate-900 tabular-nums">
                    {row.g.ceil != null ? n3(row.g.ceil) : '-'}
                  </td>
                  <td className={clsx("p-3 text-right tabular-nums", headroomColor)}>
                    {row.g.headroom != null ? (row.g.headroom > 0 ? '+' : '') + n3(row.g.headroom) : '-'}
                  </td>
                  <td className="p-3 text-right tabular-nums text-slate-600">
                    {row.g.bindM != null ? pc(row.g.bindM) : '-'}
                  </td>
                  <td className="p-3 text-right tabular-nums text-slate-600">
                    {row.g.spread != null ? pc(row.g.spread) : '-'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  No materials found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
