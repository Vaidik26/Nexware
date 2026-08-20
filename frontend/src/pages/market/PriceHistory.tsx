import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  Calendar, 
  Download, 
  Printer, 
  Search, 
  ArrowLeft, 
  BarChart2, 
  Table as TableIcon, 
  Filter, 
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getItems, getPriceHistory, Item, PriceRecord } from '@/lib/data/priceService';

export default function PriceHistory() {
  const navigate = useNavigate();

  const [items, setItems] = useState<Item[]>([]);
  const [allRecords, setAllRecords] = useState<PriceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Range State
  const [filterPreset, setFilterPreset] = useState<'today' | 'yesterday' | '3days' | 'week' | 'month' | 'custom'>('week');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');

  // View Mode: Tabbed Daily Sheet vs Comparative Bar Chart
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [selectedDateTab, setSelectedDateTab] = useState<string>('');

  const todayStr = new Date().toISOString().split('T')[0];

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const yesterdayStr = getYesterdayStr();

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const allItems = await getItems().catch(() => []);
      const validItems = Array.isArray(allItems) ? allItems.filter(Boolean) : [];
      setItems(validItems);

      // Pull historical records across all items concurrently
      const perItemPromises = validItems.map(i => i?.id ? getPriceHistory(i.id, 'all').catch(() => []) : Promise.resolve([]));
      const combined = (await Promise.all(perItemPromises)).flat().filter(Boolean);
      
      // Sort ascending chronologically
      const sorted = combined.sort((a: any, b: any) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());
      setAllRecords(sorted);
    } catch (err) {
      toast.error('Failed to retrieve historical pricing repository');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Compute date boundaries based on filterPreset
  const getFilteredDates = (): string[] => {
    try {
      let startDate = '';
      let endDate = todayStr;
      const d = new Date();

      if (filterPreset === 'today') {
        startDate = todayStr;
        endDate = todayStr;
      } else if (filterPreset === 'yesterday') {
        startDate = yesterdayStr;
        endDate = yesterdayStr;
      } else if (filterPreset === '3days') {
        d.setDate(d.getDate() - 2);
        startDate = d.toISOString().split('T')[0];
      } else if (filterPreset === 'week') {
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString().split('T')[0];
      } else if (filterPreset === 'month') {
        d.setMonth(d.getMonth() - 1);
        startDate = d.toISOString().split('T')[0];
      } else if (filterPreset === 'custom') {
        startDate = customStart || '2000-01-01';
        endDate = customEnd || todayStr;
      }

      const uniqueDates = Array.from(new Set((allRecords || []).map(r => r?.date).filter(Boolean)))
        .filter(date => date >= startDate && date <= endDate)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

      if (uniqueDates.length === 0) {
        if (filterPreset === 'today') return [todayStr];
        if (filterPreset === 'yesterday') return [yesterdayStr];
      }
      return uniqueDates;
    } catch (e) {
      return [todayStr];
    }
  };

  const availableDates = getFilteredDates();

  useEffect(() => {
    if (availableDates.length > 0 && (!selectedDateTab || !availableDates.includes(selectedDateTab))) {
      setSelectedDateTab(availableDates[0]);
    }
  }, [availableDates, selectedDateTab]);

  const filteredItems = (items || []).filter(i => {
    if (!i) return false;
    if (!search.trim()) return true;
    const lower = search.toLowerCase();
    const name = (i.particulars || '').toLowerCase();
    const id = (i.id || '').toLowerCase();
    const sku = (i.sku || '').toLowerCase();
    return name.includes(lower) || id.includes(lower) || sku.includes(lower);
  });

  const handleClearFilters = () => {
    setFilterPreset('week');
    setSearch('');
    toast.success("Filters reset to default");
  };

  const getRecordForDate = (itemId: string, targetDate: string): PriceRecord | undefined => {
    if (!allRecords || !itemId || !targetDate) return undefined;
    return allRecords.find(r => r?.itemId === itemId && r?.date === targetDate);
  };

  const activeDate = selectedDateTab || todayStr;
  const chartData = filteredItems.map(item => {
    if (!item) return null;
    const rec = getRecordForDate(item.id, activeDate);
    const local = typeof rec?.dubaiLocalPrice === 'number' ? rec.dubaiLocalPrice : 0;
    const cif = typeof rec?.internationalCIF === 'number' ? rec.internationalCIF : 0;
    const fob = typeof rec?.internationalFOB === 'number' ? rec.internationalFOB : 0;
    const title = item.particulars || 'Unnamed Commodity';
    const shortTitle = title.length > 18 ? `${title.substring(0, 16)}..` : title;
    
    return {
      itemId: item.id || Math.random().toString(),
      name: title,
      shortName: shortTitle,
      weight: item.bagCtnWeight !== null && item.bagCtnWeight !== undefined ? `${item.bagCtnWeight} kg` : 'Standard Unit',
      dubaiLocal: local,
      internationalCIF: cif,
      internationalFOB: fob,
      hasData: local > 0 || cif > 0 || fob > 0
    };
  }).filter(Boolean) as Array<{
    itemId: string;
    name: string;
    shortName: string;
    weight: string;
    dubaiLocal: number;
    internationalCIF: number;
    internationalFOB: number;
    hasData: boolean;
  }>;

  const handleExportRangeCSV = () => {
    if (!availableDates || availableDates.length === 0 || !items || items.length === 0) {
      toast.error('No historical records found for the selected time range');
      return;
    }

    const headers = ['Record Date,S.No,Commodity Item Name,Bag/Carton Weight,Local Dubai Price (AED),International CIF ($ USD),International FOB ($ USD)\n'];
    const rows: string[] = [];

    availableDates.forEach(date => {
      filteredItems.forEach((item, idx) => {
        if (!item) return;
        const rec = getRecordForDate(item.id, date);
        const localVal = rec?.dubaiLocalPrice != null ? rec.dubaiLocalPrice : '—';
        const cifVal = rec?.internationalCIF != null ? rec.internationalCIF : '—';
        const fobVal = rec?.internationalFOB != null ? rec.internationalFOB : '—';
        const weight = item.bagCtnWeight ? `${item.bagCtnWeight} kg` : 'Standard Unit';
        rows.push(`"${date}",${idx + 1},"${item.particulars || 'Unnamed'}","${weight}","${localVal}","${cifVal}","${fobVal}"`);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + headers.concat(rows.join('\n'));
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NexWare_Historical_Prices_${filterPreset}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Downloaded historical market range as CSV!');
  };

  const handleExportRangePDF = () => {
    if (!availableDates || availableDates.length === 0 || !items || items.length === 0) {
      toast.error('No historical data available to print');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to open the print preview.');
      return;
    }

    const sectionsHtml = availableDates.map(date => {
      const dateFormatted = new Date(date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
      const tableRows = filteredItems.map((item, idx) => {
        if (!item) return '';
        const rec = getRecordForDate(item.id, date);
        const localVal = typeof rec?.dubaiLocalPrice === 'number' ? `${rec.dubaiLocalPrice.toFixed(2)} AED` : '—';
        const cifVal = typeof rec?.internationalCIF === 'number' ? `$${rec.internationalCIF.toFixed(2)}` : '—';
        const fobVal = typeof rec?.internationalFOB === 'number' ? `$${rec.internationalFOB.toFixed(2)}` : '—';
        const weight = item.bagCtnWeight ? `${item.bagCtnWeight} kg` : 'N/A';

        return `
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: 600;">${item.particulars || 'Unnamed'}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${weight}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 600;">${localVal}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 600;">${cifVal} | ${fobVal} (FOB)</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="date-section">
          <div class="date-title">📅 Date Record: ${dateFormatted} (${date})</div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">S.No</th>
                <th>Commodity Name</th>
                <th style="width: 110px; text-align: center;">Bag/Ctn Weight</th>
                <th style="width: 140px; text-align: right;">Local Dubai Price</th>
                <th style="width: 220px; text-align: right;">International (CIF & FOB)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <html>
        <head>
          <title>NexWare Historical Price Report - ${todayStr}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #1e293b; }
            h1 { color: #0f172a; margin: 0 0 5px 0; font-size: 20px; }
            p.sub { color: #64748b; margin: 0 0 25px 0; font-size: 13px; }
            .date-section { margin-bottom: 35px; page-break-inside: avoid; }
            .date-title { font-size: 14px; font-weight: 600; background: #f1f5f9; padding: 8px 12px; border: 1px solid #cbd5e1; border-bottom: none; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; }
            th { background-color: #f8fafc; padding: 10px 8px; border: 1px solid #cbd5e1; font-size: 11px; text-align: left; }
            td { font-size: 13px; }
            .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          </style>
        </head>
        <body>
          <h1>NexWare Historical Price Audit Report</h1>
          <p class="sub">Generated on ${new Date().toLocaleString()} | Scope: <strong>${filterPreset.toUpperCase()}</strong> (${availableDates.length} trading days)</p>
          ${sectionsHtml}
          <div class="footer">
            Generated by NexWare ERP Commodity Intelligence Engine.
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    toast.success('Generated Date-Wise PDF Report');
  };

  if (isLoading) {
    return <PageLoader message="Loading Historical Records..." subtitle="Connecting to valuation repository" />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header matching Warehouse Ops standard */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/market/prices')} 
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Daily Capture Sheet
          </button>
          <h1 className="text-2xl font-bold text-on-surface">Historical Price Exploration</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Navigate past trading dates tab-wise or evaluate side-by-side Local Dubai vs. International (CIF & FOB) valuations on the animated bar chart.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleExportRangeCSV}>
            <Download className="w-4 h-4 mr-2 text-secondary" /> Export Range CSV
          </Button>
          <Button variant="outline" onClick={handleExportRangePDF}>
            <Printer className="w-4 h-4 mr-2 text-primary" /> Export Range PDF
          </Button>

          <Button 
            onClick={() => setViewMode(viewMode === 'table' ? 'chart' : 'table')} 
            className="shadow-md"
          >
            {viewMode === 'table' ? (
              <span className="flex items-center gap-1.5"><BarChart2 className="w-4 h-4" /> Sourcing Comparison Chart</span>
            ) : (
              <span className="flex items-center gap-1.5"><TableIcon className="w-4 h-4" /> Date Tabs Sheet View</span>
            )}
          </Button>
        </div>
      </div>

      {/* Filter and Range Selection Bar */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5 mr-1">
              <Filter className="w-4 h-4 text-primary" /> Filter Date:
            </span>
            {(['today', 'yesterday', '3days', 'week', 'month', 'custom'] as const).map((preset) => {
              const label = { 
                today: 'Today', 
                yesterday: 'Yesterday', 
                '3days': 'Last 3 Days', 
                week: 'This Week', 
                month: 'This Month', 
                custom: 'Custom Range' 
              }[preset];
              const active = filterPreset === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setFilterPreset(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active 
                      ? 'bg-primary text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-slate-500 hover:text-red-600 text-xs font-medium ml-1"
              title="Clear active filters"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear Filters
            </Button>
          </div>

          <div className="flex max-w-xs w-full relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search commodity title or SKU..."
              className="w-full pl-10 pr-4 py-2 bg-surface rounded-xl border border-outline-variant focus:outline-none focus:border-primary text-sm transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Custom Calendar Pickers */}
        {filterPreset === 'custom' && (
          <div className="pt-4 border-t border-outline-variant flex flex-wrap items-center gap-4 bg-slate-50/70 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-slate-700 uppercase">Select Calendar Range:</span>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Start Date</label>
                <input
                  type="date"
                  max={todayStr}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant bg-white font-mono text-sm text-on-surface focus:border-primary"
                />
              </div>
              <span className="text-slate-400 font-bold mt-5">&rarr;</span>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">End Date</label>
                <input
                  type="date"
                  max={todayStr}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant bg-white font-mono text-sm text-on-surface focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TRADING DAY TABS */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant shadow-sm overflow-x-auto flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
          Trading Day Tabs:
        </span>
        {availableDates.length === 0 ? (
          <span className="text-sm text-slate-500 font-medium px-2">No trading dates found in the selected filter range.</span>
        ) : (
          availableDates.map((date) => {
            const isSelected = date === activeDate;
            const isToday = date === todayStr;
            const isYesterday = date === yesterdayStr;
            const dayLabel = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return (
              <button
                key={date}
                onClick={() => setSelectedDateTab(date)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
                  isSelected 
                    ? 'bg-slate-900 text-white shadow-xs' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <Calendar className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
                <span>{dayLabel}</span>
                {isToday && <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded font-mono ml-1">Today</span>}
                {isYesterday && <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded font-mono ml-1">Yesterday</span>}
              </button>
            );
          })
        )}
      </div>

      {viewMode === 'table' ? (
        <div className="space-y-4">
          {/* TABLE FOR SELECTED DATE TAB */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-outline-variant flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Showing Market Sheet for Date: <strong className="text-primary">{activeDate}</strong>
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {filteredItems.length} Commodities
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-outline-variant font-semibold">
                    <th className="py-3.5 px-4 border-r border-outline-variant text-center w-14">S.No</th>
                    <th className="py-3.5 px-6 border-r border-outline-variant">Commodity Item Name</th>
                    <th className="py-3.5 px-4 border-r border-outline-variant text-center w-36">Bag / Ctn Weight</th>
                    <th className="py-3.5 px-5 border-r border-outline-variant text-right w-48">
                      Local Dubai Price (AED)
                    </th>
                    <th className="py-3.5 px-6 border-outline-variant text-right min-w-[240px]">
                      International Rates (CIF & FOB)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-sm">
                  {!filteredItems || filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 font-medium">
                        No commodities match your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      if (!item) return null;
                      const rec = getRecordForDate(item.id, activeDate);
                      const local = typeof rec?.dubaiLocalPrice === 'number' ? rec.dubaiLocalPrice : null;
                      const cif = typeof rec?.internationalCIF === 'number' ? rec.internationalCIF : null;
                      const fob = typeof rec?.internationalFOB === 'number' ? rec.internationalFOB : null;

                      return (
                        <tr key={item.id || Math.random().toString()} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 border-r border-outline-variant text-center font-mono text-xs text-slate-500 font-medium">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-6 border-r border-outline-variant font-semibold text-on-surface">
                            {item.particulars || 'Unnamed Commodity'}
                          </td>
                          <td className="py-3.5 px-4 border-r border-outline-variant text-center font-mono text-xs text-slate-700">
                            {item.bagCtnWeight !== null && item.bagCtnWeight !== undefined ? `${item.bagCtnWeight} kg` : 'Standard'}
                          </td>
                          <td className="py-3.5 px-5 border-r border-outline-variant text-right font-mono font-semibold">
                            {local !== null ? (
                              <span className="text-emerald-700">{local.toFixed(2)} AED</span>
                            ) : (
                              <span className="text-slate-400 font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-6 text-right font-mono text-xs">
                            {(cif !== null || fob !== null) ? (
                              <div className="inline-flex items-center justify-end gap-2">
                                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-semibold border border-blue-200">
                                  CIF: {cif !== null ? `$${cif.toFixed(2)}` : '—'}
                                </span>
                                <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded font-semibold border border-amber-200">
                                  FOB: {fob !== null ? `$${fob.toFixed(2)}` : '—'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-normal text-sm">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ANIMATED COMPARATIVE SOURCING BAR CHART VIEW */
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
            <div>
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <span>Local Dubai vs. International (CIF & FOB) Sourcing Comparison</span>
                <span className="bg-primary/10 text-primary text-xs font-mono px-2 py-0.5 rounded border border-primary/20">{activeDate}</span>
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Side-by-side animated bar evaluation showing instantly at a glance whether it is cheaper to source items locally in Dubai or import via CIF / FOB.
              </p>
            </div>
          </div>

          <div className="h-96 w-full pt-4 min-h-[350px]">
            {chartData.filter(d => d.hasData).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-outline-variant rounded-xl bg-slate-50/50 text-slate-500 p-6 text-center">
                <BarChart2 className="w-10 h-10 text-slate-300 mb-2" />
                <span className="font-semibold text-sm">No valuation prices recorded for this date ({activeDate})</span>
                <span className="text-xs text-slate-400 mt-1">Switch trading day tabs above or enter prices in Daily Capture Sheet to render side-by-side sourcing bars.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart 
                  data={chartData} 
                  barGap={8} 
                  margin={{ top: 15, right: 30, left: 10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="shortName" 
                    stroke="#64748b" 
                    fontSize={12} 
                    fontWeight={600}
                    tick={{ fill: '#334155' }}
                    dy={10} 
                  />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={12} 
                    dx={-8}
                    domain={[0, 'auto']}
                    tickFormatter={(val) => `${val}`}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      try {
                        if (active && payload && payload.length) {
                          const dataItem = chartData.find(c => c && (c.shortName === label || c.name === label));
                          const localVal = dataItem?.dubaiLocal || 0;
                          const cifVal = dataItem?.internationalCIF || 0;
                          const fobVal = dataItem?.internationalFOB || 0;

                          let advice = "Single market quote recorded";
                          if (localVal > 0 && cifVal > 0) {
                            advice = localVal < cifVal ? "✅ Cheaper to source locally in Dubai" : "✅ Cheaper to import via CIF";
                          }

                          return (
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-lg min-w-72 text-xs space-y-2.5">
                              <div className="font-bold text-slate-900 text-sm pb-1.5 border-b border-slate-100 flex items-center justify-between">
                                <span>{dataItem?.name || label || 'Commodity'}</span>
                                <span className="font-mono font-normal text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{dataItem?.weight || 'Std'}</span>
                              </div>
                              
                              <div className="space-y-1.5 pt-0.5 font-mono">
                                <div className="flex justify-between items-center text-emerald-700 font-semibold bg-emerald-50/50 p-1 rounded">
                                  <span>Local Dubai Price:</span>
                                  <span>{localVal > 0 ? `${localVal.toFixed(2)} AED` : '—'}</span>
                                </div>
                                <div className="flex justify-between items-center text-blue-700 font-semibold bg-blue-50/50 p-1 rounded">
                                  <span>International CIF Price:</span>
                                  <span>{cifVal > 0 ? `$${cifVal.toFixed(2)} USD` : '—'}</span>
                                </div>
                                <div className="flex justify-between items-center text-amber-700 font-semibold bg-amber-50/50 p-1 rounded">
                                  <span>International FOB Price:</span>
                                  <span>{fobVal > 0 ? `$${fobVal.toFixed(2)} USD` : '—'}</span>
                                </div>
                              </div>

                              {localVal > 0 && cifVal > 0 && (
                                <div className="pt-2 border-t border-slate-100 font-sans font-semibold text-slate-700 bg-slate-50/80 -mx-1 p-1.5 rounded text-[11px] text-center">
                                  {advice}
                                </div>
                              )}
                            </div>
                          );
                        }
                      } catch (e) {
                        return null;
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: '600', fontSize: '12px' }} />
                  
                  <Bar 
                    dataKey="dubaiLocal" 
                    name="Local Dubai Price (AED)" 
                    fill="#059669" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={45}
                    isAnimationActive={true}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                  
                  <Bar 
                    dataKey="internationalCIF" 
                    name="International CIF Price ($ USD)" 
                    fill="#2563eb" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={45}
                    isAnimationActive={true}
                    animationDuration={1400}
                    animationEasing="ease-out"
                  />

                  <Bar 
                    dataKey="internationalFOB" 
                    name="International FOB Price ($ USD)" 
                    fill="#d97706" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={45}
                    isAnimationActive={true}
                    animationDuration={1600}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
