import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Download, Users, RefreshCw, Layers, CheckCircle2, AlertCircle, XCircle, CheckSquare, Check, ShieldCheck, ArrowLeftRight, Package, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getErrorMessage, getCachedData, setCachedData } from '@/lib/utils';

import api from '@/lib/api';

export default function PickLists() {
  const navigate = useNavigate();
  const cached = getCachedData<any[]>('consolidated_picklists');
  const [pickLists, setPickLists] = useState<any[]>(cached || []);
  const [pickers, setPickers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'picking' | 'waiting_verification' | 'verified'>('all');
  
  // Item-level verification audit states
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedAuditList, setSelectedAuditList] = useState<any | null>(null);
  const [isProcessingAudit, setIsProcessingAudit] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  // Poll for fresh data while audit modal is open
  // Poll for fresh data while audit modal is open - adjusted to not fight optimistic UI
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAuditModalOpen && selectedAuditList) {
      interval = setInterval(async () => {
        try {
          // Only poll if we aren't actively processing an audit to prevent optimistic UI reverting
          if (!isProcessingAudit) {
            const freshRes = await api.get(`/picklists/${selectedAuditList.id}`);
            if (freshRes.data) {
                // Ensure we don't overwrite if the user just clicked a checkbox
                // We'll trust our optimistic UI more than the 3s poll if they differ
                setSelectedAuditList((prev: any) => {
                   if (!prev) return freshRes.data;
                   // Just update the status and boxes, leave items to optimistic UI
                   return {
                       ...freshRes.data,
                       items: prev.items, // Keep optimistic items
                   };
                });
            }
          }
        } catch (e) {
          // ignore
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isAuditModalOpen, selectedAuditList?.id, isProcessingAudit]);
  const [assigningPickerId, setAssigningPickerId] = useState<number | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async (quiet = false) => {
    try {
      if (!quiet) {
        if (pickLists.length === 0) setIsLoading(true);
        setIsRefreshing(true);
      }
      const [plRes, usersRes] = await Promise.all([
        api.get('/picklists').catch(() => ({ data: [] })),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      const plData = plRes.data || [];
      setPickLists(plData);
      setCachedData('consolidated_picklists', plData);

      const allUsers = usersRes.data || [];
      setPickers(allUsers.filter((u: any) => u.role === 'picker' || u.role === 'admin'));
    } catch (err: any) {
      if (!quiet) toast.error(getErrorMessage(err, 'Failed to connect to active picklist queue'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(!!cached);
    // Auto-poll every 10 seconds so picker submissions appear without manual refresh
    pollRef.current = setInterval(() => fetchData(true), 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleAssign = async (pickerId: number, pickerName: string) => {
    if (!selectedList || assigningPickerId !== null) return;
    setAssigningPickerId(pickerId);
    try {
      await api.post(`/picklists/${selectedList.id}/assign/${pickerId}`);
      toast.success(`Assigned Order PL-${selectedList.id} to ${pickerName}`);
      setIsAssignModalOpen(false);
      fetchData(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not assign task to picker'));
    } finally {
      setAssigningPickerId(null);
    }
  };

  const handleAutoAssign = async (id: number) => {
    if (isAutoAssigning) return;
    setIsAutoAssigning(true);
    try {
      await api.post(`/picklists/${id}/auto-assign`);
      toast.success(`Job PL-${id} auto-assigned successfully.`);
      fetchData(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not auto-assign job. Are pickers available?'));
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const handleReassign = async (pickerId: number, pickerName: string) => {
    if (!selectedList || assigningPickerId !== null) return;
    setAssigningPickerId(pickerId);
    try {
      await api.patch(`/picklists/${selectedList.id}/reassign`, { new_picker_id: pickerId });
      toast.success(`Reassigned Order PL-${selectedList.id} to ${pickerName}`);
      setIsReassignModalOpen(false);
      fetchData(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not reassign task to picker'));
    } finally {
      setAssigningPickerId(null);
    }
  };

  const handleCancelJob = async (id: number) => {
    if (!window.confirm(`CONFIRM CANCELLATION: Are you sure you want to cancel ongoing job PL-${id} and completely remove all associated records from the database? Any assigned picker will be freed immediately.`)) {
      return;
    }
    const previousLists = [...pickLists];
    const updatedLists = pickLists.filter((item) => item.id !== id);
    setPickLists(updatedLists);
    setCachedData('consolidated_picklists', updatedLists);
    toast.success(`Job PL-${id} cancelled and all operational data cleanly removed from database.`);

    try {
      await api.delete(`/picklists/${id}`);
      fetchData(true);
    } catch (err: any) {
      setPickLists(previousLists);
      setCachedData('consolidated_picklists', previousLists);
      toast.error(getErrorMessage(err, 'Could not cancel and remove job'));
    }
  };

  const downloadPdf = async (id: number, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const res = await api.get(`/picklists/${id}/download/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Picklist_PL-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { link.remove(); window.URL.revokeObjectURL(url); }, 200);
      toast.success('PDF downloaded successfully');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not download PDF report'));
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const downloadExcel = async (id: number, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (isDownloadingExcel) return;
    setIsDownloadingExcel(true);
    try {
      const res = await api.get(`/picklists/${id}/download/excel`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Picklist_PL-${id}.xlsx`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { link.remove(); window.URL.revokeObjectURL(url); }, 200);
      toast.success('Excel sheet downloaded successfully');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not download Excel report'));
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const filteredLists = pickLists.filter((item) => {
    if (item.status === 'verified' || item.status === 'completed') return false;
    if (activeTab === 'all') return true;
    if (activeTab === 'draft') return item.status === 'draft' || item.status === 'assigned';
    if (activeTab === 'picking') return item.status === 'picking';
    if (activeTab === 'waiting_verification') return item.status === 'waiting_verification';
    return true;
  });

  const handleToggleItemPick = async (itemId: number) => {
    if (!selectedAuditList) return;
    
    // Optimistic Update
    const currentStatus = selectedAuditList.items?.find((i: any) => i.id === itemId)?.is_audited || false;
    const optimisticStatus = !currentStatus;
    
    const optimisticList = {
      ...selectedAuditList,
      items: (selectedAuditList.items || []).map((it: any) =>
        it.id === itemId ? { ...it, is_audited: optimisticStatus } : it
      )
    };
    setSelectedAuditList(optimisticList);
    setPickLists(prev => prev.map((p) => p.id === optimisticList.id ? optimisticList : p));

    try {
      await api.patch(`/picklists/${selectedAuditList.id}/items/${itemId}/audit`);
      // We assume optimistic was correct
    } catch (err: any) {
      // Revert on error
      const revertedList = {
        ...selectedAuditList,
        items: (selectedAuditList.items || []).map((it: any) =>
          it.id === itemId ? { ...it, is_audited: currentStatus } : it
        )
      };
      setSelectedAuditList(revertedList);
      setPickLists(prev => prev.map((p) => p.id === revertedList.id ? revertedList : p));
      toast.error(getErrorMessage(err, 'Could not update audit status'));
    }
  };

  const handleResolveMissing = async (itemId: number, approve: boolean) => {
    if (!selectedAuditList) return;
    try {
      await api.patch(`/picklists/${selectedAuditList.id}/items/${itemId}/approve-missing?approved=${approve}`);
      toast.success(approve ? 'Missing item loss approved' : 'Missing item rejected (Returned to active)');
      
      const freshRes = await api.get(`/picklists/${selectedAuditList.id}`);
      setSelectedAuditList(freshRes.data || selectedAuditList);
      setPickLists(prev => prev.map((p) => p.id === freshRes.data?.id ? freshRes.data : p));
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to resolve missing item'));
    }
  };

  const handleApproveAudit = async () => {
    if (!selectedAuditList) return;
    
    const hasPartialPicks = selectedAuditList.items?.some((i: any) => i.is_picked && i.picked_quantity < i.quantity);
    if (hasPartialPicks) {
      if (!window.confirm('Some items have not been fully picked. Are you sure you want to proceed and finalize this order with partial quantities?')) {
        return;
      }
    }

    try {
      setIsProcessingAudit(true);
      await api.patch(`/picklists/${selectedAuditList.id}/verify`);
      toast.success(`Order approved and verified! Ready for export.`);
      // Refresh from server to get latest items with is_picked=true
      const freshRes = await api.get(`/picklists/${selectedAuditList.id}`).catch(() => null);
      const freshList = freshRes?.data ? { ...freshRes.data, status: 'verified' } : { ...selectedAuditList, status: 'verified' };
      setSelectedAuditList(freshList);
      setPickLists(prev => prev.map(p => p.id === freshList.id ? freshList : p));
      setCachedData('consolidated_picklists', pickLists.map(p => p.id === freshList.id ? freshList : p));
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not verify order'));
    } finally {
      setIsProcessingAudit(false);
    }
  };

  const handleReturnAudit = async () => {
    if (!selectedAuditList) return;
    try {
      setIsProcessingAudit(true);
      await api.patch(`/picklists/${selectedAuditList.id}/return`);
      const jobNum = selectedAuditList.picker_job_number ? `P-${String(selectedAuditList.picker_job_number).padStart(3, '0')}` : `PL-${selectedAuditList.id}`;
      toast.success(`Order ${jobNum} returned to picker!`);
      setIsAuditModalOpen(false);
      fetchData(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not return order to picker'));
    } finally {
      setIsProcessingAudit(false);
    }
  };

  const formatCustomerName = (name?: string) => {
    if (!name) return 'General Order';
    let cleaned = name.replace(/\b(L\.L\.C\.?|LLC|Pvt\.?|Ltd\.?|Inc\.?|Corp\.?)\b/gi, '').trim();
    cleaned = cleaned.replace(/^[-,:;\s]+|[-,:;\s]+$/g, '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'enterprise client' || cleaned.toLowerCase() === 'enterprise partner co.') {
      return 'General Order';
    }
    return cleaned;
  };

  const columns = [
    { 
      header: 'Order / PL #', 
      accessor: (row: any) => row.picker_job_number ? 'P-' + String(row.picker_job_number).padStart(3, '0') : 'PL-' + row.id, 
      className: 'font-extrabold text-primary' 
    },
    { header: 'Customer Partner', accessor: (row: any) => formatCustomerName(row.customer_name), className: 'font-semibold' },
    { header: 'Items Count', accessor: (row: any) => `${row.items?.length || 0} SKUs` },
    { 
      header: 'Assigned Staff', 
      accessor: (row: any) => row.assigned_picker_name ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          {row.assigned_picker_name}
        </span>
      ) : row.assigned_to_id || row.assigned_picker_id ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          Picker #{row.assigned_to_id || row.assigned_picker_id}
        </span>
      ) : (
        <span className="text-slate-400 italic text-xs">Unassigned</span>
      )
    },
    { header: 'Floor Status', accessor: (row: any) => <StatusBadge status={row.status || 'draft'} /> },
    { header: 'Created Date', accessor: (row: any) => new Date(row.created_at || Date.now()).toLocaleDateString() },
    {
      header: 'Operations & Actions',
      accessor: (row: any) => (
        <div className="flex gap-1.5 items-center flex-wrap">
          {row.status === 'draft' && (
            <>
              <Button size="sm" onClick={() => handleAutoAssign(row.id)} disabled={isAutoAssigning} className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs py-1">
                Auto Assign
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSelectedList(row); setIsAssignModalOpen(true); }} className="font-semibold text-xs py-1">
                Manual Assign
              </Button>
            </>
          )}
          {(row.status === 'assigned' || row.status === 'picking') && (
            <Button size="sm" variant="outline" onClick={() => { setSelectedList(row); setIsReassignModalOpen(true); }} className="font-semibold text-xs py-1 text-orange-600 border-orange-300 bg-orange-50 hover:bg-orange-600 hover:text-white">
              Reassign
            </Button>
          )}
          {row.status === 'picking' && (
            <Button size="sm" onClick={() => navigate(`/warehouse/picklists/${row.id}`)} className="text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-600 hover:text-white font-semibold text-xs py-1">
              Inspect Pick
            </Button>
          )}
          {(row.status === 'draft' || row.status === 'assigned' || row.status === 'verified' || row.status === 'completed' || row.status === 'waiting_verification') && (
            <button
              onClick={() => navigate(`/warehouse/picklists/${row.id}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              Details <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {(row.status === 'verified' || row.status === 'completed') ? (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => handleCancelJob(row.id)} 
              title="Purge dispatched record from database" 
              className="text-amber-700 hover:bg-amber-50 hover:text-amber-800 p-1.5 border border-transparent hover:border-amber-200 font-semibold"
            >
              <XCircle className="w-4 h-4 text-amber-600 mr-1" /> <span className="text-xs">Purge Record</span>
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => handleCancelJob(row.id)} 
              title="Cancel Ongoing Job & Remove from Database" 
              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 p-1.5 border border-transparent hover:border-rose-200 font-semibold"
            >
              <XCircle className="w-4 h-4 text-rose-600 mr-1" /> <span className="text-xs">Cancel & Remove</span>
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
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
            <span>Picklists & Operations Floor</span>
            <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-semibold">
              Consolidated Module
            </span>
          </h1>
          <p className="text-on-surface-variant mt-1">Manage draft orders, track real-time picking operations, and assign tasks to warehouse staff</p>
        </div>
        <Button onClick={() => fetchData(false)} variant="outline" size="sm" className="shadow-xs font-semibold">
          <RefreshCw className={`w-4 h-4 mr-2 text-primary ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh Operations Feed
        </Button>
      </div>

      {/* Merged KPI Operational Floor Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Draft / Unassigned', count: pickLists.filter(p => p.status === 'draft').length, icon: AlertCircle, color: 'text-amber-600', border: 'border-amber-200 bg-amber-50/40' },
          { label: 'Assigned to Staff', count: pickLists.filter(p => p.status === 'assigned').length, icon: Users, color: 'text-blue-600', border: 'border-blue-200 bg-blue-50/40' },
          { label: 'Active Floor Picks', count: pickLists.filter(p => p.status === 'picking' || p.status === 'waiting_verification').length, icon: Layers, color: 'text-purple-600', border: 'border-purple-200 bg-purple-50/40' },
          { label: 'Ready for Audit', count: pickLists.filter(p => p.status === 'waiting_verification').length, icon: ShieldCheck, color: 'text-emerald-600', border: 'border-emerald-200 bg-emerald-50/40' },
        ].map((stat, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${stat.border} shadow-xs flex items-center justify-between`}>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{stat.label}</div>
              <div className="text-2xl font-black text-on-surface mt-1">{isLoading ? '...' : stat.count}</div>
            </div>
            <div className={`p-2.5 bg-white rounded-xl shadow-xs ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <PageLoader
          message="Synchronizing Consolidated Picklist & Operations Queue..."
          subtitle="Establishing secure socket link with mobile picker terminals and staging floors"
        />
      ) : (
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
            <div className="flex bg-surface-container-low p-1.5 rounded-xl border border-outline-variant flex-wrap gap-1">
              {[
                { key: 'all', label: 'All Operations Queue' },
                { key: 'draft', label: 'Draft & Assigned' },
                { key: 'picking', label: 'Active Picking' },
                { key: 'waiting_verification', label: `Ready for Audit (${pickLists.filter(p => p.status === 'waiting_verification').length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                    activeTab === tab.key
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-on-surface-variant font-semibold">
              Showing <strong>{filteredLists.length}</strong> Order Records
            </span>
          </div>

          <Table data={filteredLists} columns={columns} keyExtractor={(r) => String(r.id)} />
        </div>
      )}

      {/* Assign Staff Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title={`Assign Picker Staff — Order PL-${selectedList?.id}`}>
        <div className="space-y-4">
          <p className="text-sm font-medium text-on-surface-variant">
            Select an active warehouse worker or mobile picker terminal to assign picking responsibility:
          </p>
          <div className="grid grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {pickers.map((picker) => (
              <button
                key={picker.id}
                disabled={assigningPickerId !== null}
                onClick={() => handleAssign(picker.id, picker.full_name || picker.email)}
                className={`flex items-center justify-between gap-3 p-4 rounded-2xl border transition-all text-left shadow-xs group ${
                  assigningPickerId === picker.id
                    ? 'border-primary bg-primary/10 opacity-90'
                    : assigningPickerId !== null
                    ? 'border-outline-variant opacity-50 cursor-not-allowed'
                    : 'border-outline-variant hover:border-primary hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-container text-white flex items-center justify-center font-black text-base group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-on-surface text-sm flex items-center gap-2">
                      <span>{picker.full_name || picker.email}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        picker.is_available ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500 border border-slate-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${picker.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {picker.is_available ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="text-xs text-on-surface-variant font-semibold capitalize mt-0.5">{picker.role} Account — Ready for assignment</div>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  assigningPickerId === picker.id
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                }`}>
                  {assigningPickerId === picker.id ? 'Assigning...' : 'Assign Staff →'}
                </span>
              </button>
            ))}
            {pickers.length === 0 && (
              <div className="text-center py-8 text-amber-600 text-sm font-semibold bg-amber-50/50 rounded-2xl border border-amber-200">
                No active picker accounts detected. Create one in User & Picker Management!
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Reassign Staff Modal */}
      <Modal isOpen={isReassignModalOpen} onClose={() => setIsReassignModalOpen(false)} title={`Reassign Picker Staff — Order PL-${selectedList?.id}`}>
        <div className="space-y-4">
          <p className="text-sm font-medium text-on-surface-variant">
            Select a new active warehouse worker to reassign picking responsibility:
          </p>
          <div className="grid grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {pickers.map((picker) => (
              <button
                key={picker.id}
                disabled={assigningPickerId !== null}
                onClick={() => handleReassign(picker.id, picker.full_name || picker.email)}
                className={`flex items-center justify-between gap-3 p-4 rounded-2xl border transition-all text-left shadow-xs group ${
                  assigningPickerId === picker.id
                    ? 'border-primary bg-primary/10 opacity-90'
                    : assigningPickerId !== null
                    ? 'border-outline-variant opacity-50 cursor-not-allowed'
                    : 'border-outline-variant hover:border-primary hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-container text-white flex items-center justify-center font-black text-base group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-on-surface text-sm flex items-center gap-2">
                      <span>{picker.full_name || picker.email}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        picker.is_available ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500 border border-slate-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${picker.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {picker.is_available ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="text-xs text-on-surface-variant font-semibold capitalize mt-0.5">{picker.role} Account — Ready for assignment</div>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  assigningPickerId === picker.id
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                }`}>
                  {assigningPickerId === picker.id ? 'Reassigning...' : 'Reassign →'}
                </span>
              </button>
            ))}
            {pickers.length === 0 && (
              <div className="text-center py-8 text-amber-600 text-sm font-semibold bg-amber-50/50 rounded-2xl border border-amber-200">
                No active picker accounts detected.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Inspect / Audit Modal */}
      <Modal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} title={`Audit & Verify Order ${selectedAuditList?.picker_job_number ? 'P-' + String(selectedAuditList.picker_job_number).padStart(3, '0') : 'PL-' + selectedAuditList?.id}`}>
        <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Customer Order</div>
              <div className="text-lg font-black text-emerald-950 mt-0.5">{formatCustomerName(selectedAuditList?.customer_name)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Picker</div>
              <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                {selectedAuditList?.assigned_picker_name || (selectedAuditList?.assigned_to_id || selectedAuditList?.assigned_picker_id ? 'Picker #' + (selectedAuditList.assigned_to_id || selectedAuditList.assigned_picker_id) : 'Unassigned')}
              </div>
            </div>
          </div>

          {selectedAuditList?.status === 'verified' || selectedAuditList?.status === 'completed' ? (
            <div className="py-8 px-4 text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-emerald-300">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-on-surface">Verification Complete!</h3>
                <p className="text-sm text-slate-500 mt-1">Order has been audited and approved for dispatch.</p>
              </div>
              <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
                <Button 
                  onClick={(e) => downloadPdf(selectedAuditList.id, e)} 
                  disabled={isDownloadingPdf}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-3.5 shadow-md flex items-center justify-center gap-2.5 rounded-xl whitespace-nowrap text-sm disabled:opacity-60"
                >
                  <Download className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{isDownloadingPdf ? 'Downloading...' : 'Export PDF Report'}</span>
                </Button>
                <Button 
                  onClick={(e) => downloadExcel(selectedAuditList.id, e)} 
                  disabled={isDownloadingExcel}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3.5 shadow-md flex items-center justify-center gap-2.5 rounded-xl whitespace-nowrap text-sm disabled:opacity-60"
                >
                  <Download className="w-4 h-4 text-emerald-200 shrink-0" />
                  <span>{isDownloadingExcel ? 'Downloading...' : 'Export Excel Sheet'}</span>
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => { setIsAuditModalOpen(false); setSelectedAuditList(null); }} 
                  className="w-full border-slate-300 hover:bg-slate-100 font-bold px-5 py-3.5 rounded-xl whitespace-nowrap text-sm mt-1"
                >
                  New Order / Close
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-extrabold text-on-surface flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-primary" />
                    <span>SKU Audit Inspection ({selectedAuditList?.items?.length || 0} Items)</span>
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">Click any row/checkbox to toggle verification</span>
                </div>

                <div className="border border-outline-variant rounded-2xl overflow-hidden divide-y divide-outline-variant bg-white shadow-xs">
                  {(selectedAuditList?.items || []).map((item: any) => {
                    const isMissingReported = item.missing_reported && item.missing_approved === null;
                    const isMissingApproved = item.missing_approved === true;

                    return (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          if (!isMissingReported && !isMissingApproved) handleToggleItemPick(item.id)
                        }}
                        className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                          isMissingReported ? 'bg-amber-50 hover:bg-amber-100/60' :
                          isMissingApproved ? 'bg-slate-50' :
                          item.is_audited ? 'bg-white hover:bg-emerald-50/40 cursor-pointer' : 
                          item.is_picked ? 'bg-blue-50/40 hover:bg-blue-100/40 cursor-pointer' :
                          'bg-rose-50/60 hover:bg-rose-100/60 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                            isMissingReported ? 'bg-amber-500 border-amber-500 text-white' :
                            isMissingApproved ? 'bg-slate-300 border-slate-300 text-white' :
                            item.is_audited ? 'bg-emerald-600 border-emerald-600 text-white' : 
                            'bg-white border-slate-300 text-transparent'
                          }`}>
                            {isMissingReported ? <AlertCircle className="w-4 h-4 stroke-[3]" /> : <Check className="w-4 h-4 stroke-[3]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-bold text-sm truncate ${isMissingApproved ? 'text-slate-400 line-through' : 'text-on-surface'}`}>{item.product_name || `Item SKU #${item.id}`}</div>
                            <div className="text-xs text-on-surface-variant font-mono mt-0.5 flex items-center gap-2">
                              <span>Barcode: {item.barcode || 'N/A'}</span>
                              {item.bin_location && (
                                <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Bin: {item.bin_location}</span>
                              )}
                              {item.is_full_carton && (
                                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  Full Carton Pick
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {isMissingReported ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleResolveMissing(item.id, false); }} className="bg-rose-100 text-rose-700 hover:bg-rose-200 text-xs py-1 px-2 h-7">
                              Reject
                            </Button>
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleResolveMissing(item.id, true); }} className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs py-1 px-2 h-7">
                              Approve Loss
                            </Button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <div className={`font-extrabold text-sm ${isMissingApproved ? 'text-slate-400' : (item.is_picked && item.picked_quantity < item.quantity ? 'text-amber-600' : 'text-on-surface')}`}>
                              {item.is_picked ? `${item.picked_quantity} / ` : ''}{item.quantity || 1} {item.unit || 'Units'}
                            </div>
                            <div className={`text-[10px] font-bold uppercase mt-0.5 ${
                              isMissingApproved ? 'text-slate-500' :
                              item.is_audited ? 'text-emerald-700' : 
                              item.is_picked ? 'text-blue-600' :
                              'text-rose-600'
                            }`}>
                              {isMissingApproved ? 'Lost (Approved)' : item.is_audited ? 'Verified & Audited' : item.is_picked ? 'Picked, Awaiting Audit' : 'Unchecked / Missing'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(selectedAuditList?.items || []).length === 0 && (
                    <div className="p-4 text-center text-slate-500 text-sm">No items in this order.</div>
                  )}
                </div>

                {/* Packed Cartons Section */}
                {(selectedAuditList?.boxes || []).length > 0 && (
                  <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                        <Package className="w-4 h-4 text-slate-600" />
                        <span>Packed Cartons ({(selectedAuditList?.boxes || []).length})</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(selectedAuditList?.boxes || []).map((box: any) => {
                        const boxItems = (selectedAuditList?.items || []).filter((i: any) => i.box_id === box.id);
                        return (
                          <div key={box.id} className="p-3.5 flex flex-col gap-2 bg-white">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sm text-slate-800">Box #{box.id}</span>
                              <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {box.entered_weight} kg
                              </span>
                            </div>
                            {boxItems.length > 0 ? (
                              <div className="pl-2 border-l-2 border-slate-100 mt-1 space-y-1">
                                {boxItems.map((bi: any) => (
                                  <div key={bi.id} className="flex justify-between items-center text-xs text-slate-500">
                                    <span className="truncate max-w-[200px]">{bi.product_name}</span>
                                    <span>{bi.quantity} {bi.unit}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Empty box</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant">
                <Button
                  variant="secondary"
                  onClick={handleReturnAudit}
                  isLoading={isProcessingAudit}
                  className="border-amber-400/60 bg-amber-50 text-amber-900 hover:bg-amber-100 font-bold text-xs px-5 py-2.5"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Return to Picker
                </Button>
                <Button
                  onClick={handleApproveAudit}
                  isLoading={isProcessingAudit}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-5 py-2.5 shadow-md shadow-emerald-900/10"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> Approve & Dispatch
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
