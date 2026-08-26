import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { clsx } from 'clsx';

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function bucketKey(dateStr: string, gran: string) {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(5, 7)) - 1;
  if (gran === "Y") return `${y}`;
  if (gran === "Q") return `${y} Q${Math.floor(m / 3) + 1}`;
  return `${MONTHS[m]} ${y.toString().slice(2)}`;
}

export default function SalesCharts({ data }: { data: any, filters: any, onFilterChange: any }) {
  const [gran, setGran] = useState('M');

  const { trendData, returnsData } = useMemo(() => {
    if (!data || !data.trend) return { trendData: [], returnsData: [] };

    const bm = new Map();
    data.trend.forEach((t: any) => {
      // t is ["YYYY-MM", gross, net, kg]
      const key = bucketKey(t[0], gran);
      if (!bm.has(key)) {
        bm.set(key, { name: key, Gross: 0, Net: 0, Returns: 0, Volume: 0 });
      }
      const x = bm.get(key);
      x.Gross += (t[1] || 0);
      x.Net += (t[2] || 0);
      const gross = t[1] || 0;
      const net = t[2] || 0;
      x.Returns += (gross - net);
      x.Volume += (t[3] || 0);
    });

    const trend = Array.from(bm.values()).map(x => ({
      ...x,
      ReturnPct: x.Gross > 0 ? (x.Returns / x.Gross) * 100 : 0
    }));

    return { trendData: trend, returnsData: trend };
  }, [data, gran]);

  if (!data || !data.trend) return null;

  const formatYAxis = (tickItem: number) => {
    if (tickItem >= 1e6) return (tickItem / 1e6).toFixed(1) + 'M';
    if (tickItem >= 1e3) return (tickItem / 1e3).toFixed(0) + 'K';
    return tickItem.toString();
  };

  const GranButton = ({ label, active, disabled = false }: { label: string, active: boolean, disabled?: boolean }) => (
    <button
      disabled={disabled}
      onClick={() => !disabled && setGran(label)}
      className={clsx(
        "px-2 py-1 text-xs font-bold rounded transition-colors",
        disabled ? "text-slate-300 cursor-not-allowed" :
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      
      {/* Sales Trend Chart */}
      <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="mb-4 flex justify-between items-start">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Sales trend — gross, net & volume</h2>
            <p className="text-xs text-slate-500 mt-0.5">Monthly · bars = volume (kg) · solid = gross (OMR) · dashed = net of returns (OMR)</p>
          </div>
          <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            <span className="px-2 py-1 text-xs text-slate-300 font-bold">W-n/a</span>
            <GranButton label="M" active={gran === 'M'} />
            <GranButton label="Q" active={gran === 'Q'} />
            <GranButton label="Y" active={gran === 'Y'} />
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={formatYAxis} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={formatYAxis} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                formatter={(value: number) => new Intl.NumberFormat('en-US').format(value)}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar yAxisId="right" dataKey="Volume" fill="#80bea6" opacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={40} />
              <Line yAxisId="left" type="monotone" dataKey="Gross" stroke="#003527" strokeWidth={2.5} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="Net" stroke="#006c49" strokeWidth={2.5} strokeDasharray="5 5" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Returns Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-slate-900">Sales returns over time</h2>
          <p className="text-xs text-slate-500 mt-0.5">Returns as % of gross per period</p>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={returnsData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(val) => val + '%'} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                formatter={(value: number) => value.toFixed(2) + '%'}
              />
              <Bar dataKey="ReturnPct" name="Return %" fill="#003527" maxBarSize={30} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
