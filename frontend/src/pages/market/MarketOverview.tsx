import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Calendar, Filter, Activity, BarChart3, 
  PieChart as PieChartIcon, Package, DollarSign, 
  ArrowUpRight, ArrowDownRight, Info, LineChart
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Radar, LineChart as RechartsLineChart, Line
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import api from '@/lib/api';
import { convertCurrency, formatCurrencyDisplay } from '@/lib/currency';
import { PageLoader } from '@/components/ui/PageLoader';

// Types
interface RawMaterial {
  id: number;
  material_code: string;
  material_name: string;
  particulars?: string;
  category: string;
  market_type: string;
}

interface CapturedPrice {
  id: number;
  material_id: number;
  date: string;
  local_price_aed: number | null;
  local_price_omr: number | null;
  supplier?: string;
  cif_price: number | null;
  fob_price: number | null;
  material?: RawMaterial; // Joined on frontend for convenience
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

// Helper to format Date string
const formatDateStr = (dateStr: string) => {
  try { return format(parseISO(dateStr), 'MMM dd'); } catch { return dateStr; }
};

export default function MarketOverview() {
  // Global States
  const [activeTab, setActiveTab] = useState<'overview' | 'deepdive' | 'distribution'>('overview');
  
  // Filters
  const [datePreset, setDatePreset] = useState<'7d' | '14d' | '30d' | '90d' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [currencyView, setCurrencyView] = useState('DEFAULT');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [marketFilter, setMarketFilter] = useState('ALL');
  
  // Data States
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [prices, setPrices] = useState<CapturedPrice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Derived Date Range
  const { fromDate, toDate } = useMemo(() => {
    if (datePreset === 'custom') return { fromDate: customStart, toDate: customEnd };
    const days = parseInt(datePreset.replace('d', ''));
    return {
      fromDate: format(subDays(new Date(), days), 'yyyy-MM-dd'),
      toDate: format(new Date(), 'yyyy-MM-dd')
    };
  }, [datePreset, customStart, customEnd]);

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [mRes, pRes] = await Promise.all([
          api.get('/market/materials'),
          api.get(`/market/prices?date_from=${fromDate}&date_to=${toDate}`)
        ]);
        setMaterials(mRes.data);
        
        // Map materials to prices for easier processing
        const mats = mRes.data as RawMaterial[];
        const matMap = new Map(mats.map(m => [m.id, m]));
        const enrichedPrices = (pRes.data as CapturedPrice[]).map(p => ({
          ...p,
          material: matMap.get(p.material_id)
        }));
        setPrices(enrichedPrices);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [fromDate, toDate]);

  // Derived Filtered Prices (based on category & market)
  const filteredPrices = useMemo(() => {
    return prices.filter(p => {
      const m = p.material;
      if (!m) return false;
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) return false;
      if (marketFilter !== 'ALL' && m.market_type !== marketFilter && m.market_type !== 'BOTH') return false;
      return true;
    });
  }, [prices, categoryFilter, marketFilter]);

  const categories = useMemo(() => ['ALL', ...Array.from(new Set(materials.map(m => m.category))).filter(Boolean)], [materials]);

  // --- TAB 1: EXECUTIVE DASHBOARD DATA ---
  
  // KPIs
  const kpis = useMemo(() => {
    if (!filteredPrices.length) return { totalItems: 0, avgPrice: 0, topMover: null, topLoser: null };
    
    // Total unique items
    const uniqueIds = new Set(filteredPrices.map(p => p.material_id));
    
    // Average price (Converted)
    let sumPrice = 0;
    let count = 0;
    filteredPrices.forEach(p => {
      const targetCurr = currencyView === 'DEFAULT' ? 'AED' : currencyView;
      let cVal = 0;
      if (p.cif_price != null) cVal = convertCurrency(p.cif_price, 'USD', targetCurr) || 0;
      else if (p.local_price_aed != null) cVal = convertCurrency(p.local_price_aed, 'AED', targetCurr) || 0;
      else if (p.local_price_omr != null) cVal = convertCurrency(p.local_price_omr, 'OMR', targetCurr) || 0;
      else if (p.fob_price != null) cVal = convertCurrency(p.fob_price, 'USD', targetCurr) || 0;
      
      if (cVal > 0) {
        sumPrice += cVal;
        count++;
      }
    });
    const avgPrice = count > 0 ? sumPrice / count : 0;

    // Item Performance (Mover / Loser)
    const itemPerformances = Array.from(uniqueIds).map(id => {
      const itemPrices = filteredPrices.filter(p => p.material_id === id).sort((a, b) => a.date.localeCompare(b.date));
      if (itemPrices.length < 2) return null;
      
      const first = itemPrices[0];
      const last = itemPrices[itemPrices.length - 1];
      
      const targetCurr = currencyView === 'DEFAULT' ? 'AED' : currencyView;
      
      
      let v1 = 0;
        if (first.cif_price != null) v1 = convertCurrency(first.cif_price, 'USD', targetCurr) || 0;
        else if (first.local_price_aed != null) v1 = convertCurrency(first.local_price_aed, 'AED', targetCurr) || 0;
        else if (first.local_price_omr != null) v1 = convertCurrency(first.local_price_omr, 'OMR', targetCurr) || 0;
        else if (first.fob_price != null) v1 = convertCurrency(first.fob_price, 'USD', targetCurr) || 0;
      let v2 = 0;
        if (last.cif_price != null) v2 = convertCurrency(last.cif_price, 'USD', targetCurr) || 0;
        else if (last.local_price_aed != null) v2 = convertCurrency(last.local_price_aed, 'AED', targetCurr) || 0;
        else if (last.local_price_omr != null) v2 = convertCurrency(last.local_price_omr, 'OMR', targetCurr) || 0;
        else if (last.fob_price != null) v2 = convertCurrency(last.fob_price, 'USD', targetCurr) || 0;
      
      if (!v1 || !v2 || v1 === 0) return null;
      const pctChange = ((v2 - v1) / v1) * 100;
      
      return {
        item: first.material,
        pctChange,
        v1, v2, targetCurr
      };
    }).filter(Boolean) as any[];

    itemPerformances.sort((a, b) => b.pctChange - a.pctChange);
    
    return {
      totalItems: uniqueIds.size,
      avgPrice,
      topMover: itemPerformances[0] || null,
      topLoser: itemPerformances[itemPerformances.length - 1] || null,
      performances: itemPerformances
    };
  }, [filteredPrices, currencyView]);

  // Market Trend Index (Avg price per day)
  const trendData = useMemo(() => {
    const dailyMap = new Map<string, { sum: number, count: number }>();
    filteredPrices.forEach(p => {
      const targetCurr = currencyView === 'DEFAULT' ? 'AED' : currencyView;
        let cVal = 0;
        if (p.cif_price != null) cVal = convertCurrency(p.cif_price, 'USD', targetCurr) || 0;
        else if (p.local_price_aed != null) cVal = convertCurrency(p.local_price_aed, 'AED', targetCurr) || 0;
        else if (p.local_price_omr != null) cVal = convertCurrency(p.local_price_omr, 'OMR', targetCurr) || 0;
        else if (p.fob_price != null) cVal = convertCurrency(p.fob_price, 'USD', targetCurr) || 0;
        
        if (cVal > 0) {
        const current = dailyMap.get(p.date) || { sum: 0, count: 0 };
        dailyMap.set(p.date, { sum: current.sum + cVal, count: current.count + 1 });
      }
    });
    
    return Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date: formatDateStr(date),
        fullDate: date,
        avgPrice: Number((data.sum / data.count).toFixed(2))
      }));
  }, [filteredPrices, currencyView]);

  // Momentum (Top 5 & Bottom 5)
  const momentumData = useMemo(() => {
    const perfs = [...(kpis.performances || [])];
    const top = perfs.slice(0, 5);
    const bottom = perfs.slice(-5).filter(p => !top.includes(p)).reverse();
    return [...top, ...bottom].map(p => ({
      name: p.item.material_name || p.item.particulars,
      pctChange: Number(p.pctChange.toFixed(2)),
      v1: p.v1,
      v2: p.v2,
      currency: p.targetCurr
    }));
  }, [kpis.performances]);


  // --- TAB 2: COMMODITY DEEP DIVE ---
  const [selectedDeepDiveItemId, setSelectedDeepDiveItemId] = useState<number | 'ALL'>('ALL');
  
  // Set default deep dive item if empty
  useEffect(() => {
    if (selectedDeepDiveItemId === 'ALL' && materials.length > 0) {
      setSelectedDeepDiveItemId(materials[0].id);
    }
  }, [materials, selectedDeepDiveItemId]);

  const deepDiveItem = useMemo(() => materials.find(m => m.id === selectedDeepDiveItemId) || null, [materials, selectedDeepDiveItemId]);
  
  const deepDiveData = useMemo(() => {
    if (!deepDiveItem) return [];
    const itemPrices = prices.filter(p => p.material_id === deepDiveItem.id).sort((a, b) => a.date.localeCompare(b.date));
    
    return itemPrices.map(p => {
      const targetCurr = currencyView === 'DEFAULT' ? 'AED' : currencyView;
        const loc_aed = convertCurrency(p.local_price_aed, 'AED', targetCurr);
        const loc_omr = convertCurrency(p.local_price_omr, 'OMR', targetCurr);
        const cif = convertCurrency(p.cif_price, 'USD', targetCurr);
        const fob = convertCurrency(p.fob_price, 'USD', targetCurr);
      
      return {
        date: formatDateStr(p.date),
        fullDate: p.date,
        loc_aed: loc_aed ? Number(loc_aed.toFixed(2)) : null,
        loc_omr: loc_omr ? Number(loc_omr.toFixed(2)) : null,
        cif: cif ? Number(cif.toFixed(2)) : null,
        fob: fob ? Number(fob.toFixed(2)) : null,
        freightDelta: (cif && fob) ? Number((cif - fob).toFixed(2)) : null,
        currency: targetCurr
      };
    });
  }, [prices, deepDiveItem, currencyView]);


  // --- TAB 3: DISTRIBUTION ANALYTICS ---
  const categoryDistData = useMemo(() => {
    const counts: Record<string, number> = {};
    materials.forEach(m => {
      if (marketFilter !== 'ALL' && m.market_type !== marketFilter && m.market_type !== 'BOTH') return;
      counts[m.category] = (counts[m.category] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [materials, marketFilter]);

  const marketRadarData = useMemo(() => {
    const categories = Array.from(new Set(materials.map(m => m.category))).filter(Boolean);
    return categories.map(cat => {
      const catMats = materials.filter(m => m.category === cat);
      let dxb = 0; let int = 0; let both = 0;
      catMats.forEach(m => {
        if (m.market_type === 'DXB') dxb++;
        else if (m.market_type === 'INT') int++;
        else if (m.market_type === 'BOTH') { dxb++; int++; both++; }
      });
      return {
        category: cat,
        DXB: dxb,
        INT: int,
        BOTH: both,
        fullMark: Math.max(dxb, int, both, 5)
      };
    });
  }, [materials]);


  // --- RENDERERS ---

  if (isLoading && !materials.length) {
    return <PageLoader message="Synthesizing Marketing Intelligence..." />;
  }

  const renderTooltip = (props: any, formatAsCurrency = false) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
      return (
        <div className="backdrop-blur-md bg-white/95 border border-slate-200/60 shadow-xl rounded-xl p-4 min-w-[220px]">
          <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">{label || payload[0].payload.fullDate || payload[0].payload.name}</p>
          <div className="space-y-1.5">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex justify-between items-center text-sm gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                  <span className="text-slate-600 font-medium">{entry.name}:</span>
                </div>
                <span className="font-bold text-slate-900">
                  {formatAsCurrency 
                    ? formatCurrencyDisplay(entry.value, entry.payload.currency || (currencyView === 'DEFAULT' ? 'USD' : currencyView))
                    : entry.name.includes('%') || entry.dataKey === 'pctChange' ? `${entry.value}%` : entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 pb-12 min-h-screen">
      {/* HEADER & GLOBAL FILTERS */}
      <div className="bg-surface p-5 rounded-2xl border border-outline-variant shadow-sm space-y-4 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
              <TrendingUp className="w-7 h-7 text-primary" />
              Marketing Intelligence
            </h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              Advanced analytics and interactive insights powered by real-time captured prices.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500 ml-2 shrink-0" />
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as any)}
              className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none w-full py-1 cursor-pointer"
            >
              <option value="7d">Last 7 Days</option>
              <option value="14d">Last 14 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="custom">Custom Range...</option>
            </select>
          </div>
          
          {/* Category Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 shadow-xs">
            <Filter className="w-4 h-4 text-slate-500 ml-2 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none w-full py-1 cursor-pointer"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>)}
            </select>
          </div>

          {/* Market Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 shadow-xs">
            <Package className="w-4 h-4 text-slate-500 ml-2 shrink-0" />
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none w-full py-1 cursor-pointer"
            >
              <option value="ALL">All Markets</option>
              <option value="DXB">Dubai Spot (Local)</option>
              <option value="INT">International (CIF/FOB)</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-1.5 shadow-xs">
            <DollarSign className="w-4 h-4 text-blue-600 ml-2 shrink-0" />
            <select
              value={currencyView}
              onChange={(e) => setCurrencyView(e.target.value)}
              className="bg-transparent text-sm font-bold text-blue-700 focus:outline-none w-full py-1 cursor-pointer"
            >
              <option value="DEFAULT">Currency: Default</option>
              <option value="AED">Convert to AED</option>
              <option value="USD">Convert to USD</option>
              <option value="OMR">Convert to OMR</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers (Animates in if 'custom' is selected) */}
        <AnimatePresence>
          {datePreset === 'custom' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-4 pt-2 overflow-hidden"
            >
              <div className="flex items-center gap-2 text-sm bg-white border border-slate-300 rounded-lg px-3 py-1.5">
                <span className="text-slate-500 font-medium">From:</span>
                <input 
                  type="date" 
                  value={customStart} 
                  onChange={e => setCustomStart(e.target.value)}
                  className="focus:outline-none text-slate-800 font-semibold bg-transparent"
                />
              </div>
              <div className="flex items-center gap-2 text-sm bg-white border border-slate-300 rounded-lg px-3 py-1.5">
                <span className="text-slate-500 font-medium">To:</span>
                <input 
                  type="date" 
                  value={customEnd} 
                  onChange={e => setCustomEnd(e.target.value)}
                  className="focus:outline-none text-slate-800 font-semibold bg-transparent"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full sm:w-max">
        {[
          { id: 'overview', label: 'Executive Dashboard', icon: Activity },
          { id: 'deepdive', label: 'Commodity Deep Dive', icon: LineChart },
          { id: 'distribution', label: 'Distribution Analytics', icon: PieChartIcon }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-white text-primary shadow-sm ring-1 ring-slate-200/50'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-primary' : ''}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT (ANIMATED) */}
      <div className="relative">
        <AnimatePresence mode="wait">
          
          {/* --- TAB 1: OVERVIEW --- */}
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* KPI CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Commodities */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">Active Commodities</p>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Package className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 mt-2">{kpis.totalItems}</h3>
                  <p className="text-xs text-slate-400 mt-1">Matching current filters</p>
                </div>
                
                {/* Avg Price */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">Market Price Index</p>
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><BarChart3 className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 mt-2">
                    {formatCurrencyDisplay(kpis.avgPrice, currencyView === 'DEFAULT' ? 'USD' : currencyView)}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Average across all categories</p>
                </div>

                {/* Top Mover */}
                <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                  <div className="flex items-center justify-between relative">
                    <p className="text-sm font-medium text-slate-500">Top Market Mover</p>
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><ArrowUpRight className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-xl font-black text-emerald-700 mt-2 truncate pr-4">
                    {kpis.topMover?.item?.material_name || 'N/A'}
                  </h3>
                  <p className="text-sm font-bold text-emerald-600 mt-1">
                    {kpis.topMover ? `+${kpis.topMover.pctChange.toFixed(1)}% Jump` : '-'}
                  </p>
                </div>

                {/* Top Loser */}
                <div className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                  <div className="flex items-center justify-between relative">
                    <p className="text-sm font-medium text-slate-500">Biggest Price Drop</p>
                    <div className="p-2 bg-rose-100 text-rose-700 rounded-lg"><ArrowDownRight className="w-4 h-4" /></div>
                  </div>
                  <h3 className="text-xl font-black text-rose-700 mt-2 truncate pr-4">
                    {kpis.topLoser?.item?.material_name || 'N/A'}
                  </h3>
                  <p className="text-sm font-bold text-rose-600 mt-1">
                    {kpis.topLoser ? `${kpis.topLoser.pctChange.toFixed(1)}% Drop` : '-'}
                  </p>
                </div>
              </div>

              {/* CHARTS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Momentum Chart */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                  <div className="mb-6">
                    <h3 className="text-base font-bold text-slate-800">Market Momentum (% Change)</h3>
                    <p className="text-xs text-slate-500 mt-1">Top 5 increases and top 5 drops over the selected period.</p>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={momentumData} layout="vertical" margin={{ left: 50, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" fontSize={11} fontWeight={600} stroke="#94a3b8" unit="%" />
                        <YAxis dataKey="name" type="category" width={120} fontSize={10} fontWeight={600} stroke="#64748b" tick={{ fill: '#475569' }} />
                        <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} />
                        <Bar 
                          dataKey="pctChange" 
                          name="% Change" 
                          radius={[0, 4, 4, 0]}
                          animationDuration={1500}
                        >
                          {momentumData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pctChange > 0 ? '#10b981' : '#f43f5e'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Trend Index Chart */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                  <div className="mb-6">
                    <h3 className="text-base font-bold text-slate-800">Overall Price Trend Index</h3>
                    <p className="text-xs text-slate-500 mt-1">Daily average price across the filtered catalogue.</p>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" fontSize={11} fontWeight={600} stroke="#94a3b8" />
                        <YAxis fontSize={11} fontWeight={600} stroke="#94a3b8" domain={['auto', 'auto']} />
                        <Tooltip content={(props) => renderTooltip(props, true)} />
                        <Area 
                          type="monotone" 
                          dataKey="avgPrice" 
                          name="Market Avg" 
                          stroke="#3b82f6" 
                          strokeWidth={3} 
                          fill="url(#colorAvg)" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* --- TAB 2: DEEP DIVE --- */}
          {activeTab === 'deepdive' && (
            <motion.div 
              key="deepdive"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Select Commodity</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Isolate trends and logistics deltas for a specific raw material.</p>
                </div>
                <select
                  value={selectedDeepDiveItemId}
                  onChange={e => setSelectedDeepDiveItemId(Number(e.target.value))}
                  className="w-full sm:w-72 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.material_name || m.particulars}</option>
                  ))}
                </select>
              </div>

              {deepDiveData.length === 0 ? (
                <div className="py-20 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                  <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="font-semibold text-slate-600">No historical data found for this commodity in the selected date range.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Correlator Chart */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="mb-6 flex justify-between items-start">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Spot vs CIF vs FOB</h3>
                        <p className="text-xs text-slate-500 mt-1">Compare local vs international benchmarks.</p>
                      </div>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                        {currencyView === 'DEFAULT' ? deepDiveData[0]?.currency : currencyView}
                      </span>
                    </div>
                    <div className="flex-1 min-h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart data={deepDiveData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" fontSize={11} fontWeight={600} stroke="#94a3b8" />
                          <YAxis fontSize={11} fontWeight={600} stroke="#94a3b8" domain={['auto', 'auto']} />
                          <Tooltip content={(props) => renderTooltip(props, true)} />
                          <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="loc" name="Dubai Spot" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                          <Line type="monotone" dataKey="cif" name="Intl CIF" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                          <Line type="monotone" dataKey="fob" name="Intl FOB" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Freight Delta Chart */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="mb-6 flex justify-between items-start">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Logistics Delta</h3>
                        <p className="text-xs text-slate-500 mt-1">Estimated Shipping & Insurance (CIF - FOB).</p>
                      </div>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                        {currencyView === 'DEFAULT' ? deepDiveData[0]?.currency : currencyView}
                      </span>
                    </div>
                    <div className="flex-1 min-h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={deepDiveData}>
                          <defs>
                            <linearGradient id="colorDelta" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" fontSize={11} fontWeight={600} stroke="#94a3b8" />
                          <YAxis fontSize={11} fontWeight={600} stroke="#94a3b8" domain={[0, 'auto']} />
                          <Tooltip content={(props) => renderTooltip(props, true)} />
                          <Area 
                            type="monotone" 
                            dataKey="freightDelta" 
                            name="Freight Cost" 
                            stroke="#8b5cf6" 
                            strokeWidth={3} 
                            fill="url(#colorDelta)" 
                            connectNulls
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* --- TAB 3: DISTRIBUTION --- */}
          {activeTab === 'distribution' && (
            <motion.div 
              key="distribution"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Pie */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                  <div className="w-full mb-2">
                    <h3 className="text-base font-bold text-slate-800">Category Dominance</h3>
                    <p className="text-xs text-slate-500 mt-1">Breakdown of raw materials by category.</p>
                  </div>
                  <div className="w-full min-h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip content={renderTooltip} />
                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                        <Pie
                          data={categoryDistData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={5}
                          dataKey="value"
                          animationDuration={1500}
                        >
                          {categoryDistData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Market Radar */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                  <div className="w-full mb-2">
                    <h3 className="text-base font-bold text-slate-800">Market Availability Scope</h3>
                    <p className="text-xs text-slate-500 mt-1">Distribution of commodities across Local vs Intl markets.</p>
                  </div>
                  <div className="w-full min-h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={marketRadarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="category" tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip content={renderTooltip} />
                        <Radar name="Dubai Spot" dataKey="DXB" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                        <Radar name="International" dataKey="INT" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                        <Radar name="Both" dataKey="BOTH" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} />
                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
