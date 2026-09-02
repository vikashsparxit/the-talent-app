import { Video, MapPin, Phone } from 'lucide-react';
import type { ScheduledInterview } from '@/hooks/useScheduledInterviews';
import { formatPanelistNames } from '@/lib/interviewPanelists';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatTimeInTz } from '@/lib/formatTz';

export const MODE_STYLES: Record<string, { bg: string; border: string; text: string; dot: string; icon: React.ElementType; avatarBg: string }> = {
  video:     { bg: 'bg-blue-50 dark:bg-blue-950/40',       border: 'border-blue-200 dark:border-blue-800',       text: 'text-blue-800 dark:text-blue-200',     dot: 'bg-blue-500',    icon: Video,    avatarBg: 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100' },
  in_person: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-500', icon: MapPin,   avatarBg: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100' },
  phone:     { bg: 'bg-amber-50 dark:bg-amber-950/40',     border: 'border-amber-200 dark:border-amber-800',     text: 'text-amber-800 dark:text-amber-200',   dot: 'bg-amber-500',   icon: Phone,    avatarBg: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100' },
};

const DEFAULT_STYLE = MODE_STYLES.video;

function toInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

interface EventPillProps {
  interview: ScheduledInterview;
  showTime?: boolean;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

export function EventPill({ interview, showTime = false, compact = false, onClick, className }: EventPillProps) {
  const userTimezone = useUserTimezone();
  const mode = interview.interview_mode || 'video';
  const style = MODE_STYLES[mode] || DEFAULT_STYLE;
  const Icon = style.icon;
  const candidate = interview.candidate as { name: string } | null;
  const stage = interview.stage as { stage_name: string } | null;
  const interviewer = interview.interviewer as { full_name: string; email: string } | null;
  const panelists = interview.panelists?.length
    ? interview.panelists
    : interviewer
      ? [{ full_name: interviewer.full_name }]
      : [];
  const panelLabel = formatPanelistNames(panelists, 2);
  const initials = toInitials(candidate?.name ?? '');

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        'w-full text-left rounded-md border px-2 transition-all hover:brightness-95 active:scale-[0.98]',
        style.bg, style.border, style.text,
        compact ? 'py-0.5' : 'py-1.5',
        className
      )}
    >
      {/* Name row with avatar */}
      <div className="flex items-center gap-1.5 min-w-0">
        {compact ? (
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
        ) : (
          <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 leading-none', style.avatarBg)}>
            {initials}
          </div>
        )}
        <span className={cn('font-semibold truncate', compact ? 'text-[11px]' : 'text-xs')}>
          {candidate?.name ?? 'Candidate'}
        </span>
      </div>

      {/* Subtitle row: time · stage · interviewer */}
      {!compact && (
        <div className="flex items-center gap-1 mt-0.5 min-w-0 pl-[26px]">
          {showTime && (
            <span className="text-[10px] opacity-70 shrink-0">
              {formatTimeInTz(interview.scheduled_at, userTimezone)}
            </span>
          )}
          {stage?.stage_name && (
            <span className="text-[10px] opacity-60 truncate">— {stage.stage_name}</span>
          )}
          {panelLabel && (
            <span className="text-[10px] opacity-50 shrink-0 ml-auto truncate max-w-[45%]">↳ {panelLabel}</span>
          )}
        </div>
      )}
    </button>
  );
}
