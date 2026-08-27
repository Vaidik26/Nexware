import { useMemo, useState } from 'react';
import { deskRow, n3, pc } from '@/lib/procurementLogic';
import { clsx } from 'clsx';

export default function BuyingDesk({ data, settings }: { data: any, settings: any }) {
  const [market, setMarket] = useState('DUBAI'); // 'DUBAI', 'INT', 'OMAN', 'ALL'
  const [inco, setInco] = useState('CIF');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const rows = useMemo(() => {
    if (!data || !data.rms) return [];
    
    // settings override for local use
    const localSettings = { ...settings, inco };

    let results: any[] = [];
    if (market === 'ALL') {
      for (const r of data.rms) {
        for (const m of ['DUBAI', 'INT', 'OMAN']) {
          results.push(deskRow(r, m, localSettings, data.meta));
        }
      }
    } else {
      results = data.rms.map((r: any) => deskRow(r, market, localSettings, data.meta));
    }

    // Filter
    const query = q.toLowerCase().trim();
    if (query) {
      results = results.filter(row => 
        row.name.toLowerCase().includes(query) || 
        row.r.name.toLowerCase().includes(query)
      );
    }
    if (cat) {
      results = results.filter(row => row.r.cat === cat);
    }

    // Default sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    return results;
  }, [data, market, inco, settings, q, cat]);

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
            placeholder="Search raw material..."
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Market:</label>
          <select value={market} onChange={e => setMarket(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md text-sm">
            <option value="DUBAI">Dubai</option>
            <option value="INT">International</option>
            <option value="OMAN">Oman</option>
            <option value="ALL">All Markets</option>
          </select>
        </div>

        {market === 'INT' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600">Price Point:</label>
            <select value={inco} onChange={e => setInco(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md text-sm">
              <option value="CIF">CIF</option>
              <option value="FOB">FOB</option>
            </select>
          </div>
        )}

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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="text-sm font-medium text-slate-500 mb-1">Total Monitored</div>
          <div className="text-3xl font-bold text-slate-900">{rows.length}</div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-center">
          <div className="text-sm font-medium text-emerald-700 mb-1">Action: Buy</div>
          <div className="text-3xl font-bold text-emerald-900">{rows.filter(r => r.verdict.t === 'Buy').length}</div>
        </div>
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm flex flex-col justify-center">
          <div className="text-sm font-medium text-rose-700 mb-1">Action: Hold</div>
          <div className="text-3xl font-bold text-rose-900">{rows.filter(r => r.verdict.t === 'Hold').length}</div>
        </div>
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm flex flex-col justify-center">
          <div className="text-sm font-medium text-amber-700 mb-1">Action: Bridge Buy</div>
          <div className="text-3xl font-bold text-amber-900">{rows.filter(r => r.verdict.t === 'Bridge buy').length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold text-slate-600">
            <tr>
              <th className="p-3">Raw Material</th>
              <th className="p-3">Verdict</th>
              <th className="p-3 text-right">Mkt Quote</th>
              <th className="p-3 text-right">vs Ceiling</th>
              <th className="p-3 text-right">vs Cost Basis</th>
              <th className="p-3 text-right">vs Last Buy</th>
              <th className="p-3 text-right">MPPI Target</th>
              <th className="p-3 text-right">Days Cover</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              const verdictColors = {
                'Buy': 'bg-emerald-100 text-emerald-800',
                'Hold': 'bg-rose-100 text-rose-800',
                'Bridge buy': 'bg-amber-100 text-amber-800',
                'Review': 'bg-slate-100 text-slate-800',
                'No quote': 'bg-slate-100 text-slate-500'
              };
              const vColor = (verdictColors as any)[row.verdict.t] || 'bg-slate-100 text-slate-800';
              
              const pctColor = (v: number | null) => {
                if (v == null) return 'text-slate-400';
                if (v < 0) return 'text-emerald-600 font-medium';
                if (v > 0) return 'text-rose-600 font-medium';
                return 'text-slate-600';
              };

              return (
                <tr key={`${row.name}-${row.m}-${i}`} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-medium text-slate-900">
                    {row.name}
                    {market === 'ALL' && <span className="ml-2 text-[10px] uppercase text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">{row.m}</span>}
                  </td>
                  <td className="p-3">
                    <span className={clsx("px-2 py-1 rounded-full text-[11px] font-bold", vColor)}>
                      {row.verdict.t}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums font-bold text-slate-900">
                    {row.px != null ? n3(row.px) : '-'}
                  </td>
                  <td className={clsx("p-3 text-right tabular-nums", pctColor(row.vT))}>
                    {row.vT != null ? pc(row.vT) : '-'}
                  </td>
                  <td className={clsx("p-3 text-right tabular-nums", pctColor(row.vB))}>
                    {row.vB != null ? pc(row.vB) : '-'}
                  </td>
                  <td className={clsx("p-3 text-right tabular-nums", pctColor(row.vP))}>
                    {row.vP != null ? pc(row.vP) : '-'}
                  </td>
                  <td className="p-3 text-right tabular-nums text-slate-600">
                    {row.target != null ? n3(row.target) : '-'}
                  </td>
                  <td className="p-3 text-right tabular-nums text-slate-600">
                    {row.st.days != null ? row.st.days : '-'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
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
