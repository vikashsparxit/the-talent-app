import { cn } from '@/lib/utils';
import { CandidateAssessmentStatus } from '@/types/database';

interface StatusBadgeProps {
  status: CandidateAssessmentStatus;
  className?: string;
}

const statusConfig: Record<CandidateAssessmentStatus, { label: string; classes: string }> = {
  invited: {
    label: 'Invited',
    classes: 'bg-info/10 text-info border-info/20',
  },
  in_progress: {
    label: 'In Progress',
    classes: 'bg-warning/10 text-warning border-warning/20',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-primary/10 text-primary border-primary/20',
  },
  evaluated: {
    label: 'Evaluated',
    classes: 'bg-success/10 text-success border-success/20',
  },
  expired: {
    label: 'Expired',
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
        config.classes,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {config.label}
    </span>
  );
}
