import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { clsx } from 'clsx';

export default function PriceTrends({ data }: { data: any, settings: any }) {
  const [market, setMarket] = useState('DUBAI|LOCAL'); // 'DUBAI|LOCAL', 'INT|CIF', 'INT|FOB'
  const [q, setQ] = useState('');
  const [selectedRm, setSelectedRm] = useState<string | null>(null);

  const seriesData = useMemo(() => {
    if (!data || !data.series) return [];
    
    // get list of RMs that have series data for this market
    const validRms = data.rms.filter((r: any) => data.series[r.name + '|' + market]);

    let filtered = validRms;
    const query = q.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((r: any) => r.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [data, market, q]);

  // Set default selection
  useMemo(() => {
    if (seriesData.length > 0 && (!selectedRm || !seriesData.find((r: any) => r.name === selectedRm))) {
      setSelectedRm(seriesData[0].name);
    } else if (seriesData.length === 0) {
      setSelectedRm(null);
    }
  }, [seriesData, selectedRm]);

  const chartData = useMemo(() => {
    if (!selectedRm || !data || !data.series) return [];
    
    const key = selectedRm + '|' + market;
    const s = data.series[key];
    if (!s) return [];

    // s.pts is an array of [date_string, value]
    return s.pts.map((pt: any) => ({
      date: pt[0],
      value: pt[1]
    }));
  }, [data, selectedRm, market]);

  const yUnit = useMemo(() => {
    if (!selectedRm || !data || !data.series) return '';
    const s = data.series[selectedRm + '|' + market];
    return s ? s.u : '';
  }, [data, selectedRm, market]);

  return (
    <div className="space-y-6">
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
          <label className="text-sm font-semibold text-slate-600">Market Basis:</label>
          <div className="flex bg-slate-100 p-1 rounded-md">
            <button
              onClick={() => setMarket('DUBAI|LOCAL')}
              className={clsx("px-3 py-1.5 text-xs font-semibold rounded transition-colors", market === 'DUBAI|LOCAL' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
            >
              Dubai Local
            </button>
            <button
              onClick={() => setMarket('INT|CIF')}
              className={clsx("px-3 py-1.5 text-xs font-semibold rounded transition-colors", market === 'INT|CIF' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
            >
              Intl CIF
            </button>
            <button
              onClick={() => setMarket('INT|FOB')}
              className={clsx("px-3 py-1.5 text-xs font-semibold rounded transition-colors", market === 'INT|FOB' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
            >
              Intl FOB
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Item Selector */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-[600px] overflow-y-auto">
          <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Materials</h3>
          <div className="flex flex-col gap-1.5">
            {seriesData.map((r: any) => (
              <button
                key={r.name}
                onClick={() => setSelectedRm(r.name)}
                className={clsx(
                  "text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
                  selectedRm === r.name 
                    ? "bg-primary text-white border-primary" 
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                )}
              >
                {r.name}
              </button>
            ))}
            {seriesData.length === 0 && (
              <div className="text-sm text-slate-500 p-2">No quotes found.</div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-6">
          {selectedRm ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">{selectedRm}</h2>
                <p className="text-sm text-slate-500">{yUnit}</p>
              </div>
              <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#64748B' }} 
                      dy={10} 
                      minTickGap={30}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#64748B' }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#0F172A', marginBottom: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#2F6F62" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#2F6F62', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: '#D99A21', strokeWidth: 0 }}
                      name={market}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a raw material to view price trends
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
