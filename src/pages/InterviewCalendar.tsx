import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays, addMonths, subDays, subMonths, addWeeks, subWeeks, format,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay,
} from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useScheduledInterviews } from '@/hooks/useScheduledInterviews';
import { ScheduleInterviewDialog } from '@/components/pipeline/ScheduleInterviewDialog';
import { applyInterviewSchedule, formatInterviewScheduleError, type ScheduleInterviewData } from '@/lib/interviewPanelists';
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView';
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView';
import { CalendarListView } from '@/components/calendar/CalendarListView';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, CalendarDays, Video, MapPin, Phone, RefreshCw, AlertTriangle } from 'lucide-react';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { ScheduledInterview } from '@/hooks/useScheduledInterviews';
import { cn } from '@/lib/utils';

type CalView = 'month' | 'week' | 'list';

const MODE_LEGEND = [
  { label: 'Video', icon: Video, dot: 'bg-blue-500' },
  { label: 'In Person', icon: MapPin, dot: 'bg-emerald-500' },
  { label: 'Phone', icon: Phone, dot: 'bg-amber-500' },
];

function getNavLabel(view: CalView, date: Date): string {
  if (view === 'month') return format(date, 'MMMM yyyy');
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    if (format(start, 'MMM yyyy') === format(end, 'MMM yyyy')) {
      return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`;
    }
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }
  return 'All Interviews';
}

function navigateDate(view: CalView, date: Date, dir: 1 | -1): Date {
  if (view === 'month') return dir === 1 ? addMonths(date, 1) : subMonths(date, 1);
  if (view === 'week') return dir === 1 ? addWeeks(date, 1) : subWeeks(date, 1);
  return date;
}

export default function InterviewCalendar() {
  usePageTitle('Interview Calendar');
  const { isAdminOrHR, isRecruiter } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userTimezone = useUserTimezone();
  const canManage = isAdminOrHR || isRecruiter;

  const [view, setView] = useState<CalView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const dateRange = useMemo(() => {
    if (view === 'month') {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return { from: subDays(start, 7), to: addDays(end, 7) };
    }
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { from: subDays(start, 1), to: addDays(end, 1) };
    }
    const now = new Date();
    return { from: subDays(now, 14), to: addMonths(now, 3) };
  }, [view, currentDate]);

  const { data: interviews = [], isLoading, isError, error, refetch, isFetching } = useScheduledInterviews(dateRange, view);

  const visibleInterviews = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return interviews.filter(iv => {
        const d = new Date(iv.scheduled_at);
        return d >= startOfDay(start) && d <= endOfDay(end);
      });
    }
    if (view === 'month') {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return interviews.filter(iv => {
        const d = new Date(iv.scheduled_at);
        return d >= startOfDay(start) && d <= endOfDay(end);
      });
    }
    return interviews;
  }, [interviews, view, currentDate]);

  const [selectedInterview, setSelectedInterview] = useState<ScheduledInterview | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const handleReschedule = async (data: ScheduleInterviewData) => {
    if (!selectedInterview) return;
    setIsRescheduling(true);
    try {
      await applyInterviewSchedule(selectedInterview.id, data);
      setSelectedInterview(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['interview-kit', selectedInterview.id] });
      toast({ title: 'Interview rescheduled' });
    } catch (err: unknown) {
      toast({ title: 'Error', description: formatInterviewScheduleError(err), variant: 'destructive' });
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleEventClick = (iv: ScheduledInterview) => {
    if (canManage) setSelectedInterview(iv);
  };

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView('week');
  };

  // Stats
  const videoCount = visibleInterviews.filter(iv => (iv.interview_mode || 'video') === 'video').length;
  const inPersonCount = visibleInterviews.filter(iv => iv.interview_mode === 'in_person').length;
  const phoneCount = visibleInterviews.filter(iv => iv.interview_mode === 'phone').length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className={cn(
        'container mx-auto py-4 sm:py-8 flex flex-col gap-4 sm:gap-5 flex-1 min-h-0',
        view === 'list' ? 'px-2 sm:px-4 md:px-6' : 'px-4 sm:px-6',
      )}>

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Interview Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">All scheduled interviews at a glance</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Legend */}
            <div className="hidden sm:flex items-center gap-3 mr-2">
              {MODE_LEGEND.map(({ label, icon: Icon, dot }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats + View controls bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Stats — horizontal scroll on narrow screens */}
          <div className="-mx-2 sm:mx-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:overflow-visible">
            <div className="flex items-center gap-2 flex-nowrap md:flex-wrap px-2 sm:px-0 pb-0.5 md:pb-0">
              <Badge variant="secondary" className="gap-1.5 shrink-0">
                <CalendarDays className="h-3.5 w-3.5" />
                {visibleInterviews.length} total
              </Badge>
              {videoCount > 0 && (
                <Badge variant="outline" className="gap-1 shrink-0 border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
                  <Video className="h-3 w-3" />{videoCount} video
                </Badge>
              )}
              {inPersonCount > 0 && (
                <Badge variant="outline" className="gap-1 shrink-0 border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                  <MapPin className="h-3 w-3" />{inPersonCount} in-person
                </Badge>
              )}
              {phoneCount > 0 && (
                <Badge variant="outline" className="gap-1 shrink-0 border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
                  <Phone className="h-3 w-3" />{phoneCount} phone
                </Badge>
              )}
            </div>
          </div>

          {/* Nav + view tabs */}
          <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:flex-wrap md:items-center">
            {view !== 'list' && (
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
                <div className="flex items-center gap-1 min-w-0 flex-1 md:flex-initial">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCurrentDate(d => navigateDate(view, d, -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs sm:text-sm font-medium text-center truncate flex-1 md:flex-none md:min-w-[160px]">{getNavLabel(view, currentDate)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCurrentDate(d => navigateDate(view, d, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* View switcher — full width on mobile */}
            <div className="flex rounded-lg border border-border overflow-hidden w-full md:w-auto">
              {(['month', 'week', 'list'] as CalView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'flex-1 md:flex-none px-3 py-2 md:py-1.5 text-xs font-medium capitalize border-r border-border last:border-r-0 transition-colors min-h-[40px] md:min-h-0',
                    view === v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted/60'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isError && interviews.length === 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Could not load interviews{(error as Error)?.message ? `: ${(error as Error).message}` : ''}. Try again.</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </Button>
          </div>
        )}

        {/* Calendar body */}
        {isLoading && interviews.length === 0 ? (
          <Skeleton className="flex-1 h-[600px] rounded-xl" />
        ) : view === 'week' ? (
          <CalendarWeekView
            currentDate={currentDate}
            interviews={visibleInterviews}
            timezone={userTimezone}
            onEventClick={handleEventClick}
          />
        ) : view === 'month' ? (
          <CalendarMonthView
            currentDate={currentDate}
            interviews={visibleInterviews}
            timezone={userTimezone}
            onEventClick={handleEventClick}
            onDayClick={handleDayClick}
          />
        ) : (
          <CalendarListView
            interviews={visibleInterviews}
            onEventClick={handleEventClick}
          />
        )}
      </main>

      {canManage && (
        <ScheduleInterviewDialog
          open={!!selectedInterview}
          onOpenChange={(open) => !open && setSelectedInterview(null)}
          interview={selectedInterview as any}
          onSubmit={handleReschedule}
          isSubmitting={isRescheduling}
        />
      )}

      <Footer />
    </div>
  );
}
