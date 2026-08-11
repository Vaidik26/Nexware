import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  UploadCloud, ExternalLink, CheckCircle, XCircle, Clock,
  Users, Zap, Package2, Calendar, RefreshCw, Trash2, Eye, FileText
} from 'lucide-react';

interface LPO {
  id: number;
  lpo_number: string;
  customer_name: string;
  sales_person_id: number | null;
  items: any[];
  signed_lpo_url: string | null;
  status: string;
  source: string;
  delivery_date: string | null;
  created_at: string | null;
}

interface Picker {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:      { label: 'Pending Review', color: 'bg-amber-100 text-amber-700 border-amber-200',     icon: Clock       },
  approved:     { label: 'Approved',       color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  disapproved:  { label: 'Disapproved',    color: 'bg-red-100 text-red-700 border-red-200',            icon: XCircle     },
  processed:    { label: 'Processed',      color: 'bg-blue-100 text-blue-700 border-blue-200',         icon: Package2    },
  // legacy
  draft:        { label: 'Pending Review', color: 'bg-amber-100 text-amber-700 border-amber-200',     icon: Clock       },
};

const SOURCE_LABEL: Record<string, string> = {
  upload: 'PDF Upload',
  manual: 'Manual Order',
  mobile: 'Mobile App',
};

export default function LpoManagement() {
  const [lpos, setLpos] = useState<LPO[]>([]);
  const [pickers, setPickers] = useState<Picker[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  // Approve modal
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approvingLpo, setApprovingLpo] = useState<LPO | null>(null);
  const [assignMode, setAssignMode] = useState<'auto' | 'manual'>('auto');
  const [selectedPickerId, setSelectedPickerId] = useState<number | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  // Disapprove modal
  const [disapproveModalOpen, setDisapproveModalOpen] = useState(false);
  const [disapprovingLpo, setDisapprovingLpo] = useState<LPO | null>(null);
  const [isDisapproving, setIsDisapproving] = useState(false);

  // Details modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedLpo, setSelectedLpo] = useState<LPO | null>(null);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingLpo, setDeletingLpo] = useState<LPO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lpoRes, usersRes] = await Promise.all([
        api.get('/lpos'),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      setLpos(lpoRes.data || []);
      setPickers((usersRes.data || []).filter((u: any) => u.role === 'picker'));
    } catch (err: any) {
      toast.error('Failed to load LPOs');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (lpoId: number, file: File) => {
    try {
      setUploadingId(lpoId);
      const formData = new FormData();
      formData.append('file', file);
      const { data: uploadData } = await api.post('/orders/upload-signed-lpo', formData);
      await api.patch(`/lpos/${lpoId}/url`, null, { params: { url: uploadData.url } });
      toast.success('Signed LPO uploaded successfully');
      fetchData();
    } catch (err: any) {
      toast.error('Failed to upload signed LPO');
    } finally {
      setUploadingId(null);
    }
  };

  const openApproveModal = (lpo: LPO) => {
    setApprovingLpo(lpo);
    setAssignMode('auto');
    setSelectedPickerId(pickers[0]?.id || null);
    setApproveModalOpen(true);
  };

  const handleApprove = async () => {
    if (!approvingLpo) return;
    if (assignMode === 'manual' && !selectedPickerId) {
      toast.error('Please select a picker');
      return;
    }
    setIsApproving(true);
    try {
      const res = await api.post(`/lpos/${approvingLpo.id}/approve`, {
        assign_mode: assignMode,
        picker_id: assignMode === 'manual' ? selectedPickerId : null,
      });
      toast.success(`LPO approved! Assigned to ${res.data.assigned_to || 'picker'}. Picklist created.`);
      setApproveModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to approve LPO');
    } finally {
      setIsApproving(false);
    }
  };

  const openDisapproveModal = (lpo: LPO) => {
    setDisapprovingLpo(lpo);
    setDisapproveModalOpen(true);
  };

  const handleDisapprove = async () => {
    if (!disapprovingLpo) return;
    setIsDisapproving(true);
    try {
      await api.post(`/lpos/${disapprovingLpo.id}/disapprove`);
      toast.success(`LPO #${disapprovingLpo.lpo_number} disapproved.`);
      setDisapproveModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to disapprove LPO');
    } finally {
      setIsDisapproving(false);
    }
  };

  const openDetailsModal = (lpo: LPO) => {
    setSelectedLpo(lpo);
    setDetailsModalOpen(true);
  };

  const openDeleteModal = (lpo: LPO) => {
    setDeletingLpo(lpo);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingLpo) return;
    setIsDeleting(true);
    try {
      await api.delete(`/lpos/${deletingLpo.id}`);
      toast.success(`LPO #${deletingLpo.lpo_number} deleted permanently.`);
      setDeleteModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete LPO');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredLpos = filterStatus === 'all'
    ? lpos
    : lpos.filter(l => (l.status === filterStatus) || (filterStatus === 'pending' && l.status === 'draft'));

  const counts = {
    all: lpos.length,
    pending: lpos.filter(l => l.status === 'pending' || l.status === 'draft').length,
    approved: lpos.filter(l => l.status === 'approved').length,
    disapproved: lpos.filter(l => l.status === 'disapproved').length,
    processed: lpos.filter(l => l.status === 'processed').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">LPO Management</h1>
          <p className="text-on-surface-variant mt-1">
            Review, approve, or disapprove incoming orders from all sources — PDF uploads, manual orders, and mobile app.
          </p>
        </div>
        <Button onClick={fetchData} variant="secondary" className="gap-2 self-start">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'All', counts.all],
          ['pending', 'Pending Review', counts.pending],
          ['approved', 'Approved', counts.approved],
          ['disapproved', 'Disapproved', counts.disapproved],
          ['processed', 'Processed', counts.processed],
        ] as [string, string, number][]).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              filterStatus === key
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-surface border-outline-variant text-on-surface-variant hover:border-primary/50'
            }`}
          >
            {label}
            <span className={`ml-2 px-1.5 py-0.5 rounded-md text-xs ${
              filterStatus === key ? 'bg-white/20' : 'bg-surface-container'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-on-surface-variant">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
            Loading LPOs...
          </div>
        ) : filteredLpos.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant">
            <Package2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold">No LPOs found</p>
            <p className="text-sm mt-1">LPOs from PDF uploads, manual orders, and mobile app will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-variant/40 border-b border-outline-variant">
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">LPO / Order</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">Customer</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">Source</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">Items</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">Delivery</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">Status</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide">LPO File</th>
                  <th className="p-4 font-bold text-xs text-on-surface-variant uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredLpos.map((lpo) => {
                  const statusCfg = STATUS_CONFIG[lpo.status] || STATUS_CONFIG['pending'];
                  const StatusIcon = statusCfg.icon;
                  const isPending = lpo.status === 'pending' || lpo.status === 'draft';
                  const isProcessed = lpo.status === 'processed';

                  return (
                    <tr key={lpo.id} className="hover:bg-surface-variant/20 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-on-surface">{lpo.lpo_number}</div>
                        {lpo.created_at && (
                          <div className="text-xs text-on-surface-variant mt-0.5">
                            {new Date(lpo.created_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-medium text-on-surface">{lpo.customer_name}</td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-surface-container border border-outline-variant text-on-surface-variant">
                          {SOURCE_LABEL[lpo.source] || lpo.source || 'Upload'}
                        </span>
                      </td>
                      <td className="p-4 text-on-surface-variant font-medium">
                        {lpo.items?.length || 0} items
                      </td>
                      <td className="p-4 text-on-surface-variant text-sm">
                        {lpo.delivery_date ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(lpo.delivery_date).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusCfg.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="p-4">
                        {lpo.signed_lpo_url ? (
                          <a
                            href={lpo.signed_lpo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline text-sm font-semibold"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View PDF
                          </a>
                        ) : (
                          <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-outline-variant hover:border-primary hover:bg-primary/5 transition-colors ${uploadingId === lpo.id ? 'opacity-50 pointer-events-none' : ''}`}>
                            <UploadCloud className="w-3.5 h-3.5" />
                            {uploadingId === lpo.id ? 'Uploading...' : 'Upload PDF'}
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              disabled={uploadingId === lpo.id}
                              onChange={(e) => {
                                if (e.target.files?.[0]) handleFileUpload(lpo.id, e.target.files[0]);
                              }}
                            />
                          </label>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {isPending && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openApproveModal(lpo)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => openDisapproveModal(lpo)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Disapprove
                              </button>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openDetailsModal(lpo)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-surface border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Details
                              </button>
                              <button
                                onClick={() => openDeleteModal(lpo)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                        {lpo.status === 'disapproved' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openApproveModal(lpo)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Re-approve
                            </button>
                            <button
                              onClick={() => openDeleteModal(lpo)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        )}
                        {isProcessed && (
                          <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => openDetailsModal(lpo)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-primary hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" /> View
                            </button>
                            <span className="text-xs text-on-surface-variant font-medium">Completed</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      <Modal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        title={`Approve LPO #${approvingLpo?.lpo_number}`}
      >
        <div className="space-y-5">
          <p className="text-sm text-on-surface-variant font-medium">
            Approving this LPO will convert it to a picklist and assign it to a warehouse picker immediately.
          </p>

          {/* Assign mode selector */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-3">Picker Assignment</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAssignMode('auto')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                  assignMode === 'auto' ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/30'
                }`}
              >
                <Zap className={`w-6 h-6 ${assignMode === 'auto' ? 'text-primary' : 'text-slate-400'}`} />
                <span className="text-sm font-bold">Auto Assign</span>
                <span className="text-xs text-on-surface-variant text-center">Round-robin to least loaded picker</span>
              </button>
              <button
                onClick={() => setAssignMode('manual')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                  assignMode === 'manual' ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/30'
                }`}
              >
                <Users className={`w-6 h-6 ${assignMode === 'manual' ? 'text-primary' : 'text-slate-400'}`} />
                <span className="text-sm font-bold">Manual Assign</span>
                <span className="text-xs text-on-surface-variant text-center">Choose a specific picker</span>
              </button>
            </div>
          </div>

          {/* Manual picker select */}
          {assignMode === 'manual' && (
            <div>
              <label className="block text-sm font-bold text-on-surface mb-2">Select Picker</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {pickers.length === 0 ? (
                  <div className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4 font-medium text-center">
                    No active pickers available
                  </div>
                ) : (
                  pickers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPickerId(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedPickerId === p.id
                          ? 'border-primary bg-primary/5'
                          : 'border-outline-variant hover:border-primary/40'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-on-surface">{p.full_name || p.email}</div>
                        <div className="text-xs text-on-surface-variant capitalize">{p.role}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setApproveModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleApprove}
              disabled={isApproving || (assignMode === 'manual' && !selectedPickerId)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {isApproving ? 'Approving...' : 'Approve & Assign'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Disapprove Modal */}
      <Modal
        isOpen={disapproveModalOpen}
        onClose={() => setDisapproveModalOpen(false)}
        title={`Disapprove LPO #${disapprovingLpo?.lpo_number}`}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">This LPO will be marked as disapproved.</p>
              <p className="text-sm text-red-600 mt-1">
                The order from <strong>{disapprovingLpo?.customer_name}</strong> will not be processed into a picklist.
                You can re-approve it later if needed.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDisapproveModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDisapprove}
              disabled={isDisapproving}
              className="bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              <XCircle className="w-4 h-4 mr-2" />
              {isDisapproving ? 'Disapproving...' : 'Confirm Disapprove'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Details Modal */}
      {selectedLpo && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={`LPO #${selectedLpo.lpo_number} Details`}
        >
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
            
            {/* Header info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface-variant/30 rounded-xl border border-outline-variant">
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase">Customer</p>
                <p className="font-semibold text-on-surface">{selectedLpo.customer_name}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase">Delivery Date</p>
                <p className="font-semibold text-on-surface">
                  {selectedLpo.delivery_date ? new Date(selectedLpo.delivery_date).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>

            {/* Items List */}
            <div>
              <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2">
                <Package2 className="w-4 h-4 text-primary" />
                Line Items ({selectedLpo.items?.length || 0})
              </h3>
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-variant/50 border-b border-outline-variant">
                    <tr>
                      <th className="p-3 font-semibold text-on-surface-variant">Barcode</th>
                      <th className="p-3 font-semibold text-on-surface-variant">Product Name</th>
                      <th className="p-3 font-semibold text-on-surface-variant text-right">Qty</th>
                      <th className="p-3 font-semibold text-on-surface-variant">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {selectedLpo.items?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-variant/20">
                        <td className="p-3 font-mono text-xs">{item.barcode}</td>
                        <td className="p-3 font-medium">{item.product_name}</td>
                        <td className="p-3 text-right font-semibold">{item.quantity}</td>
                        <td className="p-3 text-on-surface-variant">{item.unit}</td>
                      </tr>
                    ))}
                    {(!selectedLpo.items || selectedLpo.items.length === 0) && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-on-surface-variant">No items found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Embedded PDF Viewer */}
            {selectedLpo.signed_lpo_url && (
              <div>
                <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Source PDF Document
                </h3>
                <div className="border border-outline-variant rounded-xl overflow-hidden h-[500px] bg-slate-100 flex flex-col">
                  {/* Provide a direct link just in case the iframe doesn't render properly in some browsers */}
                  <div className="bg-surface p-2 border-b border-outline-variant flex justify-between items-center px-4">
                    <span className="text-xs font-semibold text-on-surface-variant">Preview</span>
                    <a href={selectedLpo.signed_lpo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Open in new tab
                    </a>
                  </div>
                  <iframe 
                    src={`${selectedLpo.signed_lpo_url}#toolbar=0`} 
                    className="w-full flex-1"
                    title="LPO PDF"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-outline-variant">
              <Button onClick={() => setDetailsModalOpen(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete LPO"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Are you sure you want to delete this order?</p>
              <p className="text-sm text-red-600 mt-1">
                LPO <strong>#{deletingLpo?.lpo_number}</strong> from <strong>{deletingLpo?.customer_name}</strong> will be permanently deleted from the database. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete Order'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
