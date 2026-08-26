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

export default function SalesCharts({ data }: { data: any, filters: any, onFilterChange: any }) {
  if (!data || !data.trend) return null;

  // Process data for charts
  const trendData = data.trend.map((t: any) => ({
    name: t[0], // month
    Gross: t[1],
    Net: t[2],
    Returns: t[3],
    Volume: t[4],
    ReturnPct: t[1] > 0 ? (t[3] / t[1]) * 100 : 0
  }));

  const formatYAxis = (tickItem: number) => {
    if (tickItem >= 1e6) return (tickItem / 1e6).toFixed(1) + 'M';
    if (tickItem >= 1e3) return (tickItem / 1e3).toFixed(0) + 'K';
    return tickItem.toString();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      
      {/* Sales Trend Chart */}
      <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="mb-4 flex justify-between items-start">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Sales trend — gross, net & volume</h2>
            <p className="text-xs text-slate-500 mt-0.5">Monthly</p>
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
              <Bar yAxisId="left" dataKey="Gross" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="left" dataKey="Net" fill="#B45309" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" type="monotone" dataKey="Volume" stroke="#059669" strokeWidth={3} dot={false} />
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
            <ComposedChart data={trendData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(val) => val + '%'} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                formatter={(value: number) => value.toFixed(2) + '%'}
              />
              <Line type="monotone" dataKey="ReturnPct" name="Return %" stroke="#DC2626" strokeWidth={2} dot={{ r: 3, fill: '#DC2626' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
