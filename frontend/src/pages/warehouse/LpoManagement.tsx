import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { FileText, Download, UploadCloud, CheckCircle, ExternalLink, X } from 'lucide-react';

interface LPO {
  id: number;
  lpo_number: string;
  customer_name: string;
  sales_person_id: number;
  items: any[];
  signed_lpo_url: string | null;
  status: string;
}

export default function LpoManagement() {
  const [lpos, setLpos] = useState<LPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  useEffect(() => {
    fetchLpos();
  }, []);

  const fetchLpos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/lpos');
      setLpos(data);
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
      fetchLpos();
    } catch (err: any) {
      toast.error('Failed to upload signed LPO');
    } finally {
      setUploadingId(null);
    }
  };

  const handleConvertToPicklist = async (lpoId: number) => {
    try {
      const { data } = await api.post(`/lpos/${lpoId}/convert`);
      toast.success(`Converted to picklist successfully. ${data.items_count} items attached.`);
      fetchLpos();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to convert LPO');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">LPO Management</h1>
          <p className="text-on-surface-variant mt-1">Review and process Sales Person LPOs into picklists</p>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-on-surface-variant">Loading LPOs...</div>
        ) : lpos.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant">No LPOs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-variant/50">
                  <th className="p-4 font-semibold text-sm text-on-surface">LPO Number</th>
                  <th className="p-4 font-semibold text-sm text-on-surface">Customer</th>
                  <th className="p-4 font-semibold text-sm text-on-surface">Items</th>
                  <th className="p-4 font-semibold text-sm text-on-surface">Status</th>
                  <th className="p-4 font-semibold text-sm text-on-surface">Attachment</th>
                  <th className="p-4 font-semibold text-sm text-on-surface text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {lpos.map((lpo) => (
                  <tr key={lpo.id} className="hover:bg-surface-variant/30 transition-colors">
                    <td className="p-4 font-medium text-on-surface">{lpo.lpo_number}</td>
                    <td className="p-4 text-on-surface-variant">{lpo.customer_name}</td>
                    <td className="p-4 text-on-surface-variant">{lpo.items?.length || 0} items</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${lpo.status === 'processed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {lpo.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      {lpo.signed_lpo_url ? (
                        <a href={lpo.signed_lpo_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline text-sm font-medium">
                          <ExternalLink className="w-4 h-4 mr-1" /> View PDF
                        </a>
                      ) : (
                        <span className="text-sm text-red-500 font-medium">Missing</span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <label className={`cursor-pointer inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border ${uploadingId === lpo.id ? 'opacity-50' : 'hover:bg-surface-variant'} transition-colors`}>
                        <UploadCloud className="w-4 h-4 mr-1.5" />
                        {uploadingId === lpo.id ? 'Uploading...' : 'Upload PDF'}
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          disabled={uploadingId === lpo.id}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(lpo.id, e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                      
                      <button
                        onClick={() => handleConvertToPicklist(lpo.id)}
                        disabled={lpo.status === 'processed' || !lpo.signed_lpo_url}
                        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          lpo.status === 'processed' || !lpo.signed_lpo_url
                            ? 'bg-outline-variant text-on-surface-variant opacity-50 cursor-not-allowed'
                            : 'bg-primary text-white hover:bg-primary/90'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        Convert to Picklist
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
