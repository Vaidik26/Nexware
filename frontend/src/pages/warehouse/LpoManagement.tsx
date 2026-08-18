import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { RefreshCw, Search, FileText, ArrowRight } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';

interface LPOItem {
  barcode: string;
  product_name: string;
  quantity: number;
  unit: string;
}

interface LPO {
  id: number;
  lpo_number: string;
  customer_name: string;
  sales_person_id: number | null;
  items: LPOItem[];
  signed_lpo_url: string | null;
  status: string;
  source: string;
  created_at: string | null;
  created_by_name?: string;
}

export default function LpoManagement() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  // Use React Query for caching, background syncing, and instant reloads
  const { data: lpos = [], isFetching, refetch } = useQuery<LPO[]>({
    queryKey: ['lpos'],
    queryFn: async () => {
      const { data } = await api.get('/lpos');
      return data;
    },
  });

  const handleManualRefresh = () => {
    refetch();
  };

  const filteredLpos = lpos.filter((lpo) => {
    const q = searchQuery.toLowerCase();
    return (
      (lpo.lpo_number || '').toLowerCase().includes(q) ||
      (lpo.customer_name || '').toLowerCase().includes(q) ||
      (lpo.status || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">LPO Management</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            View, upload, and process all incoming Local Purchase Orders.
          </p>
        </div>
        <button
          onClick={handleManualRefresh}
          className="p-2 rounded-lg bg-surface-variant text-on-surface-variant hover:bg-surface-variant/80 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        <div className="p-4 border-b border-outline-variant bg-surface-variant/30 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search by Order # or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm border-none bg-surface shadow-sm focus:ring-2 focus:ring-primary"
            />
          </div>
          <span className="text-sm font-medium text-on-surface-variant bg-surface px-3 py-1 rounded-lg border border-outline-variant">
            {filteredLpos.length} Orders
          </span>
        </div>
        
        {isFetching && lpos.length === 0 ? (
          <PageLoader 
            message="Loading LPOs..." 
            subtitle="Fetching latest purchase orders" 
          />
        ) : (
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-surface-variant/50 border-b border-outline-variant sticky top-0 z-10">
                <tr>
                  <th className="p-4 font-semibold text-on-surface-variant">Order #</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Customer</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Source</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Created By</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Status</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Date Created</th>
                  <th className="p-4 font-semibold text-on-surface-variant text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredLpos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                      No orders found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredLpos.map((lpo) => (
                    <tr key={lpo.id} className="hover:bg-surface-variant/20 group">
                      <td className="p-4 font-bold text-on-surface">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          {lpo.lpo_number}
                        </div>
                      </td>
                      <td className="p-4 text-on-surface">{lpo.customer_name}</td>
                      <td className="p-4 text-on-surface-variant capitalize">{lpo.source || 'upload'}</td>
                      <td className="p-4 text-on-surface font-semibold">{lpo.created_by_name || 'System'}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                          lpo.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          lpo.status === 'processed' ? 'bg-blue-100 text-blue-700' :
                          lpo.status === 'disapproved' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {lpo.status}
                        </span>
                      </td>
                      <td className="p-4 text-on-surface-variant">
                        {lpo.created_at ? new Date(lpo.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => navigate(`/warehouse/lpos/${lpo.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors"
                        >
                          Details <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
