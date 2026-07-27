import { Modal } from './Modal';
import { Button } from './Button';
import { ShieldAlert, FileText, Check } from 'lucide-react';

interface ActionRestrictedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string | null;
}

export function ActionRestrictedModal({
  isOpen,
  onClose,
  title = 'Action Restricted: Data Protection & Audit Rule',
  message,
}: ActionRestrictedModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="flex items-start gap-4 bg-amber-50 border border-amber-200/80 p-4 rounded-2xl shadow-xs">
          <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-amber-900 tracking-tight">
              Operation Blocked by System Governance
            </h3>
            <p className="text-xs text-amber-800/90 font-medium leading-relaxed">
              {message || 'This record cannot be removed because historical entries, active inventory logs, or assigned operational tasks depend on it.'}
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl space-y-2.5 text-xs text-slate-600 font-medium">
          <div className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-2">
            <FileText className="w-4 h-4 text-slate-600" />
            <span>Why is this deletion restricted?</span>
          </div>
          <div className="space-y-2 pt-0.5">
            <p className="flex items-start gap-2">
              <span className="text-amber-600 font-bold mt-0.5">•</span>
              <span>
                <strong>Historical Market Rates:</strong> Commodities with recorded past Dubai or International spot prices are permanently preserved to prevent corruption of daily pricing history, charts, and accounting audits.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-amber-600 font-bold mt-0.5">•</span>
              <span>
                <strong>Warehouse & Picklist Records:</strong> Catalogue items referenced in customer orders, active picklists, or verified loading logs cannot be deleted to ensure accurate invoice verification.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-amber-600 font-bold mt-0.5">•</span>
              <span>
                <strong>Ongoing Staff Assignments:</strong> User accounts for pickers currently executing active warehouse operations cannot be terminated until their tasks are completed or reassigned.
              </span>
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-outline-variant">
          <Button onClick={onClose} className="px-6 font-semibold shadow-xs">
            <Check className="w-4 h-4 mr-1.5" /> Acknowledge & Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
