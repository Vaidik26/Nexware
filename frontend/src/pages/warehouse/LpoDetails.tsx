import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useLiveEvent, LPO_EVENTS } from '@/lib/liveEvents';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  UploadCloud, ExternalLink, CheckCircle, XCircle,
  Package2, RefreshCw, Trash2, ArrowLeft,
  ChevronLeft, ChevronRight, FileText
} from 'lucide-react';

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
  source?: string;
  created_by_name?: string;
  delivery_date: string | null;
  created_at: string | null;
}

const ITEMS_PER_PAGE = 10;

export default function LpoDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [lpo, setLpo] = useState<LPO | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const [disapproveModalOpen, setDisapproveModalOpen] = useState(false);
  const [isDisapproving, setIsDisapproving] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async (quiet = false) => {
    if (!id) return;
    try {
      if (!quiet) setLoading(true);
      const lpoRes = await api.get(`/lpos/${id}`);
      setLpo(lpoRes.data);
    } catch (err: any) {
      // A background sync failing must not eject the user from the page.
      if (quiet) return;
      toast.error('Failed to load LPO details');
      navigate('/warehouse/lpos');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // Keep an open LPO in step with changes made elsewhere — no reload, no flicker.
  useLiveEvent(() => fetchData(true), LPO_EVENTS);

  const handleFileUpload = async (file: File) => {
    if (!lpo) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const { data: uploadData } = await api.post('/orders/upload-signed-lpo', formData);
      await api.patch(`/lpos/${lpo.id}/url`, null, { params: { url: uploadData.url } });
      
      toast.success('Signed LPO uploaded successfully');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload signed LPO');
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async () => {
    if (!lpo) return;
    setIsApproving(true);
    try {
      const res = await api.post(`/lpos/${lpo.id}/approve`, {
        assign_mode: 'auto',
        picker_id: null,
      });
      toast.success(`LPO approved! Assigned to ${res.data.assigned_to || 'picker'}.`);
      setApproveModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to approve LPO');
    } finally {
      setIsApproving(false);
    }
  };

  const handleDisapprove = async () => {
    if (!lpo) return;
    setIsDisapproving(true);
    try {
      await api.post(`/lpos/${lpo.id}/disapprove`);
      toast.success(`LPO #${lpo.lpo_number} disapproved.`);
      setDisapproveModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to disapprove LPO');
    } finally {
      setIsDisapproving(false);
    }
  };

  const handleDeliveryDateChange = async (dateStr: string) => {
    if (!lpo) return;
    try {
      await api.patch(`/lpos/${lpo.id}/delivery-date`, null, { params: { delivery_date: dateStr } });
      toast.success('Delivery date updated');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update delivery date');
    }
  };

  const handleDelete = async () => {
    if (!lpo) return;
    setIsDeleting(true);
    try {
      await api.delete(`/lpos/${lpo.id}`);
      toast.success(`LPO #${lpo.lpo_number} deleted permanently.`);
      navigate('/warehouse/lpos');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete LPO');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-on-surface-variant">
        <RefreshCw className="w-8 h-8 animate-spin text-primary mr-3" />
        <span className="font-medium text-lg">Loading LPO details...</span>
      </div>
    );
  }

  if (!lpo) return null;

  const totalPages = Math.ceil((lpo.items?.length || 0) / ITEMS_PER_PAGE);
  const paginatedItems = (lpo.items || []).slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const isPending = lpo.status === 'pending' || lpo.status === 'draft';
  const isProcessed = lpo.status === 'processed';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/warehouse/lpos')}
          className="p-2 rounded-full hover:bg-surface-variant transition-colors text-on-surface-variant"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-on-surface">Order #{lpo.lpo_number}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              lpo.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
              isProcessed ? 'bg-blue-100 text-blue-700' :
              lpo.status === 'disapproved' ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {lpo.status}
            </span>
          </div>
          <p className="text-on-surface-variant mt-1 font-medium">Customer: <span className="font-bold text-on-surface">{lpo.customer_name}</span></p>
          <p className="text-on-surface-variant mt-0.5 text-sm">Created By: <span className="font-semibold text-slate-800">{lpo.created_by_name || 'System / Admin'}</span></p>
        </div>
        
        <div className="ml-auto flex items-center gap-2">
          {/* Action Buttons */}
          {isPending && (
            <>
              <button
                onClick={() => {
                  setApproveModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm"
              >
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => setDisapproveModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Disapprove
              </button>
            </>
          )}
          
          {lpo.status === 'disapproved' && (
            <button
              onClick={() => {
                setApproveModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              <CheckCircle className="w-4 h-4" /> Re-approve
            </button>
          )}

          <button
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>


        </div>
      </div>

      <div className={`grid gap-6 ${lpo.signed_lpo_url ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        
        {/* Left Column: Details & Items */}
        <div className="space-y-6">
          
          {/* Metadata Card */}
          <div className="bg-surface border border-outline-variant rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-on-surface mb-4">Order Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Source</p>
                <p className="font-semibold text-on-surface mt-1 capitalize">{lpo.source || 'Upload'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Delivery Date</p>
                <input
                  type="date"
                  className="mt-1 bg-transparent border-none p-0 text-on-surface font-semibold focus:ring-0 cursor-pointer hover:bg-surface-variant/50 rounded px-1 -ml-1 transition-colors"
                  value={lpo.delivery_date ? new Date(lpo.delivery_date).toISOString().split('T')[0] : ''}
                  onChange={(e) => handleDeliveryDateChange(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Created At</p>
                <p className="font-semibold text-on-surface mt-1">
                  {lpo.created_at ? new Date(lpo.created_at).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Total Items</p>
                <p className="font-semibold text-on-surface mt-1">{lpo.items?.length || 0}</p>
              </div>
            </div>
            
            {/* Upload PDF Section */}
            <div className="mt-6 pt-6 border-t border-outline-variant">
              <h3 className="text-sm font-bold text-on-surface mb-3">Signed Source Document</h3>
              {!lpo.signed_lpo_url ? (
                <label className={`cursor-pointer flex items-center justify-center gap-2 w-full p-4 rounded-xl border-2 border-dashed border-outline-variant hover:border-primary hover:bg-primary/5 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <UploadCloud className="w-5 h-5 text-primary" />
                  <span className="font-bold text-primary">{uploading ? 'Uploading...' : 'Click to Upload Signed PDF'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                    }}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Document Uploaded</p>
                    <p className="text-xs text-emerald-600">The signed PDF has been attached to this order.</p>
                  </div>
                  <label className={`ml-auto cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold border border-outline-variant hover:bg-surface-variant transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    Replace
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Items Table with Pagination */}
          <div className="bg-surface border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="p-4 border-b border-outline-variant bg-surface-variant/30 flex justify-between items-center">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <Package2 className="w-4 h-4 text-primary" />
                Line Items
              </h3>
            </div>
            
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-variant/50 border-b border-outline-variant sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold text-on-surface-variant">Barcode</th>
                    <th className="p-3 font-semibold text-on-surface-variant">Product Name</th>
                    <th className="p-3 font-semibold text-on-surface-variant text-right">Qty</th>
                    <th className="p-3 font-semibold text-on-surface-variant">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {paginatedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-variant/20">
                      <td className="p-3 font-mono text-xs text-on-surface-variant">{item.barcode}</td>
                      <td className="p-3 font-medium text-on-surface">{item.product_name}</td>
                      <td className="p-3 text-right font-bold text-primary">{item.quantity}</td>
                      <td className="p-3 text-on-surface-variant">{item.unit}</td>
                    </tr>
                  ))}
                  {paginatedItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-on-surface-variant">No items found in this order.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-outline-variant bg-surface-variant/30 flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, lpo.items.length)} of {lpo.items.length}
                </span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
          
        </div>

        {/* Right Column: PDF Preview */}
        {lpo.signed_lpo_url && (
          <div className="bg-surface border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
            <div className="p-4 border-b border-outline-variant bg-surface-variant/30 flex justify-between items-center">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Source PDF Preview
              </h3>
              <a href={lpo.signed_lpo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
              </a>
            </div>
            <iframe 
              src={`${lpo.signed_lpo_url}#toolbar=0`} 
              className="w-full flex-1 bg-slate-100"
              title="LPO PDF"
            />
          </div>
        )}
      </div>

      {/* Approve Modal */}
      <Modal isOpen={approveModalOpen} onClose={() => setApproveModalOpen(false)} title={`Approve LPO #${lpo.lpo_number}`}>
        <div className="space-y-5">
          <p className="text-sm text-on-surface-variant font-medium">
            Approving this LPO will convert it to a picklist and automatically assign it to the least loaded available warehouse picker.
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setApproveModalOpen(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={isApproving} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
              {isApproving ? 'Approving...' : 'Approve'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Disapprove Modal */}
      <Modal isOpen={disapproveModalOpen} onClose={() => setDisapproveModalOpen(false)} title={`Disapprove LPO #${lpo.lpo_number}`}>
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Mark as disapproved.</p>
              <p className="text-sm text-red-600 mt-1">The order from {lpo.customer_name} will not be processed into a picklist. You can re-approve it later.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDisapproveModalOpen(false)}>Cancel</Button>
            <Button onClick={handleDisapprove} disabled={isDisapproving} className="bg-red-600 hover:bg-red-500 text-white font-bold">
              {isDisapproving ? 'Disapproving...' : 'Confirm Disapprove'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete LPO">
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Are you sure you want to delete this order?</p>
              <p className="text-sm text-red-600 mt-1">LPO #{lpo.lpo_number} will be permanently deleted from the database. This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-500 text-white font-bold">
              {isDeleting ? 'Deleting...' : 'Yes, Delete Order'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
