import { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Info,
  Activity,
  ArrowRight,
  Search,
  X,
  ChevronDown
} from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  getLatestPrices,
  
  LatestPriceSummary,
  CapturedPrice
} from '@/lib/data/priceService';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from 'recharts';

export default function MarketOverview() {
  const [summaries, setSummaries] = useState<LatestPriceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Two-Tab Navigation State
  const [activeTab, setActiveTab] = useState<'movers' | 'analytics'>('movers');

  // Admin Analytics Panel State
  const [analyticsItem, setAnalyticsItem] = useState<LatestPriceSummary | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<'14d' | '30d' | '60d' | '90d'>('30d');
  const [analyticsHistory, setAnalyticsHistory] = useState<CapturedPrice[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSummaries = useMemo(() => {
    if (!itemSearch.trim()) return summaries;
    const q = itemSearch.toLowerCase().trim();
    return summaries.filter(s => 
      (s.item.particulars && s.item.particulars.toLowerCase().includes(q)) ||
      (s.item.sku && s.item.sku.toLowerCase().includes(q)) ||
      (s.item.id && s.item.id.toLowerCase().includes(q))
    );
  }, [summaries, itemSearch]);

  // Load Data
  const loadMainData = async () => {
    setIsLoading(true);
    try {
      const sums = await getLatestPrices();
      setSummaries(sums);
    } catch (e) {
      toast.error('Failed to load market intelligence data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMainData();
  }, []);

  // Handle Analytics Item history fetch
  useEffect(() => {
    if (!analyticsItem) {
      setAnalyticsHistory([]);
      return;
    }
    const fetchAnHist = async () => {
      
      try {
        const { default: api } = await import('@/lib/api');
        const res = await api.get(`/market/prices?material_id=${analyticsItem.item.id}`);
        setAnalyticsHistory(res.data || []);
      } catch (e) {
        setAnalyticsHistory([]);
      }
    };
    fetchAnHist();
  }, [analyticsItem, analyticsRange]);

  // Top 10 Daily Movers (Market Momentum Index)
  const topMoversData = useMemo(() => {
    const validMovers: any[] = [];

    summaries.forEach(s => {
      let dodLocal: number | null = null;
      let dodInt: number | null = null;
      
      const tp = s.target_price;
      const lp = s.last_price;
      
      if (tp && lp) {
        if (tp.local_price != null && lp.local_price != null && lp.local_price > 0) {
          dodLocal = Number(((tp.local_price - lp.local_price) / lp.local_price * 100).toFixed(2));
        }
        if (tp.cif_price != null && lp.cif_price != null && lp.cif_price > 0) {
          dodInt = Number(((tp.cif_price - lp.cif_price) / lp.cif_price * 100).toFixed(2));
        }
      }
      
      if (dodLocal != null && (s.item.market_type === 'DXB' || s.item.market_type === 'BOTH')) {
        validMovers.push({
          summary: s,
          name: `[${s.item.sku || s.item.id}] ${s.item.particulars} (Local)`,
          pctChange: dodLocal,
          priceType: `Local (${tp?.currency || 'AED'})`,
          todayPrice: tp?.local_price,
          yesterdayPrice: lp?.local_price,
        });
      } else if (dodInt != null && (s.item.market_type === 'INT' || s.item.market_type === 'BOTH')) {
        validMovers.push({
          summary: s,
          name: `[${s.item.sku || s.item.id}] ${s.item.particulars} (CIF)`,
          pctChange: dodInt,
          priceType: `Intl CIF (${tp?.currency || 'USD'})`,
          todayPrice: tp?.cif_price,
          yesterdayPrice: lp?.cif_price,
        });
      }
    });

    return validMovers
      .sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
      .slice(0, 10);
  }, [summaries]);

  // Chart 1: Local vs International bar chart (with weekly aggregation if range > 30d)
  const chart1Data = useMemo(() => {
    if (!analyticsHistory.length) return [];
    const isWeekly = analyticsRange === '60d' || analyticsRange === '90d' || analyticsHistory.length > 30;

    if (!isWeekly) {
      return analyticsHistory.map(r => ({
        date: r.date.slice(5), // MM-DD
        fullDate: r.date,
        local: r.local_price ?? 0,
        cif: r.cif_price ?? 0,
        fob: r.fob_price ?? 0,
      }));
    }

    // Auto-aggregate into weekly buckets if range > 30 days
    const weeklyBuckets: { [key: string]: { date: string; local: number[]; cif: number[]; fob: number[] } } = {};
    analyticsHistory.forEach(r => {
      const dateObj = new Date(r.date);
      const weekNum = Math.ceil((dateObj.getDate() - 1 + new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay()) / 7);
      const weekKey = `${r.date.slice(0, 7)}-W${weekNum}`;
      if (!weeklyBuckets[weekKey]) {
        weeklyBuckets[weekKey] = { date: `W${weekNum} (${r.date.slice(5, 10)})`, local: [], cif: [], fob: [] };
      }
      if (r.local_price != null) weeklyBuckets[weekKey].local.push(r.local_price);
      if (r.cif_price != null) weeklyBuckets[weekKey].cif.push(r.cif_price);
      if (r.fob_price != null) weeklyBuckets[weekKey].fob.push(r.fob_price);
    });

    return Object.values(weeklyBuckets).map(b => ({
      date: b.date,
      fullDate: b.date,
      local: b.local.length ? Number((b.local.reduce((a, c) => a + c, 0) / b.local.length).toFixed(2)) : 0,
      cif: b.cif.length ? Number((b.cif.reduce((a, c) => a + c, 0) / b.cif.length).toFixed(2)) : 0,
      fob: b.fob.length ? Number((b.fob.reduce((a, c) => a + c, 0) / b.fob.length).toFixed(2)) : 0,
    }));
  }, [analyticsHistory, analyticsRange]);

  // Chart 2: Import Advantage (Local Dubai vs CIF import gap %)
  const chart2Data = useMemo(() => {
    return analyticsHistory
      .filter(r => r.local_price != null && r.cif_price != null && r.cif_price > 0)
      .map(r => {
        const dubaiPrice = r.local_price!;
        const cifPrice = r.cif_price!;
        const diffAmt = Number((dubaiPrice - cifPrice).toFixed(2));
        const spreadPct = Number(((diffAmt / cifPrice) * 100).toFixed(1));
        return {
          date: r.date.slice(5),
          fullDate: r.date,
          dubaiPrice,
          cifPrice,
          diffAmt,
          spreadPct
        };
      });
  }, [analyticsHistory]);

  // Chart 3: Estimated Shipping & Insurance Cost ($ USD, CIF minus FOB)
  const chart3Data = useMemo(() => {
    return analyticsHistory
      .filter(r => r.cif_price != null && r.fob_price != null)
      .map(r => ({
        date: r.date.slice(5),
        fullDate: r.date,
        cifPrice: r.cif_price!,
        fobPrice: r.fob_price!,
        freightCost: Number((r.cif_price! - r.fob_price!).toFixed(2))
      }));
  }, [analyticsHistory]);

  if (isLoading && summaries.length === 0) {
    return <PageLoader message="Loading market intelligence catalogue..." />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant pb-5">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
            <TrendingUp className="w-7 h-7 text-primary" />
            Overview & Analytics
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            View daily price changes and compare Local Dubai vs International rates.
          </p>
        </div>

        {/* Tab Selector with White & Green Accents */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('movers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'movers'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Activity className="w-4 h-4" />
            Top 10 Daily Movers
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Price Comparison
          </button>
        </div>
      </div>

      {/* =========================================================
          TAB 1: TOP 10 DAILY MOVERS (MARKET MOMENTUM INDEX)
      ========================================================= */}
      {activeTab === 'movers' && (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                Daily Price Changes
              </span>
              <h2 className="text-lg font-bold text-on-surface mt-2 flex items-center gap-2">
                Top 10 Daily Price Movers (% Change vs Yesterday)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Shows which commodity prices went up or down compared to yesterday. <strong className="text-emerald-700">Click any bar to view its price comparison chart in Tab 2.</strong>
              </p>
            </div>
          </div>

          {topMoversData.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-50/70 rounded-xl border border-dashed border-slate-300 font-medium space-y-2">
              <Info className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-semibold text-slate-700">No daily price fluctuations detected between yesterday and today across active items.</p>
              <p className="text-xs text-slate-400">Record new daily prices under Price Management to track day-over-day price jumps.</p>
            </div>
          ) : (
            <div className="h-[360px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topMoversData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 170, bottom: 5 }}
                  onClick={(e) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const clickedItem = e.activePayload[0].payload.summary;
                      setAnalyticsItem(clickedItem);
                      setActiveTab('analytics');
                      toast.success(`Loaded single-commodity charts for ${clickedItem.item.particulars}`);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    unit="%"
                    domain={[(dataMin: number) => Math.min(-10, Math.floor(dataMin)), (dataMax: number) => Math.max(10, Math.ceil(dataMax))]}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    width={170}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const diffAmt = (data.todayPrice != null && data.yesterdayPrice != null) 
                          ? Number((data.todayPrice - data.yesterdayPrice).toFixed(2)) 
                          : null;
                        const currSymbol = data.priceType.includes('$') ? '$' : 'AED';
                        return (
                          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1.5 min-w-[220px]">
                            <p className="font-bold text-slate-900 border-b border-slate-100 pb-1.5">{data.name}</p>
                            <div className="flex justify-between text-slate-600 gap-4">
                              <span>Today&apos;s Price:</span>
                              <span className="font-bold text-slate-900">{data.todayPrice != null ? `${data.todayPrice} ${currSymbol}` : '—'}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 gap-4">
                              <span>Yesterday&apos;s Price:</span>
                              <span className="font-bold text-slate-600">{data.yesterdayPrice != null ? `${data.yesterdayPrice} ${currSymbol}` : '—'}</span>
                            </div>
                            <div className="flex justify-between pt-1.5 border-t border-slate-100 font-bold gap-4">
                              <span>Day-over-Day Diff:</span>
                              <span className={data.pctChange > 0 ? 'text-emerald-600 font-extrabold' : 'text-rose-600 font-extrabold'}>
                                {diffAmt != null ? `${diffAmt > 0 ? '+' : ''}${diffAmt} ${currSymbol}` : ''} ({data.pctChange > 0 ? '+' : ''}{data.pctChange}%)
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="pctChange" radius={[0, 6, 6, 0]} cursor="pointer">
                    {topMoversData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.pctChange > 0 ? '#047857' : '#e11d48'}
                        className="hover:opacity-85 transition-opacity"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Quick Guidance Banner */}
          <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
            <span>💡 <strong>Pro Tip:</strong> Click any commodity in the chart above to view its Local Dubai (AED) vs International CIF & FOB ($) price comparison in Tab 2.</span>
            <button
              onClick={() => setActiveTab('analytics')}
              className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1 shrink-0 ml-4"
            >
              Go to Price Comparison <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: SINGLE-COMMODITY PRICE COMPARISON
      ========================================================= */}
      {activeTab === 'analytics' && (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Single-Commodity Price Comparison
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare Local Dubai Spot (AED) vs International CIF & FOB (USD) rates over time. Select a commodity below.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600">Time Window:</span>
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                {(['14d', '30d', '60d', '90d'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setAnalyticsRange(range)}
                    className={`px-3 py-1.5 rounded transition-all ${
                      analyticsRange === range ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {range.toUpperCase()} {range === '60d' || range === '90d' ? '(Wkly)' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Flipkart / E-Commerce Style Autocomplete Combobox Selector */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4" ref={dropdownRef}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 relative">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 shrink-0 flex items-center gap-1.5">
                <span>Select Commodity:</span>
              </label>

              {/* Autocomplete Search Input */}
              <div className="relative flex-1 max-w-xl w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="🔍 Search SKU or Name (e.g., SUG-01 or Sugar)..."
                  value={isDropdownOpen ? itemSearch : (analyticsItem ? `[SKU: ${analyticsItem.item.sku || analyticsItem.item.id}] ${analyticsItem.item.particulars}` : itemSearch)}
                  onFocus={() => {
                    setIsDropdownOpen(true);
                    setItemSearch('');
                  }}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    if (!isDropdownOpen) setIsDropdownOpen(true);
                  }}
                  onClick={() => {
                    if (!isDropdownOpen) setIsDropdownOpen(true);
                  }}
                  className="w-full pl-10 pr-14 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs placeholder:text-slate-400 placeholder:font-normal"
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {(itemSearch || analyticsItem) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemSearch('');
                        setAnalyticsItem(null);
                        setIsDropdownOpen(true);
                      }}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
                      title="Clear selection"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
                    title="Toggle dropdown"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Floating Autocomplete Dropdown List */}
                {isDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {filteredSummaries.length === 0 ? (
                      <div className="p-5 text-center text-xs font-bold text-slate-500">
                        No commodity found matching "{itemSearch}"
                      </div>
                    ) : (
                      filteredSummaries.map((s) => {
                        const isSelected = analyticsItem?.item.id === s.item.id;
                        return (
                          <button
                            key={s.item.id}
                            type="button"
                            onClick={() => {
                              setAnalyticsItem(s);
                              setIsDropdownOpen(false);
                              setItemSearch('');
                            }}
                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 text-xs font-bold transition-colors ${
                              isSelected 
                                ? 'bg-emerald-50 text-emerald-900 font-extrabold' 
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] border border-slate-200 font-bold shrink-0">
                                SKU: {s.item.sku || s.item.id}
                              </span>
                              <span className="text-sm font-bold text-slate-800">{s.item.particulars}</span>
                              {s.item.bagCtnWeight && (
                                <span className="text-slate-500 font-normal">({s.item.bagCtnWeight} kg)</span>
                              )}
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {analyticsItem && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs shrink-0 self-start lg:self-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                Active Profile: [SKU: {analyticsItem.item.sku || analyticsItem.item.id}] {analyticsItem.item.particulars}
              </span>
            )}
          </div>

          {/* FALLBACK DEFAULT STATE WHEN NO ITEM SELECTED */}
          {!analyticsItem ? (
            <div className="py-20 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-300 space-y-4 my-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 shadow-2xs">
                <BarChart3 className="w-8 h-8 text-emerald-700 animate-bounce-slow" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-800">Select an item to view Local Dubai vs International prices</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Use the commodity search bar above or click on any commodity in the Top 10 Daily Movers tab to view price comparison.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              {/* Chart 1: Side-by-side Price Comparison */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      1. Price Comparison: Local Dubai vs International ($)
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">Compare Dubai Spot prices (AED) against International CIF Landed and FOB Export prices (USD).</p>
                  </div>
                  {analyticsHistory.length > 30 && (
                    <span className="text-[11px] bg-amber-50 text-amber-800 font-mono px-2.5 py-1 rounded-md border border-amber-200 font-semibold self-start sm:self-auto">
                      ⚡ Auto-Aggregated into Weekly Buckets (&gt;30 days)
                    </span>
                  )}
                </div>

                <div className="h-[380px] w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart1Data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={12} fontWeight={600} />
                      <YAxis stroke="#64748b" fontSize={12} fontWeight={600} domain={[0, 'auto']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '13px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '16px', fontWeight: '700', color: '#1e293b' }} />
                      <Bar name="Local Dubai (AED)" dataKey="local" fill="#047857" radius={[4, 4, 0, 0]} />
                      <Bar name="International CIF ($)" dataKey="cif" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar name="International FOB ($)" dataKey="fob" fill="#d97706" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* SECONDARY CHARTS GRID: SIMPLE & BEAUTIFUL ARBITRAGE & LOGISTICS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* CHART 2: Import Advantage (Local vs CIF Gap) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        2. Import Advantage: Dubai vs CIF Gap (%)
                      </h4>
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
                        Arbitrage Indicator
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Shows the percentage difference between buying locally in Dubai vs importing via CIF. A positive percentage indicates local Dubai prices are trading at a premium over CIF imports.
                    </p>
                  </div>

                  <div className="h-64 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chart2Data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={11} fontWeight={600} />
                        <YAxis
                          stroke="#64748b"
                          fontSize={11}
                          fontWeight={600}
                          unit="%"
                          domain={[(dataMin: number) => Math.min(0, Math.floor(dataMin - 5)), (dataMax: number) => Math.max(15, Math.ceil(dataMax + 5))]}
                        />
                        <Tooltip
                          content={({ active, payload }: any) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1.5 min-w-[230px]">
                                  <p className="font-bold text-slate-900 border-b border-slate-100 pb-1.5">Date: {data.fullDate || data.date}</p>
                                  <div className="flex justify-between text-slate-600 gap-4">
                                    <span>Dubai Spot Price:</span>
                                    <span className="font-bold text-slate-900">{data.dubaiPrice} AED</span>
                                  </div>
                                  <div className="flex justify-between text-slate-600 gap-4">
                                    <span>Intl CIF Landed:</span>
                                    <span className="font-bold text-slate-900">{data.cifPrice} USD</span>
                                  </div>
                                  <div className="flex justify-between pt-1.5 border-t border-slate-100 font-bold gap-4">
                                    <span>Arbitrage Gap (Diff):</span>
                                    <span className={data.diffAmt > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-900 font-extrabold'}>
                                      {data.diffAmt > 0 ? '+' : ''}{data.diffAmt} ({data.spreadPct > 0 ? '+' : ''}{data.spreadPct}%)
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="spreadPct"
                          name="Dubai Premium/Discount (%)"
                          stroke="#059669"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorSpread)"
                          connectNulls
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* CHART 3: Freight & Insurance Cost ($ USD) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between hover:border-blue-200 transition-all">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        3. Estimated Shipping & Insurance Cost ($ USD)
                      </h4>
                      <span className="text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full shrink-0">
                        Logistics Delta
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Shows the estimated freight and insurance cost per unit over time (calculated as CIF Landed price minus FOB Export price).
                    </p>
                  </div>

                  <div className="h-64 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chart3Data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorFreight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={11} fontWeight={600} />
                        <YAxis stroke="#64748b" fontSize={11} fontWeight={600} unit=" $" domain={[0, 'auto']} />
                        <Tooltip
                          content={({ active, payload }: any) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1.5 min-w-[230px]">
                                  <p className="font-bold text-slate-900 border-b border-slate-100 pb-1.5">Date: {data.fullDate || data.date}</p>
                                  <div className="flex justify-between text-slate-600 gap-4">
                                    <span>Intl CIF Landed:</span>
                                    <span className="font-bold text-slate-900">{data.cifPrice} USD</span>
                                  </div>
                                  <div className="flex justify-between text-slate-600 gap-4">
                                    <span>Intl FOB Export:</span>
                                    <span className="font-bold text-slate-900">{data.fobPrice} USD</span>
                                  </div>
                                  <div className="flex justify-between pt-1.5 border-t border-slate-100 font-bold gap-4">
                                    <span>Est. Freight &amp; Ins.:</span>
                                    <span className="text-blue-600 font-extrabold">${data.freightCost} USD</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="freightCost"
                          name="Logistics Delta ($)"
                          stroke="#2563eb"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorFreight)"
                          connectNulls
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
