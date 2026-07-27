import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import api from '@/lib/api';
import { toast } from '@/components/ui/Toast';

export default function InternationalPrices() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchIntlPrices = async () => {
      try {
        const res = await api.get('/market/international-prices').catch(() => ({ data: [] }));
        setData(Array.isArray(res.data) ? res.data : []);
      } catch {
        toast.error('Could not fetch international live pricing index');
      } finally {
        setIsLoading(false);
      }
    };
    fetchIntlPrices();
  }, []);

  const columns = [
    { header: 'Record Date', accessor: (r: any) => String(r.date), className: 'font-mono text-sm font-bold text-slate-700' },
    { header: 'Commodity Ref ID', accessor: (r: any) => `Material #${r.material_id}`, className: 'font-extrabold text-on-surface' },
    { header: 'FOB Export Price ($)', accessor: (r: any) => `$${r.fob_price}`, className: 'font-mono font-black text-amber-700' },
    { header: 'CIF Landed Price ($)', accessor: (r: any) => `$${r.cif_price}`, className: 'font-mono font-black text-blue-700' },
  ];

  if (isLoading) {
    return <PageLoader message="Querying International FOB & CIF Valuation Register..." />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">International Prices Log</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Live International FOB & CIF rate audit feed (Both quotes mandatory)</p>
        </div>
        <Button onClick={() => navigate('/market/prices')} className="font-black text-xs shadow-md">
          Go to Daily Capture Sheet &rarr;
        </Button>
      </div>
      <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant shadow-sm space-y-4">
        {data.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-bold text-sm bg-slate-50/50 rounded-2xl border border-dashed border-outline-variant">
            No international FOB & CIF rate logs recorded yet. Submit rates in the Daily Capture Sheet to populate this register.
          </div>
        ) : (
          <Table data={data} columns={columns} keyExtractor={(r) => String(r.id || Math.random())} />
        )}
      </div>
    </div>
  );
}
