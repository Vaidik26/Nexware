import { useMemo, useState } from 'react';
import { deskRow, n3, pc } from '@/lib/procurementLogic';
import { clsx } from 'clsx';

export default function BuyingDesk({ data, settings, filters, setFilters }: { data: any, settings: any, filters: any, setFilters: any }) {
  const { market, inco, q, cat, showFilter } = filters;
  
  const [sortFilter, setSortFilter] = useState('name');

  const rows = useMemo(() => {
    if (!data || !data.rms) return [];
    
    // settings override for local use
    const localSettings = { ...settings, inco };
    let results: any[] = [];
    const mlist = market === 'ALL' ? ['DUBAI', 'INT', 'OMAN'] : [market];
    
    data.rms.forEach((r: any) => {
      mlist.forEach(m => {
        results.push(deskRow(r, m, localSettings, data.meta));
      });
    });

    // Filter
    const query = q.toLowerCase().trim();
    if (query) {
      results = results.filter((row: any) => 
        row.name.toLowerCase().includes(query) || 
        (row.dq && row.dq.toLowerCase().includes(query))
      );
    }
    if (cat) {
      const catMap = Object.fromEntries(data.rms.map((r: any) => [r.name, r.cat]));
      results = results.filter((row: any) => catMap[row.name] === cat);
    }
    if (showFilter === 'under') results = results.filter((row: any) => row.vT != null && row.vT < -settings.tol);
    if (showFilter === 'at') results = results.filter((row: any) => row.vT != null && Math.abs(row.vT) <= settings.tol);
    if (showFilter === 'over') results = results.filter((row: any) => row.vT != null && row.vT > settings.tol);
    if (showFilter === 'nodata') results = results.filter((row: any) => row.px == null);
    if (showFilter === 'buy') results = results.filter((row: any) => row.verdict.t === 'Buy');
    
    // Sort logic
    if (sortFilter === 'pur') results.sort((a: any, b: any) => (a.pl?.price || 0) - (b.pl?.price || 0));
    else if (sortFilter === 'mkt') results.sort((a: any, b: any) => (a.px || 0) - (b.px || 0));
    else if (sortFilter === 'vsTarget') results.sort((a: any, b: any) => (a.vT || 0) - (b.vT || 0));
    else if (sortFilter === 'vsLast') results.sort((a: any, b: any) => (a.vP || 0) - (b.vP || 0));
    else if (sortFilter === 'vsLY') results.sort((a: any, b: any) => (a.vB || 0) - (b.vB || 0));
    else if (sortFilter === 'stock') results.sort((a: any, b: any) => (a.st?.days || 0) - (b.st?.days || 0));
    else results.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return results;
  }, [data, settings, market, inco, q, cat, showFilter, sortFilter]);

  const cats = useMemo(() => {
    if (!data || !data.rms) return [];
    return [...new Set(data.rms.map((r: any) => r.cat))].sort() as string[];
  }, [data]);

  const setFilter = (key: string, val: string) => {
    setFilters((prev: any) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar strictly matching legacy desk */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        
        <div className="flex-1 min-w-[200px]">
          <input
            type="search"
            placeholder="Search raw material..."
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={q}
            onChange={e => setFilter('q', e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Category</label>
          <select value={cat} onChange={e => setFilter('cat', e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white">
            <option value="">All categories</option>
            {cats.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Show</label>
          <select value={showFilter} onChange={e => setFilter('showFilter', e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white">
            <option value="all">All raw materials</option>
            <option value="under">Under target</option>
            <option value="at">At target</option>
            <option value="over">Above target</option>
            <option value="nodata">No market quote</option>
            <option value="buy">Verdict says buy</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Sort</label>
          <select value={sortFilter} onChange={e => setSortFilter(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white">
            <option value="name">Raw material (A-Z)</option>
            <option value="pur">Last purchase price</option>
            <option value="mkt">Latest market price</option>
            <option value="vsTarget">vs Target</option>
            <option value="vsLast">vs Last buy</option>
            <option value="vsLY">vs Bench.</option>
            <option value="stock">Stock cover</option>
          </select>
        </div>

      </div>

      {/* Global Market Switcher matching legacy */}
      <div className="flex flex-wrap items-center gap-8 bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">1</span>
            <span className="text-sm font-semibold text-slate-600 mr-2 shrink-0">Market</span>
            <div className="flex flex-wrap gap-1">
              {['DUBAI', 'INT', 'OMAN', 'ALL'].map(m => (
                <button 
                  key={m}
                  onClick={() => setFilter('market', m)}
                  className={clsx("px-3 py-1 text-xs sm:text-sm font-medium transition-colors border border-slate-200 rounded-md", market === m ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 hover:bg-slate-50')}
                >
                  {m === 'INT' ? 'International' : (m === 'OMAN' ? 'Oman - local' : (m === 'ALL' ? 'All markets' : 'Dubai'))}
                </button>
              ))}
            </div>
          </div>

        <div className={clsx("flex items-center gap-2 transition-opacity", (market === 'INT' || market === 'ALL') ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
          <span className="text-slate-300">→</span>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full w-5 h-5 flex items-center justify-center">2</span>
          <span className="text-sm font-semibold text-slate-600 mr-2">Price point</span>
          <div className="flex border border-slate-300 rounded overflow-hidden">
            <button onClick={() => setFilter('inco', 'CIF')} className={clsx("px-4 py-1.5 text-sm font-medium transition-colors border-r border-slate-200", inco === 'CIF' ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>CIF</button>
            <button onClick={() => setFilter('inco', 'FOB')} className={clsx("px-4 py-1.5 text-sm font-medium transition-colors", inco === 'FOB' ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>FOB</button>
          </div>
        </div>
      </div>

      {/* Table - all 10 legacy columns, hidden selectively on mobile to fit without swiping */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full overflow-x-auto">
        <table className="min-w-full text-left text-[13px] leading-tight whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-2 py-2 align-bottom border-b border-slate-200">
                Raw material
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">as procurement names it, per market</div>
              </th>
              <th className="px-2 py-2 text-right align-bottom border-b border-slate-200">
                MPPI target
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">OMR / kg</div>
              </th>
              <th className="hidden md:table-cell px-2 py-2 text-right align-bottom border-b border-slate-200">
                Last purchase
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">that row's market only</div>
              </th>
              <th className="hidden lg:table-cell px-2 py-2 text-right align-bottom border-b border-slate-200">
                Benchmark
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">6-month average</div>
              </th>
              <th className="px-2 py-2 text-right align-bottom border-b border-slate-200">
                Latest market price
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">OMR / kg, and its date</div>
              </th>
              <th className="px-2 py-2 text-right align-bottom border-b border-slate-200">vs Target</th>
              <th className="hidden md:table-cell px-2 py-2 text-right align-bottom border-b border-slate-200">vs Last buy</th>
              <th className="hidden lg:table-cell px-2 py-2 text-right align-bottom border-b border-slate-200">vs Bench.</th>
              <th className="hidden xl:table-cell px-2 py-2 text-right align-bottom border-b border-slate-200">
                Stock cover
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">days on hand</div>
              </th>
              <th className="px-2 py-2 text-left align-bottom border-b border-slate-200">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              const verdictColors = {
                'Buy': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                'Hold': 'bg-rose-50 text-rose-700 border-rose-200',
                'Bridge buy': 'bg-amber-50 text-amber-700 border-amber-200',
                'Review': 'bg-slate-50 text-slate-700 border-slate-200',
                'No quote': 'bg-slate-50 text-slate-500 border-slate-200'
              };
              const vColor = (verdictColors as any)[row.verdict.t] || 'bg-slate-50 text-slate-700 border-slate-200';
              
              const pctColor = (v: number | null) => {
                if (v == null) return 'text-slate-400';
                if (v < 0) return 'text-emerald-600 font-medium';
                if (v > 0) return 'text-rose-600 font-medium';
                return 'text-slate-600';
              };

              return (
                <tr key={`${row.name}-${row.m}-${i}`} className={clsx("transition-colors", i % 2 === 0 ? "bg-white" : "bg-slate-50/30", "hover:bg-slate-100/80")}>
                  <td className="px-2 py-2 font-medium text-slate-900">
                    {row.name}
                    {market === 'ALL' && <span className="ml-1 text-[10px] text-slate-400 border border-slate-200 bg-white px-1 py-0.5 rounded">{row.m === 'INT' ? (inco === 'CIF' ? 'Intl CIF' : 'Intl FOB') : (row.m === 'DUBAI' ? 'Dubai' : 'Oman')}</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold text-slate-900">
                    {row.target != null ? n3(row.target) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="hidden md:table-cell px-2 py-2 text-right tabular-nums text-slate-600">
                    {row.pl != null ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-medium">{n3(row.pl.price)}</span>
                        <span className="text-[10px] text-slate-400">{row.pl.date}</span>
                      </span>
                    ) : <span className="text-slate-400 text-xs italic">— none in {row.m}</span>}
                  </td>
                  <td className="hidden lg:table-cell px-2 py-2 text-right tabular-nums text-slate-600">
                    {row.bench != null ? n3(row.bench) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-900 font-medium">
                    {row.px != null ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-bold">{n3(row.px)}</span>
                        <span className="text-[10px] text-slate-400">{row.ch?.date}</span>
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={clsx("px-2 py-2 text-right tabular-nums", pctColor(row.vT))}>
                    {row.vT != null ? (row.vT > 0 ? '+' : '') + pc(row.vT) : '—'}
                  </td>
                  <td className={clsx("hidden md:table-cell px-2 py-2 text-right tabular-nums", pctColor(row.vP))}>
                    {row.vP != null ? (row.vP > 0 ? '+' : '') + pc(row.vP) : '—'}
                  </td>
                  <td className={clsx("hidden lg:table-cell px-2 py-2 text-right tabular-nums", pctColor(row.vB))}>
                    {row.vB != null ? (row.vB > 0 ? '+' : '') + pc(row.vB) : '—'}
                  </td>
                  <td className="hidden xl:table-cell px-2 py-2 text-right tabular-nums text-slate-600">
                    {row.st.days != null ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-bold text-emerald-700">{row.st.days} d</span>
                        <span className="text-[10px] text-emerald-600">Healthy</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2 text-left">
                    <span className={clsx("px-1.5 py-0.5 rounded text-[11px] font-semibold border inline-flex items-center gap-1", vColor)}>
                      {row.verdict.t}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500 bg-slate-50">
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
