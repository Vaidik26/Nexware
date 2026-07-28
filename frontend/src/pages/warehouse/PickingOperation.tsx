import { useState, useEffect, useRef } from 'react';
import { Table } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Layers, Activity, Users, ArrowRight } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

export default function PickingOperation() {
  const [pickLists, setPickLists] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPickLists = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/picklists');
      // Filter for picklists currently in picking or assigned state
      const all = res.data || [];
      setPickLists(all.filter((p: any) => p.status === 'picking' || p.status === 'assigned' || p.status === 'waiting_verification'));
    } catch (error) {
      toast.error('Failed to load picking operations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPickLists();
    pollRef.current = setInterval(() => fetchPickLists(), 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const columns = [
    { header: 'Order / List ID', accessor: (r: any) => `PL-${r.id}` },
    { header: 'Customer', accessor: 'customer_name' as const },
    { header: 'Assigned Picker ID', accessor: (r: any) => r.assigned_to_id ? `Picker #${r.assigned_to_id}` : 'Unassigned' },
    { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
    { header: 'Created', accessor: (r: any) => new Date(r.created_at).toLocaleDateString() },
    {
      header: 'Floor Action',
      accessor: () => (
        <Button size="sm" variant="outline" onClick={() => navigate('/warehouse/verification')}>
          View Details & Verify
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Picking Operation Floor</h1>
          <p className="text-on-surface-variant mt-1">Monitor real-time warehouse picking progress and active mobile picker assignments</p>
        </div>
        <Button onClick={fetchPickLists} variant="outline" size="sm">
          <Activity className="w-4 h-4 mr-2 text-secondary" /> Refresh Floor Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">Active Picks</span>
            <Layers className="w-5 h-5 text-secondary" />
          </div>
          <div className="text-2xl font-extrabold text-on-surface mt-2">
            {pickLists.filter(p => p.status === 'picking').length}
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">Assigned (Pending Start)</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-extrabold text-on-surface mt-2">
            {pickLists.filter(p => p.status === 'assigned').length}
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">Waiting Verification</span>
            <ArrowRight className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-on-surface mt-2">
            {pickLists.filter(p => p.status === 'waiting_verification').length}
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm">
        <div className="mb-4 font-semibold text-sm text-on-surface flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          Live Floor Queue
        </div>
        <Table data={pickLists} columns={columns} keyExtractor={(r) => String(r.id)} isLoading={isLoading} />
      </div>
    </div>
  );
}
