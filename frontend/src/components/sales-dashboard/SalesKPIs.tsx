import { Banknote, TrendingUp, Weight, PackageOpen, Calculator, Tags } from 'lucide-react';
import { clsx } from 'clsx';

const fmt = (v: number, kg: boolean = false) => {
  if (v == null || isNaN(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(kg ? 0 : 1) + "K";
  return Math.round(v).toLocaleString();
};

export default function SalesKPIs({ data }: { data: any }) {
  if (!data || !data.skus) return null;

  let gross = 0, rgross = 0, kg = 0, qty = 0, rqty = 0;
  data.skus.forEach((a: any) => {
    gross += Number(a[1]) || 0;
    rgross += Number(a[2]) || 0;
    kg += Number(a[3]) || 0;
    qty += Number(a[4]) || 0;
    rqty += Number(a[5]) || 0;
  });

  const k = {
    gross,
    net: gross - rgross,
    rgross,
    kg,
    qty,
    rqty,
    skus: data.skus.length
  };

  const KpiCard = ({ label, value, sub, Icon, gradient, textColor }: any) => (
    <div className="relative group overflow-hidden bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      {/* Background Gradient Blob */}
      <div className={clsx("absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition-opacity duration-500 blur-2xl", gradient)}></div>
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">{label}</div>
        <div className={clsx("p-2 rounded-lg shadow-sm border border-white/50 backdrop-blur-md", gradient, "text-white")}>
          <Icon size={16} strokeWidth={2.5} />
        </div>
      </div>
      
      <div className="relative z-10">
        <div className={clsx("text-3xl font-extrabold tracking-tight mb-1", textColor || "text-slate-900")}>
          {value}
        </div>
        {sub && (
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mt-2 bg-slate-50 inline-block px-2 py-1 rounded-md border border-slate-100">
            {sub}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <KpiCard 
        label="Gross Sales" 
        value={`OMR ${fmt(k.gross)}`} 
        sub="before returns" 
        Icon={Banknote}
        gradient="bg-gradient-to-br from-amber-400 to-amber-600" 
      />
      <KpiCard 
        label="Net Sales" 
        value={`OMR ${fmt(k.net)}`} 
        sub={`- OMR ${fmt(k.rgross)} returns (${((k.rgross / k.gross) * 100 || 0).toFixed(1)}%)`}
        Icon={TrendingUp}
        gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" 
      />
      <KpiCard 
        label="Volume Sold" 
        value={`${fmt(k.kg, true)} kg`} 
        sub="gross kg" 
        Icon={Weight}
        gradient="bg-gradient-to-br from-blue-500 to-indigo-600" 
      />
      <KpiCard 
        label="Qty Sold" 
        value={fmt(k.qty, true)} 
        sub={`units — ${fmt(k.rqty, true)} returned`}
        Icon={PackageOpen}
        gradient="bg-gradient-to-br from-cyan-500 to-blue-600" 
      />
      <KpiCard 
        label="Avg Price / kg" 
        value={`OMR ${(k.kg > 0 ? k.gross / k.kg : 0).toFixed(2)}`} 
        sub="blended, gross" 
        Icon={Calculator}
        gradient="bg-gradient-to-br from-violet-500 to-purple-700" 
      />
      <KpiCard 
        label="SKUs in view" 
        value={k.skus || "-"} 
        Icon={Tags}
        gradient="bg-gradient-to-br from-slate-600 to-slate-800" 
      />
    </div>
  );
}
