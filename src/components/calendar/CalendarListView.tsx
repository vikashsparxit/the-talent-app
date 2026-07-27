import { format, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';
import { CalendarDays, User, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScheduledInterview } from '@/hooks/useScheduledInterviews';
import { MODE_STYLES } from './CalendarEventPill';
import { formatPanelistNames } from '@/lib/interviewPanelists';
import { cn } from '@/lib/utils';

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, d MMMM');
}

interface Props {
  interviews: ScheduledInterview[];
  onEventClick: (iv: ScheduledInterview) => void;
}

export function CalendarListView({ interviews, onEventClick }: Props) {
  if (interviews.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] py-20">
        <div className="p-4 rounded-full bg-muted">
          <CalendarDays className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No interviews scheduled</p>
        <p className="text-xs text-muted-foreground">Schedule interviews from the Pipeline page</p>
      </div>
    );
  }

  // Group by day
  const groups = new Map<string, ScheduledInterview[]>();
  interviews.forEach(iv => {
    const key = format(startOfDay(new Date(iv.scheduled_at)), 'yyyy-MM-dd');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(iv);
  });

  const sortedDays = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="flex-1 rounded-xl border border-border/60 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] overflow-hidden">
      <ScrollArea className="h-full">
        <div className="p-2 md:p-4 space-y-5 md:space-y-6 pb-4">
          {sortedDays.map(([dateKey, dayInterviews]) => {
            const date = new Date(dateKey);
            const isPass = isPast(date) && !isToday(date);
            return (
              <div key={dateKey}>
                {/* Day heading */}
                <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                  <div className={cn(
                    'flex flex-col items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-md md:rounded-lg shrink-0',
                    isToday(date) ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  )}>
                    <span className="text-[9px] md:text-[10px] font-semibold uppercase leading-none opacity-70">
                      {format(date, 'MMM')}
                    </span>
                    <span className="text-sm md:text-base font-bold leading-none mt-0.5">
                      {format(date, 'd')}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-xs md:text-sm font-semibold truncate',
                      isPass && 'text-muted-foreground'
                    )}>
                      {dayLabel(date)}
                    </p>
                    <p className="text-[11px] md:text-xs text-muted-foreground">
                      {dayInterviews.length} interview{dayInterviews.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Interview cards */}
                <div className="space-y-2 md:pl-[52px]">
                  {dayInterviews
                    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                    .map(iv => {
                      const mode = iv.interview_mode || 'video';
                      const style = MODE_STYLES[mode] || MODE_STYLES.video;
                      const Icon = style.icon;
                      const candidate = iv.candidate as { name: string; email: string } | null;
                      const stage = iv.stage as { stage_name: string } | null;
                      const interviewer = iv.interviewer as { full_name: string } | null;
                      const panelists = iv.panelists?.length
                        ? iv.panelists
                        : interviewer
                          ? [{ full_name: interviewer.full_name }]
                          : [];
                      const panelLabel = formatPanelistNames(panelists);
                      const job = iv.job as { title: string } | null;
                      const hasPassed = isPast(new Date(iv.scheduled_at));
                      const hasVerdict = !!iv.verdict;
                      const showMeetingLink = !hasPassed && !hasVerdict;
                      const metaParts = [stage?.stage_name, job?.title].filter(Boolean);

                      return (
                        <button
                          key={iv.id}
                          onClick={() => onEventClick(iv)}
                          className={cn(
                            'w-full text-left rounded-xl border p-3 md:p-4 transition-all',
                            'active:opacity-90 md:hover:shadow-md md:hover:scale-[1.005]',
                            style.bg, style.border,
                            'group min-h-[44px]'
                          )}
                        >
                          {/* Time + mode row */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={cn('text-sm md:text-xs font-bold tabular-nums', style.text)}>
                              {format(new Date(iv.scheduled_at), 'h:mm a')}
                            </span>
                            <span className={cn(
                              'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
                              style.bg, style.border, style.text
                            )}>
                              <Icon className="h-3 w-3 shrink-0" />
                              {mode === 'in_person' ? 'In Person' : mode === 'video' ? 'Video' : 'Phone'}
                            </span>
                            {hasVerdict && (
                              <Badge variant="outline" className="text-[10px] md:text-[10px] px-1.5 py-0 h-5 bg-emerald-50 border-emerald-200 text-emerald-700">
                                Done
                              </Badge>
                            )}
                            {hasPassed && !hasVerdict && (
                              <Badge variant="outline" className="text-[10px] md:text-[10px] px-1.5 py-0 h-5 bg-red-50 border-red-200 text-red-600">
                                Overdue
                              </Badge>
                            )}
                            {showMeetingLink && mode === 'video' && iv.meeting_link && (
                              <a
                                href={iv.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs font-medium text-blue-600',
                                  'rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 min-h-[32px]',
                                  'hover:underline md:ml-auto md:min-h-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:text-[10px]'
                                )}
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" /> Join
                              </a>
                            )}
                          </div>

                          <div className="flex items-start justify-between gap-2 md:gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-base md:text-sm font-semibold text-foreground truncate">
                                {candidate?.name ?? 'Unknown Candidate'}
                              </p>

                              {metaParts.length > 0 && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                                  {metaParts.join(' · ')}
                                </p>
                              )}
                            </div>

                            {panelLabel && (
                              <div className="hidden md:flex items-center gap-1.5 shrink-0 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-muted-foreground">Panel</span>
                                  <span className="text-xs font-medium text-foreground max-w-[120px] truncate">
                                    {panelLabel}
                                  </span>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </div>
                            )}
                          </div>

                          {panelLabel && (
                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/40 md:hidden">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] text-muted-foreground">Panel</span>
                                <p className="text-xs font-medium text-foreground truncate">{panelLabel}</p>
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
