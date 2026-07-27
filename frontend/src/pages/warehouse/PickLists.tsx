import { useState, useEffect } from 'react';
import { Table } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Download, Users, RefreshCw, Layers, CheckCircle2, AlertCircle, XCircle, CheckSquare, Check, ShieldCheck, ArrowLeftRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getErrorMessage, getCachedData, setCachedData } from '@/lib/utils';
import api from '@/lib/api';

export default function PickLists() {
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
  const [assigningPickerId, setAssigningPickerId] = useState<number | null>(null);

  const fetchData = async (quiet = false) => {
    try {
      if (!quiet) setIsLoading(true);
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
    }
  };

  useEffect(() => {
    fetchData(!!cached);
  }, []);

  // Use verified backend router endpoint POST /picklists/{id}/assign/{picker_id}
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

  const downloadPdf = async (id: number) => {
    try {
      const res = await api.get(`/picklists/${id}/download/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Picklist_Order_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Downloaded Picklist Document PDF');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not download PDF report'));
    }
  };

  const downloadExcel = async (id: number) => {
    try {
      const res = await api.get(`/picklists/${id}/download/excel`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Picklist_Order_${id}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Downloaded Picklist Excel Sheet');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not download Excel report'));
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
    try {
      const res = await api.patch(`/picklists/${selectedAuditList.id}/items/${itemId}/pick`);
      const newPickedStatus = res.data.is_picked;
      const updatedItems = (selectedAuditList.items || []).map((it: any) =>
        it.id === itemId ? { ...it, is_picked: newPickedStatus } : it
      );
      const updatedList = { ...selectedAuditList, items: updatedItems };
      setSelectedAuditList(updatedList);
      setPickLists(pickLists.map((p) => p.id === updatedList.id ? updatedList : p));
      toast.success(newPickedStatus ? 'Item marked verified' : 'Item unchecked for re-pick');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not update item status'));
    }
  };

  const handleApproveAudit = async () => {
    if (!selectedAuditList) return;
    try {
      setIsProcessingAudit(true);
      await api.patch(`/picklists/${selectedAuditList.id}/verify`);
      toast.success(`Order approved and verified! Ready for export.`);
      setSelectedAuditList({ ...selectedAuditList, status: 'verified' });
      fetchData(true);
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
            <Button size="sm" onClick={() => { setSelectedList(row); setIsAssignModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs py-1">
              Assign Staff
            </Button>
          )}
          {row.status === 'picking' && (
            <Button size="sm" variant="outline" onClick={() => { setSelectedAuditList(row); setIsAuditModalOpen(true); }} className="text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-600 hover:text-white font-semibold text-xs py-1">
              Inspect Pick
            </Button>
          )}
          {row.status === 'waiting_verification' && (
            <Button size="sm" onClick={() => { setSelectedAuditList(row); setIsAuditModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs font-bold text-xs py-1 flex items-center gap-1 animate-pulse">
              <ShieldCheck className="w-3.5 h-3.5" /> Audit & Verify →
            </Button>
          )}
          {(row.status === 'verified' || row.status === 'completed') && (
            <Button size="sm" variant="outline" onClick={() => { setSelectedAuditList(row); setIsAuditModalOpen(true); }} className="text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-600 hover:text-white font-bold text-xs py-1 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Export / View
            </Button>
          )}
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => handleCancelJob(row.id)} 
            title="Cancel Ongoing Job & Remove from Database" 
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 p-1.5 border border-transparent hover:border-rose-200 font-semibold"
          >
            <XCircle className="w-4 h-4 text-rose-600 mr-1" /> <span className="text-xs">Cancel & Remove</span>
          </Button>
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
          <RefreshCw className="w-4 h-4 mr-2 text-primary" /> Refresh Operations Feed
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

      {/* Item-Level Audit & Verification Modal */}
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
                  onClick={() => downloadPdf(selectedAuditList.id)} 
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-3.5 shadow-md flex items-center justify-center gap-2.5 rounded-xl whitespace-nowrap text-sm"
                >
                  <Download className="w-4 h-4 text-rose-400 shrink-0" /> <span>Export PDF Report</span>
                </Button>
                <Button 
                  onClick={() => downloadExcel(selectedAuditList.id)} 
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3.5 shadow-md flex items-center justify-center gap-2.5 rounded-xl whitespace-nowrap text-sm"
                >
                  <Download className="w-4 h-4 text-emerald-200 shrink-0" /> <span>Export Excel Sheet</span>
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
                  {(selectedAuditList?.items || []).map((item: any) => (
                    <div 
                      key={item.id} 
                      onClick={() => handleToggleItemPick(item.id)}
                      className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        item.is_picked ? 'bg-white hover:bg-emerald-50/40' : 'bg-rose-50/60 hover:bg-rose-100/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                          item.is_picked ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-transparent'
                        }`}>
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-on-surface truncate">{item.product_name || `Item SKU #${item.id}`}</div>
                          <div className="text-xs text-on-surface-variant font-mono mt-0.5">Barcode: {item.barcode || 'N/A'}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-sm text-on-surface">{item.quantity_requested || 1} {item.unit || 'Units'}</div>
                        <div className={`text-[10px] font-bold uppercase mt-0.5 ${item.is_picked ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {item.is_picked ? 'Verified Picked' : 'Unchecked / Missing'}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(selectedAuditList?.items || []).length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-sm italic">
                      No line items found in this order record.
                    </div>
                  )}
                </div>
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
