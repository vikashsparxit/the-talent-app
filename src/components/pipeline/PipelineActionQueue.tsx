import { CheckCircle2, CalendarDays, ClipboardCheck, Clock, Star, UserPlus, UserX } from 'lucide-react';
import type { PipelineActionId, PipelineActionItem } from '@/lib/pipelineActionQueue';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ACTION_META: Record<
  PipelineActionId,
  { icon: typeof CheckCircle2; accent: string }
> = {
  decide: {
    icon: ClipboardCheck,
    accent: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-100',
  },
  pending: {
    icon: Clock,
    accent: 'border-violet-200/80 bg-violet-50/70 text-violet-900 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-100',
  },
  noshow: {
    icon: UserX,
    accent: 'border-slate-200/80 bg-slate-50/70 text-slate-900 dark:border-slate-700/50 dark:bg-slate-900/40 dark:text-slate-100',
  },
  schedule: {
    icon: CalendarDays,
    accent: 'border-sky-200/80 bg-sky-50/70 text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-100',
  },
  schedule_push: {
    icon: CalendarDays,
    accent: 'border-sky-200/80 bg-sky-50/70 text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-100',
  },
  source: {
    icon: UserPlus,
    accent: 'border-indigo-200/80 bg-indigo-50/70 text-indigo-900 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-100',
  },
  feedback: {
    icon: Star,
    accent: 'border-amber-200/80 bg-amber-50/70 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100',
  },
};

export interface PipelineActionQueueProps {
  items: PipelineActionItem[];
  activeFocus: PipelineActionId | null;
  onSelect: (id: PipelineActionId) => void;
  onClear?: () => void;
  className?: string;
}

/** Deterministic “Do” strip — counts + CTAs only; hide when empty. */
export function PipelineActionQueue({
  items,
  activeFocus,
  onSelect,
  onClear,
  className,
}: PipelineActionQueueProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 flex-wrap rounded-lg border border-border/80 bg-muted/30 px-2.5 py-2',
        className,
      )}
      role="region"
      aria-label="Job action queue"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
        Do
      </span>
      <ul className="flex items-center gap-1.5 flex-wrap min-w-0">
        {items.map((item) => {
          const meta = ACTION_META[item.id];
          const Icon = meta.icon;
          const isActive = activeFocus === item.id ||
            (activeFocus === 'schedule' && item.id === 'schedule_push') ||
            (activeFocus === 'schedule_push' && item.id === 'schedule');
          return (
            <li key={item.id}>
              <Button
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                className={cn(
                  'h-8 gap-1.5 text-xs font-medium',
                  !isActive && meta.accent,
                  isActive && 'btn-gradient text-primary-foreground',
                )}
                onClick={() => onSelect(item.id)}
                aria-pressed={isActive}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span>{item.label}</span>
                <span
                  className={cn(
                    'rounded px-1 py-px text-[10px] font-semibold tabular-nums',
                    isActive ? 'bg-background/20' : 'bg-background/60 text-foreground/80',
                  )}
                >
                  {item.cta}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {activeFocus && activeFocus !== 'source' && onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground ml-auto shrink-0 gap-1"
          onClick={onClear}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Clear focus
        </Button>
      )}
    </div>
  );
}
