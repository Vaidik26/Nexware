const fmt = (v: number, kg: boolean = false) => {
  if (v == null || isNaN(v)) return "—";
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

  const KpiCard = ({ label, value, sub, borderColor, valueColor = "text-slate-900" }: any) => (
    <div className="relative bg-white border border-slate-200 rounded-xl p-4 overflow-hidden shadow-sm flex flex-col justify-center min-h-[100px]">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${borderColor}`}></div>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1 ml-2">{label}</div>
      <div className={`text-2xl font-extrabold whitespace-nowrap ml-2 ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1 ml-2 font-medium">{sub}</div>}
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <KpiCard 
        label="Gross Sales" 
        value={`OMR ${fmt(k.gross)}`} 
        sub="before returns" 
        borderColor="bg-amber-500" 
      />
      <KpiCard 
        label="Net Sales" 
        value={`OMR ${fmt(k.net)}`} 
        sub={`- OMR ${fmt(k.rgross)} returns (${((k.rgross / k.gross) * 100 || 0).toFixed(1)}%)`}
        borderColor="bg-amber-700" 
      />
      <KpiCard 
        label="Volume Sold" 
        value={`${fmt(k.kg, true)} kg`} 
        sub="gross kg" 
        borderColor="bg-primary" 
      />
      <KpiCard 
        label="Qty Sold" 
        value={fmt(k.qty, true)} 
        sub={`units · ${fmt(k.rqty, true)} returned`}
        borderColor="bg-primary" 
      />
      <KpiCard 
        label="Avg Price / kg" 
        value={`OMR ${(k.kg > 0 ? k.gross / k.kg : 0).toFixed(2)}`} 
        sub="blended, gross" 
        borderColor="bg-slate-800" 
      />
      <KpiCard 
        label="SKUs in view" 
        value={k.skus || "—"} 
        borderColor="bg-slate-800" 
      />
    </div>
  );
}
