import { useMemo, useState } from 'react';
import { groupCalc, n4, n3, pc, pmax, effM } from '@/lib/procurementLogic';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, X, ExternalLink } from 'lucide-react';

export default function MPPIView({ data, settings, setSettings, onJumpToDesk }: { data: any, settings: any, setSettings: any, onJumpToDesk: (rm: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showFilter, setShowFilter] = useState('all');
  const [sortFilter] = useState('name');
  
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (name: string) => {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const expandAll = (isExpanded: boolean) => {
    const newExpanded: Record<string, boolean> = {};
    if (isExpanded) {
      data.rms.forEach((r: any) => { newExpanded[r.name] = true; });
    }
    setExpanded(newExpanded);
  };

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
        row.r.code.toLowerCase().includes(query) ||
        row.r.skus.some((s: any) => s.name.toLowerCase().includes(query))
      );
    }
    if (cat) {
      results = results.filter((row: any) => row.r.cat === cat);
    }
    
    if (showFilter === 'below') {
      results = results.filter((row: any) => row.g.headroom != null && row.g.headroom < 0);
    } else if (showFilter === 'above') {
      results = results.filter((row: any) => row.g.headroom != null && row.g.headroom >= 0);
    }

    if (sortFilter === 'name') {
      results.sort((a: any, b: any) => a.r.name.localeCompare(b.r.name));
    }

    return results;
  }, [data, settings, q, cat, showFilter, sortFilter]);

  const cats = useMemo(() => {
    if (!data || !data.rms) return [];
    return [...new Set(data.rms.map((r: any) => r.cat))].sort() as string[];
  }, [data]);

  const ovrCount = Object.keys(settings.skuM).length + Object.keys(settings.grpM).length;

  const handleGlobalToggle = () => {
    setSettings((prev: any) => ({ ...prev, globalOn: !prev.globalOn }));
  };

  const handleGlobalMarginChange = (val: string) => {
    let num = Number(val);
    if (isNaN(num)) num = 0;
    setSettings((prev: any) => ({ ...prev, globalM: num / 100 }));
  };

  const setGrpM = (rmName: string, val: string) => {
    setSettings((prev: any) => {
      const newGrpM = { ...prev.grpM };
      if (val === '') {
        delete newGrpM[rmName];
      } else {
        newGrpM[rmName] = Number(val) / 100;
      }
      return { ...prev, grpM: newGrpM };
    });
  };

  const setSkuM = (rmName: string, skuName: string, val: string) => {
    const key = rmName + '||' + skuName;
    setSettings((prev: any) => {
      const newSkuM = { ...prev.skuM };
      if (val === '') {
        delete newSkuM[key];
      } else {
        newSkuM[key] = Number(val) / 100;
      }
      return { ...prev, skuM: newSkuM };
    });
  };

  const clearOverrides = () => {
    setSettings((prev: any) => ({ ...prev, grpM: {}, skuM: {} }));
  };

  let belowCount = 0;
  if (data && data.rms) {
    data.rms.forEach((r: any) => {
      const g = groupCalc(r, settings);
      if (g.headroom != null && g.headroom < 0) belowCount++;
    });
  }

  const inScope = (s: any) => s.scope === 'In scope';

  return (
    <div className="space-y-4">
      {/* Top Global Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        
        <div className="flex items-center gap-6 border-r border-slate-200 pr-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only peer" checked={settings.globalOn} onChange={handleGlobalToggle} />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </div>
            <span className="text-sm font-semibold text-slate-700">Single margin for all raw materials</span>
          </label>
        </div>

        <div className={clsx("flex flex-1 items-center gap-4 transition-opacity", !settings.globalOn && "opacity-50 pointer-events-none")}>
          <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Target margin</span>
          <input
            type="range"
            min="0" max="40" step="0.5"
            value={settings.globalM * 100}
            onChange={(e) => handleGlobalMarginChange(e.target.value)}
            className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
            disabled={!settings.globalOn}
          />
          <div className="flex items-center border border-slate-300 rounded overflow-hidden">
            <input
              type="number"
              min="0" max="60" step="0.5"
              value={settings.globalM * 100}
              onChange={(e) => handleGlobalMarginChange(e.target.value)}
              className="w-16 px-2 py-1.5 text-center text-sm focus:outline-none"
              disabled={!settings.globalOn}
            />
            <span className="bg-slate-50 px-2 py-1.5 text-sm text-slate-500 border-l border-slate-300">%</span>
          </div>
        </div>

        <div className="pl-6 border-l border-slate-200">
          <button 
            onClick={clearOverrides}
            className="flex items-center gap-2 text-sm text-primary hover:text-emerald-700 font-medium transition-colors"
          >
            ↺ Clear all overrides
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold border border-slate-200">{ovrCount}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <input
            type="search"
            placeholder="Search raw material, RM code or SKU..."
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

        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Show:</label>
          <select value={showFilter} onChange={e => setShowFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md text-sm">
            <option value="all">All raw materials</option>
            <option value="below">Below cost basis</option>
            <option value="above">Above cost basis</option>
          </select>
        </div>

        <div className="flex items-center gap-4 border-l border-slate-200 pl-4 text-sm">
          <div className="text-slate-600 font-medium">
            <b className="text-slate-900">{rows.length}</b>/{data?.rms?.length} groups
          </div>
          <div className="text-slate-600 font-medium">
            <b className="text-slate-900">{belowCount}</b> below cost basis
          </div>
          <div className="flex bg-slate-100 rounded p-1 ml-2">
            <button onClick={() => expandAll(true)} className="px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">Expand</button>
            <button onClick={() => expandAll(false)} className="px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">Collapse</button>
          </div>
        </div>
      </div>

      {/* Main Table List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
        {rows.map((row: any) => {
          const r = row.r;
          const g = row.g;
          const isExpanded = !!expanded[r.name];
          const gmOn = !settings.globalOn;
          const gm = settings.grpM[r.name];
          const bindM = g.bindM;
          
          let hr = g.headroom;
          if (hr != null && Math.abs(hr) < 5e-5) hr = 0;

          return (
            <div key={r.code} className="group">
              {/* Main Row Header */}
              <div 
                className={clsx("flex items-center justify-between p-4 cursor-pointer transition-colors", isExpanded ? "bg-slate-50" : "hover:bg-slate-50")}
                onClick={() => toggleExpand(r.name)}
              >
                <div className="flex items-center gap-4 w-1/4">
                  <button className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div className="font-bold text-slate-900 text-sm truncate uppercase">{r.name}</div>
                </div>

                <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                  <div className="flex flex-col text-center">
                    <span className="text-xs text-slate-500 mb-0.5">MPPI target</span>
                    <span className="font-bold text-sm text-slate-900">{g.ceil != null ? n4(g.ceil) : '-'}</span>
                    <span className="text-[10px] text-slate-400">OMR / kg</span>
                  </div>

                  <div className="flex flex-col text-center">
                    <span className="text-xs text-slate-500 mb-0.5">vs cost basis</span>
                    <span className={clsx("font-bold text-sm", hr == null || hr === 0 ? 'text-slate-900' : (hr < 0 ? 'text-rose-600' : 'text-emerald-600'))}>
                      {hr == null ? '-' : (hr > 0 ? '+' : '') + n4(hr)}
                    </span>
                    <span className="text-[10px] text-slate-400">{r.cost != null ? 'costed ' + n4(r.cost) : ''}</span>
                  </div>

                  <div className="flex flex-col text-center">
                    <span className="text-xs text-slate-500 mb-0.5">Ladder spread</span>
                    <span className="font-bold text-sm text-slate-900">{g.spread != null ? pc(g.spread) : '-'}</span>
                    <span className="text-[10px] text-slate-400">{g.ceil != null ? n3(g.ceil) + ' → ' + n3(g.max) : ''}</span>
                  </div>

                  <div className="col-span-2 flex flex-col items-center">
                    <div className="flex items-center justify-between w-full max-w-[200px] mb-1">
                      <span className="text-xs text-slate-500">Group margin</span>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-bold text-sm", gm != null ? 'text-primary' : 'text-slate-900')}>
                          {((gm != null ? gm : bindM) * 100).toFixed(1)}%
                        </span>
                        {gm != null && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setGrpM(r.name, ''); }}
                            className="text-slate-400 hover:text-rose-500 p-0.5"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="w-full max-w-[200px]" onClick={e => e.stopPropagation()}>
                      <input
                        type="range"
                        min="0" max="40" step="0.5"
                        value={(Math.min(40, (gm != null ? gm : bindM) * 100)).toFixed(1)}
                        onChange={(e) => setGrpM(r.name, e.target.value)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                        disabled={!gmOn}
                      />
                    </div>
                  </div>
                </div>

                <div className="w-32 flex justify-end">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onJumpToDesk(r.name); }}
                    className="flex items-center gap-1 text-xs font-semibold text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
                  >
                    Open in Desk <ExternalLink size={12} />
                  </button>
                </div>
              </div>

              {/* Expanded SKUs Ladder */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 pl-12">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                        <th className="pb-2 font-semibold">SKU</th>
                        <th className="pb-2 font-semibold text-right">Pack RM kg</th>
                        <th className="pb-2 font-semibold text-right">Selling price</th>
                        <th className="pb-2 font-semibold w-48 text-center">Margin %</th>
                        <th className="pb-2 font-semibold text-right">MPPI /kg</th>
                        <th className="pb-2 font-semibold text-right">vs cost basis</th>
                        <th className="pb-2 font-semibold text-right">Margin today</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {r.skus.map((sk: any) => {
                        const m = effM(r.name, sk, settings);
                        const p = inScope(sk) ? pmax(sk, m) : null;
                        
                        const k = r.name + '||' + sk.name;
                        const ov = settings.skuM[k];
                        let shr = (p != null && sk.cost != null) ? p - sk.cost : null;
                        if (shr != null && Math.abs(shr) < 5e-5) shr = 0;
                        const bind = p != null && g.bind === sk.name;

                        return (
                          <tr key={sk.name} className={clsx("hover:bg-white transition-colors", bind && "bg-blue-50/30")}>
                            <td className="py-2.5 flex items-center gap-2">
                              <span className="font-medium text-slate-700">{sk.name}</span>
                              {bind && <span className="text-[9px] uppercase tracking-wider font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">binding</span>}
                              {!inScope(sk) && <span className="text-[9px] uppercase tracking-wider font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">out of scope</span>}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-slate-600">{n3(sk.q)}</td>
                            <td className="py-2.5 text-right tabular-nums text-slate-600">{n3(sk.sp)}</td>
                            
                            <td className="py-2.5 px-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center justify-between w-full">
                                  <input
                                    type="range"
                                    min="0" max="40" step="0.5"
                                    value={Math.min(40, m * 100).toFixed(1)}
                                    onChange={(e) => setSkuM(r.name, sk.name, e.target.value)}
                                    className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    disabled={settings.globalOn}
                                  />
                                  <div className="flex items-center gap-1 w-16 justify-end">
                                    <span className={clsx("font-bold text-xs", ov != null ? 'text-blue-600' : 'text-slate-600')}>
                                      {(m * 100).toFixed(1)}%
                                    </span>
                                    {ov != null && (
                                      <button 
                                        onClick={() => setSkuM(r.name, sk.name, '')}
                                        className="text-slate-400 hover:text-rose-500"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 text-right tabular-nums font-bold text-slate-900">
                              {p == null ? '-' : n4(p)}
                            </td>
                            <td className={clsx("py-2.5 text-right tabular-nums", shr == null || shr === 0 ? 'text-slate-700' : (shr < 0 ? 'text-rose-600' : 'text-emerald-600'))}>
                              {shr == null ? '-' : (shr > 0 ? '+' : '') + n4(shr)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-slate-400">
                              {sk.mNow != null ? (sk.mNow * 100).toFixed(1) + '%' : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No materials found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}
