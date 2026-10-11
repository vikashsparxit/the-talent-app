import { useRef, useEffect } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval, isToday,
  format, getHours, getMinutes,
} from 'date-fns';
import { EventPill } from './CalendarEventPill';
import type { ScheduledInterview } from '@/hooks/useScheduledInterviews';
import { calendarDayKey } from '@/lib/formatTz';
import { cn } from '@/lib/utils';

const START_HOUR = 0;   // midnight
const END_HOUR = 24;    // midnight (next day)
const HOUR_PX = 64;     // px per hour
const TOTAL_PX = (END_HOUR - START_HOUR) * HOUR_PX;

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

function timeToY(date: Date): number {
  const h = getHours(date) - START_HOUR;
  const m = getMinutes(date);
  return (h + m / 60) * HOUR_PX;
}

interface Props {
  currentDate: Date;
  interviews: ScheduledInterview[];
  timezone: string;
  onEventClick: (iv: ScheduledInterview) => void;
}

export function CalendarWeekView({ currentDate, interviews, timezone, onEventClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_PX;
    }
  }, [currentDate]);

  const byDay = new Map<string, ScheduledInterview[]>();
  weekDays.forEach(d => byDay.set(calendarDayKey(d, timezone), []));
  interviews.forEach(iv => {
    const key = calendarDayKey(iv.scheduled_at, timezone);
    if (byDay.has(key)) byDay.get(key)!.push(iv);
  });

  return (
    <div className="flex flex-col min-h-[480px] max-h-[calc(100vh-17rem)] flex-1 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]">
      {/* Day header row — fixed; only the time grid below scrolls */}
      <div
        className="grid shrink-0 border-b border-border/60 bg-muted/30 z-10"
        style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}
      >
        <div className="border-r border-border/60 bg-muted/30" />
        {weekDays.map(day => (
          <div
            key={day.toISOString()}
            className={cn(
              'flex flex-col items-center py-3 border-r border-border/60 last:border-r-0',
              isToday(day) && 'bg-primary/5'
            )}
          >
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {format(day, 'EEE')}
            </span>
            <span className={cn(
              'mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold',
              isToday(day)
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground'
            )}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="grid relative" style={{ gridTemplateColumns: '56px repeat(7, 1fr)', height: `${TOTAL_PX}px` }}>
          {/* Time labels column */}
          <div className="relative border-r border-border/60">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full flex items-start justify-end pr-2"
                style={{ top: `${(h - START_HOUR) * HOUR_PX - 9}px`, height: `${HOUR_PX}px` }}
              >
                <span className="text-[10px] text-muted-foreground/70 font-medium">
                  {format(new Date(2000, 0, 1, h), 'h a')}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map(day => {
            const key = calendarDayKey(day, timezone);
            const dayEvents = byDay.get(key) || [];
            return (
              <div
                key={key}
                className={cn(
                  'relative border-r border-border/60 last:border-r-0',
                  isToday(day) && 'bg-primary/[0.02]'
                )}
              >
                {/* Hour grid lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-border/40"
                    style={{ top: `${(h - START_HOUR) * HOUR_PX}px` }}
                  />
                ))}
                {/* Half-hour lines */}
                {HOURS.map(h => (
                  <div
                    key={`${h}-half`}
                    className="absolute w-full border-t border-border/20 border-dashed"
                    style={{ top: `${(h - START_HOUR) * HOUR_PX + HOUR_PX / 2}px` }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map(iv => {
                  const top = timeToY(new Date(iv.scheduled_at));
                  const height = Math.max(HOUR_PX, 40); // min 40px
                  if (top < 0 || top > TOTAL_PX) return null;
                  return (
                    <div
                      key={iv.id}
                      className="absolute left-1 right-1 z-10"
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <EventPill
                        interview={iv}
                        showTime
                        className="h-full"
                        onClick={() => onEventClick(iv)}
                      />
                    </div>
                  );
                })}

                {/* Current time indicator */}
                {isToday(day) && (() => {
                  const now = new Date();
                  const y = timeToY(now);
                  if (y < 0 || y > TOTAL_PX) return null;
                  return (
                    <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top: `${y}px` }}>
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 -ml-1" />
                      <div className="flex-1 h-px bg-primary" />
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
