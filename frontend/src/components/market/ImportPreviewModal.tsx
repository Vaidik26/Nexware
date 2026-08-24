import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

interface ErrorItem {
  sheet: string;
  row: number;
  sku: string;
  reason: string;
}

interface ValidUpdate {
  sku: string;
  sheet: string;
  row: number;
  [key: string]: any;
}

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isCommitting: boolean;
  previewData: {
    summary: { success_count: number; skipped_count: number };
    valid_updates: ValidUpdate[];
    errors: ErrorItem[];
  } | null;
}

export function ImportPreviewModal({ isOpen, onClose, onConfirm, isCommitting, previewData }: ImportPreviewModalProps) {
  if (!previewData) return null;

  const { summary, errors } = previewData;

  return (
    <Modal isOpen={isOpen} onClose={isCommitting ? () => {} : onClose} title="Review Market Prices Import">
      <div className="space-y-6">
        
        {/* Summary Header */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div>
              <div className="text-2xl font-bold text-emerald-700">{summary.success_count}</div>
              <div className="text-sm font-medium text-emerald-600">Valid Rows Ready</div>
            </div>
          </div>
          
          <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-600 mt-0.5" />
            <div>
              <div className="text-2xl font-bold text-rose-700">{summary.skipped_count}</div>
              <div className="text-sm font-medium text-rose-600">Rows Skipped</div>
            </div>
          </div>
        </div>

        {summary.success_count > 0 && (
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg flex gap-3 text-sm border border-blue-100">
            <Info className="w-5 h-5 shrink-0 text-blue-600" />
            <p>
              <strong>{summary.success_count}</strong> records will be updated or added. Skipped rows will be ignored and won't affect existing data.
            </p>
          </div>
        )}

        {errors.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Validation Errors
            </h4>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                  <tr>
                    <th className="px-4 py-2 border-b bg-slate-50">Sheet</th>
                    <th className="px-4 py-2 border-b bg-slate-50">Row</th>
                    <th className="px-4 py-2 border-b bg-slate-50">SKU</th>
                    <th className="px-4 py-2 border-b bg-slate-50">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {errors.map((err, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{err.sheet}</td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{err.row}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">{err.sku}</td>
                      <td className="px-4 py-2 text-rose-600">{err.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {summary.success_count === 0 && (
          <div className="bg-amber-50 text-amber-800 p-4 rounded-lg flex gap-3 text-sm border border-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            <p>No valid records found to import. Please fix the errors in your Excel file and try again.</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isCommitting}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={onConfirm}
            disabled={summary.success_count === 0 || isCommitting}
            isLoading={isCommitting}
          >
            {isCommitting ? 'Importing...' : 'Confirm Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
