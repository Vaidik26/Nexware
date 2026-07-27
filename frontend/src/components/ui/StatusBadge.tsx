import { cn } from '@/lib/utils';

export type StatusType = 'draft' | 'assigned' | 'picking' | 'waiting_verification' | 'verified' | 'success' | 'warning' | 'error';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles: Record<StatusType, string> = {
    draft: 'bg-surface-container text-on-surface-variant border-outline-variant',
    assigned: 'bg-blue-100 text-blue-800 border-blue-200',
    picking: 'bg-purple-100 text-purple-800 border-purple-200',
    waiting_verification: 'bg-orange-100 text-orange-800 border-orange-200',
    verified: 'bg-secondary-container text-[#003c28] border-secondary',
    success: 'bg-secondary-container text-[#003c28] border-secondary',
    warning: 'bg-orange-100 text-orange-800 border-orange-200',
    error: 'bg-red-100 text-error border-red-200',
  };

  const defaultLabels: Record<StatusType, string> = {
    draft: 'Draft',
    assigned: 'Assigned',
    picking: 'Picking',
    waiting_verification: 'Waiting Verification',
    verified: 'Verified',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        styles[status]
      )}
    >
      {label || defaultLabels[status]}
    </span>
  );
}
