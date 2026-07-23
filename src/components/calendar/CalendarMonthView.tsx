import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isToday, isSameDay, format,
} from 'date-fns';
import { EventPill } from './CalendarEventPill';
import type { ScheduledInterview } from '@/hooks/useScheduledInterviews';
import { calendarDayKey } from '@/lib/formatTz';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE = 3;

interface Props {
  currentDate: Date;
  interviews: ScheduledInterview[];
  timezone: string;
  onEventClick: (iv: ScheduledInterview) => void;
  onDayClick: (date: Date) => void;
}

export function CalendarMonthView({ currentDate, interviews, timezone, onEventClick, onDayClick }: Props) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Group by date string
  const byDay = new Map<string, ScheduledInterview[]>();
  interviews.forEach(iv => {
    const key = calendarDayKey(iv.scheduled_at, timezone);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(iv);
  });

  return (
    <div className="flex flex-col min-h-[600px] flex-1 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-border/60 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7" style={{ gridAutoRows: '1fr' }}>
        {days.map(day => {
          const key = calendarDayKey(day, timezone);
          const events = byDay.get(key) || [];
          const overflow = events.length - MAX_VISIBLE;
          const isCurrentMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <div
              key={key}
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[110px] p-1.5 border-r border-b border-border/60 last:border-r-0 cursor-pointer transition-colors',
                !isCurrentMonth && 'bg-muted/20',
                today && 'bg-primary/[0.03]',
                'hover:bg-muted/40'
              )}
            >
              {/* Day number */}
              <div className="flex justify-end mb-1">
                <span className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium',
                  today
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : isCurrentMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground/40'
                )}>
                  {format(day, 'd')}
                </span>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {events.slice(0, MAX_VISIBLE).map(iv => (
                  <EventPill
                    key={iv.id}
                    interview={iv}
                    compact
                    showTime={false}
                    onClick={() => onEventClick(iv)}
                  />
                ))}
                {overflow > 0 && (
                  <p className="text-[10px] text-muted-foreground font-medium px-1 mt-0.5">
                    +{overflow} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
