import { useState, useEffect, useRef } from 'react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, RotateCcw, AlertOctagon, Trash2, RefreshCw, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getErrorMessage, getCachedData, setCachedData } from '@/lib/utils';
import api from '@/lib/api';

export default function Verification() {
  const cached = getCachedData<any[]>('verification_picklists');
  const [pickLists, setPickLists] = useState<any[]>(cached || []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<any | null>(null);
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPickLists = async (quiet = false) => {
    try {
      if (!quiet) setIsLoading(true);
      const res = await api.get('/picklists').catch(() => ({ data: [] }));
      const all = res.data || [];
      const filterVerified = all.filter(
        (p: any) => p.status === 'waiting_verification' || p.status === 'verified' || p.status === 'picking'
      );
      setPickLists(filterVerified);
      setCachedData('verification_picklists', filterVerified);
    } catch (err: any) {
      if (!quiet) toast.error(getErrorMessage(err, 'Failed to connect to verification dispatch queue'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPickLists(!!cached);
    pollRef.current = setInterval(() => fetchPickLists(true), 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleVerify = async (id: number) => {
    const previous = [...pickLists];
    const updated = pickLists.filter((p) => p.id !== id);
    setPickLists(updated);
    setCachedData('verification_picklists', updated);
    toast.success(`Order PL-${id} verified! All operational data cleanly removed from DB and picker freed.`);

    try {
      setIsProcessing(true);
      await api.patch(`/picklists/${id}/verify`);
      fetchPickLists(true);
    } catch (err: any) {
      setPickLists(previous);
      setCachedData('verification_picklists', previous);
      toast.error(getErrorMessage(err, 'Could not complete verification process'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedList || !returnReason) {
      toast.error('Please specify a detailed reason for returning to warehouse floor');
      return;
    }
    try {
      setIsProcessing(true);
      await api.patch(`/picklists/${selectedList.id}/return?reason=${encodeURIComponent(returnReason)}`);
      toast.success(`Order PL-${selectedList.id} returned to picker for corrections`);
      setIsReturnModalOpen(false);
      setReturnReason('');
      fetchPickLists(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to submit return request'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePurge = async (id: number) => {
    if (!confirm(`CONFIRM PURGE: Permanently delete Order PL-${id} and archive operational logs from live active tables?`)) {
      return;
    }
    const previous = [...pickLists];
    const updated = pickLists.filter((p) => p.id !== id);
    setPickLists(updated);
    setCachedData('verification_picklists', updated);
    toast.success(`Order PL-${id} completed and operational data cleanly archived.`);

    try {
      setIsProcessing(true);
      await api.delete(`/picklists/${id}/complete`);
      fetchPickLists(true);
    } catch (err: any) {
      setPickLists(previous);
      setCachedData('verification_picklists', previous);
      toast.error(getErrorMessage(err, 'Could not complete order purge sequence'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelJob = async (id: number) => {
    if (!window.confirm(`CONFIRM CANCELLATION: Are you sure you want to cancel ongoing job PL-${id} and completely remove all associated records from the database? Any assigned picker will be freed immediately.`)) {
      return;
    }
    const previous = [...pickLists];
    const updated = pickLists.filter((p) => p.id !== id);
    setPickLists(updated);
    setCachedData('verification_picklists', updated);
    toast.success(`Job PL-${id} cancelled and all operational data cleanly removed from database.`);

    try {
      setIsProcessing(true);
      await api.delete(`/picklists/${id}`);
      fetchPickLists(true);
    } catch (err: any) {
      setPickLists(previous);
      setCachedData('verification_picklists', previous);
      toast.error(getErrorMessage(err, 'Could not cancel and remove job'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMissingAction = async (itemId: number, approve: boolean) => {
    try {
      setIsProcessing(true);
      await api.patch(`/picklists/${selectedList.id}/items/${itemId}/approve-missing?approved=${approve}`);
      toast.success(approve ? 'Missing item approved' : 'Missing item rejected (sent back to picker)');
      
      // Update local state for immediate feedback
      if (selectedList) {
        const updatedList = { ...selectedList };
        const itemIndex = updatedList.items.findIndex((i: any) => i.id === itemId);
        if (itemIndex > -1) {
          updatedList.items[itemIndex].missing_approved = approve;
          if (!approve) updatedList.items[itemIndex].missing_reported = false;
        }
        setSelectedList(updatedList);
      }
      
      fetchPickLists(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to process missing item'));
    } finally {
      setIsProcessing(false);
    }
  };

  const columns = [
    { header: 'Order / PL #', accessor: (row: any) => `PL-${row.id}`, className: 'font-black text-primary font-mono' },
    { header: 'Customer Enterprise Name', accessor: 'customer_name' as const, className: 'font-semibold text-on-surface' },
    { header: 'Total SKU Count', accessor: (row: any) => `${row.items?.length || 0} Items`, className: 'font-bold text-slate-700' },
    {
      header: 'Operations Stage',
      accessor: (row: any) => (
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          row.status === 'verified' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
          row.status === 'waiting_verification' ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse' :
          'bg-blue-100 text-blue-800 border border-blue-300'
        }`}>
          {row.status?.replace('_', ' ').toUpperCase() || 'STAGE'}
        </span>
      ),
    },
    {
      header: 'Quality Audit & Actions',
      accessor: (row: any) => {
        const hasMissing = row.items?.some((i: any) => i.missing_reported && i.missing_approved === null);
        return (
          <div className="flex gap-2 items-center">
            {hasMissing && (
              <Button size="sm" onClick={() => { setSelectedList(row); setIsMissingModalOpen(true); }} className="bg-red-100 text-red-700 border border-red-300 hover:bg-red-200">
                <AlertOctagon className="w-4 h-4 mr-1.5" /> Missing Items
              </Button>
            )}
            {row.status === 'waiting_verification' && (
              <Button size="sm" onClick={() => handleVerify(row.id)} disabled={isProcessing || hasMissing} className="bg-emerald-600 hover:bg-emerald-700 font-bold shadow-xs">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve & Verify
              </Button>
            )}
          {(row.status === 'waiting_verification' || row.status === 'picking') && (
            <Button size="sm" variant="outline" onClick={() => { setSelectedList(row); setIsReturnModalOpen(true); }} className="text-amber-700 border-amber-400 font-bold hover:bg-amber-50">
              <RotateCcw className="w-4 h-4 mr-1.5" /> Return to Floor
            </Button>
          )}
          {row.status === 'verified' && (
            <Button size="sm" variant="danger" onClick={() => handlePurge(row.id)} disabled={isProcessing} className="bg-rose-700 hover:bg-rose-800 font-bold shadow-xs text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Complete & Purge
            </Button>
          )}
          {row.status !== 'verified' && (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => handleCancelJob(row.id)} 
              disabled={isProcessing} 
              title="Cancel Ongoing Job & Remove from Database" 
              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 font-bold px-2 py-1 border border-transparent hover:border-rose-200 ml-auto"
            >
              <XCircle className="w-4 h-4 text-rose-600 mr-1" /> Cancel & Remove
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span>Quality Verification & Dispatch Control</span>
            <span className="bg-amber-500/10 text-amber-800 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
              Final Gate
            </span>
          </h1>
          <p className="text-on-surface-variant mt-1">Review floor-completed picklists, audit SKU quantities, and perform operational purge upon dispatch</p>
        </div>
        <Button onClick={() => fetchPickLists(false)} variant="outline" size="sm" className="font-semibold shadow-2xs">
          <RefreshCw className="w-4 h-4 mr-2 text-primary" /> Refresh Audit Queue
        </Button>
      </div>

      {isLoading ? (
        <PageLoader
          message="Scanning Quality Assurance Dispatch Queue..."
          subtitle="Verifying completed picklist items and matching picker execution audits"
        />
      ) : (
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Active Verification Records ({pickLists.length})
            </span>
            <span className="text-xs font-semibold text-slate-500">
              All approved lists require final Complete & Purge confirmation to archive order history.
            </span>
          </div>
          <Table data={pickLists} columns={columns} keyExtractor={(r) => String(r.id)} />
        </div>
      )}

      <Modal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} title={`Return Order PL-${selectedList?.id} to Picker`}>
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900 text-sm font-medium">
            <AlertOctagon className="w-5 h-5 text-amber-600 shrink-0" />
            <span>This will reset the picklist status back to "picking" and notify the assigned worker via mobile notification.</span>
          </div>
          <div>
            <label className="text-xs font-extrabold uppercase text-on-surface-variant mb-1.5 block">Reason for Re-Pick / Audit Variance</label>
            <textarea
              className="w-full p-3 bg-surface rounded-xl border border-outline-variant focus:outline-none focus:border-primary text-sm min-h-[100px]"
              placeholder="e.g., Damaged barcode box found on item #3, incorrect count staged at Dock B..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setIsReturnModalOpen(false)}>Cancel</Button>
            <Button onClick={handleReturn} isLoading={isProcessing} className="bg-amber-600 hover:bg-amber-700 font-bold">
              Confirm & Return to Floor
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isMissingModalOpen} onClose={() => setIsMissingModalOpen(false)} title={`Missing Items - Order PL-${selectedList?.id}`}>
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">The following items were reported as missing by the picker. Please approve to exclude them from the order, or reject to send them back to the picker.</p>
          <div className="border border-outline-variant rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-variant">
                <tr>
                  <th className="p-3 text-left">Barcode</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Quantity</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {selectedList?.items?.filter((i: any) => i.missing_reported && i.missing_approved === null).map((item: any) => (
                  <tr key={item.id}>
                    <td className="p-3 font-mono">{item.barcode}</td>
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3">{item.quantity} {item.unit}</td>
                    <td className="p-3 flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleMissingAction(item.id, false)} disabled={isProcessing} className="text-red-600 border-red-200 hover:bg-red-50">
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => handleMissingAction(item.id, true)} disabled={isProcessing} className="bg-emerald-600 hover:bg-emerald-700">
                        Approve
                      </Button>
                    </td>
                  </tr>
                ))}
                {selectedList?.items?.filter((i: any) => i.missing_reported && i.missing_approved === null).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-on-surface-variant">No pending missing items.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
