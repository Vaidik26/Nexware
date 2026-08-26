import { Banknote, TrendingUp, PackageSearch, Scale, Hash, Layers } from 'lucide-react';

const fmt = (v: number, kg: boolean = false) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(kg ? 0 : 1) + "K";
  return Math.round(v).toLocaleString();
};

export default function SalesKPIs({ data }: { data: any }) {
  if (!data || !data.kpis) return null;
  const k = data.kpis;

  const KpiCard = ({ label, value, sub, Icon, colorTheme }: any) => (
    <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
      <div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border group-hover:scale-105 transition-transform ${colorTheme}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">{label}</div>
        <div className="text-2xl font-extrabold text-on-surface whitespace-nowrap">{value}</div>
        {sub && <div className="text-xs text-slate-500 mt-2 font-medium">{sub}</div>}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiCard 
        label="Gross Sales" 
        value={fmt(k.gross)} 
        sub="before returns" 
        Icon={Banknote}
        colorTheme="bg-indigo-50 text-indigo-700 border-indigo-200" 
      />
      <KpiCard 
        label="Net Sales" 
        value={fmt(k.net)} 
        sub="after returns"
        Icon={TrendingUp}
        colorTheme="bg-emerald-50 text-emerald-700 border-emerald-200" 
      />
      <KpiCard 
        label="Volume Sold" 
        value={fmt(k.kg, true)} 
        sub="gross kg" 
        Icon={Scale}
        colorTheme="bg-amber-50 text-amber-700 border-amber-200" 
      />
      <KpiCard 
        label="Qty Sold" 
        value={fmt(k.qty, true)} 
        sub="gross units"
        Icon={Hash}
        colorTheme="bg-sky-50 text-sky-700 border-sky-200" 
      />
      <KpiCard 
        label="Avg Price / kg" 
        value={(k.kg > 0 ? k.gross / k.kg : 0).toFixed(3)} 
        sub="blended, gross" 
        Icon={PackageSearch}
        colorTheme="bg-violet-50 text-violet-700 border-violet-200" 
      />
      <KpiCard 
        label="SKUs in view" 
        value={k.skus || "—"} 
        sub="distinct items"
        Icon={Layers}
        colorTheme="bg-rose-50 text-rose-700 border-rose-200" 
      />
    </div>
  );
}
