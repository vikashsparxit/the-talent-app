import { CheckCircle2, CalendarDays, ClipboardCheck, Clock, Star, UserPlus, UserX } from 'lucide-react';
import type { PipelineActionId, PipelineActionItem } from '@/lib/pipelineActionQueue';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ACTION_ICONS: Record<PipelineActionId, typeof CheckCircle2> = {
  decide: ClipboardCheck,
  pending: Clock,
  noshow: UserX,
  schedule: CalendarDays,
  schedule_push: CalendarDays,
  source: UserPlus,
  feedback: Star,
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
      className={cn('flex min-w-0 items-center gap-3', className)}
      role="region"
      aria-label="Job action queue"
    >
      <span className="shrink-0 text-caption font-medium uppercase tracking-[0.04em] text-muted-foreground">
        Do
      </span>
      <ul className="-my-1 flex min-w-0 snap-x items-center gap-2 overflow-x-auto py-1 pr-8 [scrollbar-width:none]">
        {items.map((item) => {
          const Icon = ACTION_ICONS[item.id];
          const isActive = activeFocus === item.id ||
            (activeFocus === 'schedule' && item.id === 'schedule_push') ||
            (activeFocus === 'schedule_push' && item.id === 'schedule');
          return (
            <li key={item.id} className="shrink-0 snap-start">
              <button
                type="button"
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-label whitespace-nowrap',
                  'transition-[background-color,color,box-shadow,transform] duration-fast ease-out active:scale-[0.96]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'bg-foreground text-background shadow-border'
                    : 'bg-card text-foreground shadow-border hover:shadow-border-hover',
                )}
                onClick={() => onSelect(item.id)}
                aria-pressed={isActive}
              >
                <Icon
                  className={cn('size-4 shrink-0', isActive ? 'text-background' : 'text-muted-foreground')}
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span>{item.label}</span>
                <span className={cn('text-caption', isActive ? 'text-background/70' : 'text-muted-foreground')}>
                  {item.cta}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {activeFocus && activeFocus !== 'source' && onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-8 shrink-0 gap-1 text-label text-muted-foreground"
          onClick={onClear}
        >
          <CheckCircle2 className="size-4" strokeWidth={1.5} aria-hidden />
          Clear focus
        </Button>
      )}
    </div>
  );
}
