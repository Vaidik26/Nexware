import React from 'react';

const fmt = (v: number, kg: boolean = false) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(kg ? 0 : 1) + "K";
  return Math.round(v).toLocaleString();
};

export default function SalesKPIs({ data }: { data: any; bootData: any }) {
  if (!data || !data.kpis) return null;
  const k = data.kpis;

  const KpiCard = ({ label, value, sub, colorClass }: any) => (
    <div className="relative bg-white border border-slate-200 rounded-xl p-4 overflow-hidden shadow-sm">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`}></div>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 whitespace-nowrap">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1 font-medium">{sub}</div>}
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiCard 
        label="Gross Sales" 
        value={fmt(k.gross)} 
        sub="before returns" 
        colorClass="bg-amber-500" 
      />
      <KpiCard 
        label="Net Sales" 
        value={fmt(k.net)} 
        colorClass="bg-amber-700" 
      />
      <KpiCard 
        label="Volume Sold" 
        value={fmt(k.kg, true)} 
        sub="gross kg" 
        colorClass="bg-emerald-600" 
      />
      <KpiCard 
        label="Qty Sold" 
        value={fmt(k.qty, true)} 
        colorClass="bg-emerald-600" 
      />
      <KpiCard 
        label="Avg Price / kg" 
        value={(k.kg > 0 ? k.gross / k.kg : 0).toFixed(3)} 
        sub="blended, gross" 
        colorClass="bg-slate-800" 
      />
      <KpiCard 
        label="SKUs in view" 
        value={k.skus || "—"} 
        colorClass="bg-slate-800" 
      />
    </div>
  );
}
