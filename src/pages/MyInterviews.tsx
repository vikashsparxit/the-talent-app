import { useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, ExternalLink, Star, Loader2,
  ThumbsUp, ThumbsDown, Pause, UserX, Clock, NotebookPen, ArrowRight,
  ClipboardCheck, HelpCircle, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useCanAccessMyInterviews, useMyInterviews, type MyInterview } from '@/hooks/useMyInterviews';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { calendarDayKey, formatCalendarDayHeader, formatDateTimeInTz } from '@/lib/formatTz';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateDetailDrawer } from '@/components/candidates/CandidateDetailDrawer';
import type { Candidate } from '@/types/database';
import { MODE_STYLES } from '@/components/calendar/CalendarEventPill';
import { cn } from '@/lib/utils';
import { notifyStaffEmail } from '@/lib/staffEmail';
import type { InterviewVerdict, InterviewMode, RatingCategories } from '@/hooks/useInterviewPipeline';
import { InterviewFeedbackDialog } from '@/components/pipeline/InterviewFeedbackDialog';
import { InterviewKitDrawer } from '@/components/pipeline/InterviewKitDrawer';
import { fetchInterviewForKit } from '@/lib/interviewKit';
import { openCandidateDetailWithFetch } from '@/lib/candidateDetail';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useIsSmDown } from '@/hooks/use-mobile';

type MobilePrepPane = 'kit' | 'candidate';

function MobilePrepSwitcher({
  pane,
  onPaneChange,
  onClose,
}: {
  pane: MobilePrepPane;
  onPaneChange: (pane: MobilePrepPane) => void;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background px-3 py-2 sm:hidden">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        aria-label="Close interview prep"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-1 rounded-lg border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => onPaneChange('kit')}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            pane === 'kit'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Questions
        </button>
        <button
          type="button"
          onClick={() => onPaneChange('candidate')}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            pane === 'candidate'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Profile
        </button>
      </div>
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          disabled={pane === 'kit'}
          onClick={() => onPaneChange('kit')}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Show question kit"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={pane === 'candidate'}
          onClick={() => onPaneChange('candidate')}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Show candidate profile"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const VERDICT_CONFIG: Record<InterviewVerdict, { label: string; icon: typeof ThumbsUp; className: string }> = {
  proceeded: { label: 'Proceeded', icon: ThumbsUp, className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
  rejected: { label: 'Rejected', icon: ThumbsDown, className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
  hold: { label: 'On Hold', icon: Pause, className: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
  no_show: { label: 'No Show', icon: UserX, className: 'bg-muted text-muted-foreground border-border' },
};

function formatRatingKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function InterviewCardSkeleton() {
  return <Skeleton className="h-36 rounded-xl" />;
}

function EmptyState({ variant }: { variant: 'upcoming' | 'past' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] py-16 px-6">
      <div className="p-4 rounded-full bg-muted">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {variant === 'upcoming' ? 'No upcoming interviews' : 'No past interviews yet'}
      </p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        {variant === 'upcoming'
          ? 'When an interview is scheduled with you, it will appear here.'
          : 'Completed interviews and feedback you submit will show up here.'}
      </p>
      {variant === 'upcoming' && (
        <Button variant="outline" size="sm" asChild className="mt-2">
          <Link to="/calendar">View Calendar</Link>
        </Button>
      )}
    </div>
  );
}

function RatingSummary({ ratings }: { ratings?: RatingCategories | null }) {
  if (!ratings) return null;
  const entries = Object.entries(ratings).filter(([, v]) => v != null);
  if (!entries.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 text-xs bg-muted/60 text-muted-foreground px-2 py-1 rounded-md"
        >
          {formatRatingKey(key)}: <span className="font-semibold text-foreground">{value}/5</span>
        </span>
      ))}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: InterviewVerdict }) {
  const config = VERDICT_CONFIG[verdict];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function InterviewMeta({
  interview,
  userTimezone,
  showMeetingLink = true,
  onOpenCandidateProfile,
}: {
  interview: MyInterview;
  userTimezone: string;
  showMeetingLink?: boolean;
  onOpenCandidateProfile: (interview: MyInterview) => void;
}) {
  const mode = interview.interview_mode || 'video';
  const style = MODE_STYLES[mode] || MODE_STYLES.video;
  const Icon = style.icon;
  const jobId = interview.job_interview_stage?.job_id || interview.candidate?.job_id;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={cn('flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border', style.bg, style.border, style.text)}>
          <Icon className="h-3 w-3" />
          {mode === 'in_person' ? 'In Person' : mode === 'video' ? 'Video' : 'Phone'}
        </span>
        {interview.scheduled_at && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDateTimeInTz(interview.scheduled_at, userTimezone)}
          </span>
        )}
      </div>

      <p className="text-base font-semibold text-foreground truncate">
        {interview.candidate?.name ?? 'Unknown Candidate'}
      </p>

      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs text-muted-foreground">
        {interview.job_interview_stage?.stage_name && (
          <span>{interview.job_interview_stage?.stage_name}</span>
        )}
        {interview.job_title && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="truncate max-w-[200px]">{interview.job_title}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {showMeetingLink && mode === 'video' && interview.meeting_link && (
          <a
            href={interview.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Join meeting
          </a>
        )}
        {jobId && (
          <Link
            to={`/hiring?view=board&job=${jobId}&candidate=${interview.candidate_id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View in Pipeline <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => onOpenCandidateProfile(interview)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Candidate profile
        </button>
      </div>
    </>
  );
}

function interviewToCandidate(interview: MyInterview): Candidate {
  const c = interview.candidate;
  return {
    id: interview.candidate_id,
    name: c?.name ?? 'Unknown Candidate',
    email: c?.email ?? null,
    role_applied: c?.role_applied,
    job_id: c?.job_id ?? interview.job_interview_stage?.job_id,
    skills: [],
    created_at: '',
    updated_at: '',
  };
}

function UpcomingCard({
  interview,
  userTimezone,
  onViewKit,
  onOpenCandidateProfile,
}: {
  interview: MyInterview;
  userTimezone: string;
  onViewKit: (interview: MyInterview) => void;
  onOpenCandidateProfile: (interview: MyInterview) => void;
}) {
  const mode = interview.interview_mode || 'video';
  const style = MODE_STYLES[mode] || MODE_STYLES.video;

  return (
    <div className={cn('rounded-xl border p-4 sm:p-5 transition-shadow hover:shadow-md', style.bg, style.border)}>
      <InterviewMeta
        interview={interview}
        userTimezone={userTimezone}
        onOpenCandidateProfile={onOpenCandidateProfile}
      />
      <div className="mt-4 flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onViewKit(interview)}>
          <HelpCircle className="h-3.5 w-3.5" />
          View question kit
        </Button>
      </div>
    </div>
  );
}

function PastCard({
  interview,
  userTimezone,
  onSubmitFeedback,
  onViewKit,
  onOpenCandidateProfile,
}: {
  interview: MyInterview;
  userTimezone: string;
  onSubmitFeedback: (interview: MyInterview) => void;
  onViewKit: (interview: MyInterview) => void;
  onOpenCandidateProfile: (interview: MyInterview) => void;
}) {
  const mode = interview.interview_mode || 'video';
  const style = MODE_STYLES[mode] || MODE_STYLES.video;
  const needsFeedback = !interview.verdict;

  return (
    <div className={cn('rounded-xl border p-4 sm:p-5', style.bg, style.border)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <InterviewMeta
            interview={interview}
            userTimezone={userTimezone}
            showMeetingLink={false}
            onOpenCandidateProfile={onOpenCandidateProfile}
          />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {interview.verdict ? (
            <VerdictBadge verdict={interview.verdict} />
          ) : (
            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400">
              Feedback pending
            </Badge>
          )}
          {interview.overall_score != null && (
            <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {interview.overall_score}/5
            </span>
          )}
        </div>
      </div>

      <RatingSummary ratings={interview.rating_categories} />

      {interview.feedback && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Feedback</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{interview.feedback}</p>
        </div>
      )}

      {interview.interview_notes && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <NotebookPen className="h-3 w-3" /> Interview notes
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{interview.interview_notes}</p>
        </div>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        {needsFeedback ? (
          <Button size="sm" className="gap-1.5 btn-gradient text-primary-foreground" onClick={() => onSubmitFeedback(interview)}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            Submit feedback
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onViewKit(interview)}>
            <HelpCircle className="h-3.5 w-3.5" />
            View question kit
          </Button>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <InterviewCardSkeleton key={i} />)}
    </div>
  );
}

type DayGroup = {
  dayKey: string;
  label: string;
  interviews: MyInterview[];
};

function groupInterviewsByDay(
  interviews: MyInterview[],
  userTimezone: string,
  dayOrder: 'asc' | 'desc',
  withinDayOrder: 'asc' | 'desc',
): DayGroup[] {
  const grouped = new Map<string, MyInterview[]>();

  for (const interview of interviews) {
    if (!interview.scheduled_at) continue;
    const dayKey = calendarDayKey(interview.scheduled_at, userTimezone);
    if (!grouped.has(dayKey)) grouped.set(dayKey, []);
    grouped.get(dayKey)!.push(interview);
  }

  const sortByTime = (a: MyInterview, b: MyInterview) => {
    const diff = new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime();
    return withinDayOrder === 'asc' ? diff : -diff;
  };

  return Array.from(grouped.entries())
    .sort((a, b) => (dayOrder === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])))
    .map(([dayKey, dayInterviews]) => {
      const sorted = [...dayInterviews].sort(sortByTime);
      return {
        dayKey,
        label: formatCalendarDayHeader(sorted[0].scheduled_at!, userTimezone),
        interviews: sorted,
      };
    });
}

function DayGroupedList({
  groups,
  variant,
  userTimezone,
  onSubmitFeedback,
  onViewKit,
  onOpenCandidateProfile,
}: {
  groups: DayGroup[];
  variant: 'upcoming' | 'past';
  userTimezone: string;
  onSubmitFeedback: (interview: MyInterview) => void;
  onViewKit: (interview: MyInterview) => void;
  onOpenCandidateProfile: (interview: MyInterview) => void;
}) {
  return (
    <div className="space-y-8">
      {groups.map(group => (
        <section key={group.dayKey}>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {group.label}
          </h2>
          <div className="space-y-3">
            {group.interviews.map(interview => (
              variant === 'upcoming' ? (
                <UpcomingCard
                  key={interview.id}
                  interview={interview}
                  userTimezone={userTimezone}
                  onViewKit={onViewKit}
                  onOpenCandidateProfile={onOpenCandidateProfile}
                />
              ) : (
                <PastCard
                  key={interview.id}
                  interview={interview}
                  userTimezone={userTimezone}
                  onSubmitFeedback={onSubmitFeedback}
                  onViewKit={onViewKit}
                  onOpenCandidateProfile={onOpenCandidateProfile}
                />
              )
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function InterviewList({
  interviews,
  variant,
  isLoading,
  userTimezone,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onSubmitFeedback,
  onViewKit,
  onOpenCandidateProfile,
}: {
  interviews: MyInterview[];
  variant: 'upcoming' | 'past';
  isLoading: boolean;
  userTimezone: string;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  onSubmitFeedback: (interview: MyInterview) => void;
  onViewKit: (interview: MyInterview) => void;
  onOpenCandidateProfile: (interview: MyInterview) => void;
}) {
  if (isLoading) return <LoadingSkeleton />;
  if (!interviews.length) return <EmptyState variant={variant} />;

  const groups = groupInterviewsByDay(
    interviews,
    userTimezone,
    variant === 'upcoming' ? 'asc' : 'desc',
    variant === 'upcoming' ? 'asc' : 'desc',
  );

  return (
    <div className="space-y-6">
      <DayGroupedList
        groups={groups}
        variant={variant}
        userTimezone={userTimezone}
        onSubmitFeedback={onSubmitFeedback}
        onViewKit={onViewKit}
        onOpenCandidateProfile={onOpenCandidateProfile}
      />
      {variant === 'past' && hasMore && onLoadMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="min-w-[140px]"
          >
            {isFetchingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MyInterviews() {
  usePageTitle('My Interviews');
  const userTimezone = useUserTimezone();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canAccess, isLoading: accessLoading } = useCanAccessMyInterviews();
  const {
    upcoming,
    past,
    pastTotalCount,
    isLoadingUpcoming,
    isLoadingPast,
    isFetchingNextPast,
    hasMorePast,
    fetchMorePast,
    refetch,
  } = useMyInterviews();

  const [feedbackInterview, setFeedbackInterview] = useState<MyInterview | null>(null);
  const [kitInterview, setKitInterview] = useState<MyInterview | null>(null);
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);
  const [detailInterviewId, setDetailInterviewId] = useState<string | null>(null);
  const [mobilePrepPane, setMobilePrepPane] = useState<MobilePrepPane>('kit');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSmDown = useIsSmDown();
  const kitOpen = !!kitInterview;
  const detailOpen = !!detailCandidate;
  const mobilePrepActive = isSmDown && kitOpen;
  const drawerBackdropOpen = kitOpen || detailOpen;

  const closeMobilePrep = () => {
    setKitInterview(null);
    setDetailCandidate(null);
    setDetailInterviewId(null);
    setMobilePrepPane('kit');
  };

  const openKitForInterview = (interview: MyInterview) => {
    setKitInterview(interview);
    setMobilePrepPane('kit');
  };

  const openCandidateDetailFromInterview = (interview: MyInterview) => {
    const stub = interviewToCandidate(interview);
    setDetailInterviewId(interview.id);
    setDetailCandidate(stub);

    if (isSmDown && kitOpen) {
      if (kitInterview?.id !== interview.id) {
        setKitInterview(interview);
      }
      setMobilePrepPane('candidate');
    } else if (!isSmDown && kitOpen && kitInterview?.id !== interview.id) {
      setKitInterview(interview);
    }

    void openCandidateDetailWithFetch(stub, setDetailCandidate);
  };

  const handleOpenCandidateFromKit = () => {
    if (!kitInterview) return;
    openCandidateDetailFromInterview(kitInterview);
  };

  const handleViewQuestionKitFromDrawer = async (interviewId: string) => {
    if (isSmDown && detailOpen) {
      if (kitInterview?.id === interviewId) {
        setMobilePrepPane('kit');
        return;
      }
      const found = [...upcoming, ...past].find(iv => iv.id === interviewId);
      if (found) {
        setKitInterview(found);
        setMobilePrepPane('kit');
        return;
      }
      const { data } = await fetchInterviewForKit(interviewId);
      if (data) {
        setKitInterview(data as MyInterview);
        setMobilePrepPane('kit');
      }
      return;
    }

    const found = [...upcoming, ...past].find(iv => iv.id === interviewId);
    if (found) {
      setKitInterview(found);
      return;
    }
    const data = await fetchInterviewForKit(interviewId);
    if (data) setKitInterview(data as MyInterview);
  };

  const handleMobilePrepPaneChange = (pane: MobilePrepPane) => {
    setMobilePrepPane(pane);
    if (pane === 'candidate' && kitInterview) {
      const stub = interviewToCandidate(kitInterview);
      setDetailInterviewId(kitInterview.id);
      setDetailCandidate(stub);
      void openCandidateDetailWithFetch(stub, setDetailCandidate);
    }
  };

  const mobilePrepSwitcher = mobilePrepActive ? (
    <MobilePrepSwitcher
      pane={mobilePrepPane}
      onPaneChange={handleMobilePrepPaneChange}
      onClose={closeMobilePrep}
    />
  ) : undefined;

  const kitDrawerOpen = kitOpen && (!mobilePrepActive || mobilePrepPane === 'kit');
  // Desktop: profile stacks beside kit. Mobile prep: one pane at a time. Mobile w/o kit: profile only.
  const candidateDrawerOpen = !isSmDown
    ? detailOpen
    : mobilePrepActive
      ? detailOpen && mobilePrepPane === 'candidate'
      : detailOpen;

  const kitAlreadyVisible = kitOpen && detailInterviewId != null && kitInterview?.id === detailInterviewId;

  const handleFeedbackSubmit = async (data: {
    verdict: InterviewVerdict;
    overall_score: number | null;
    rating_categories: RatingCategories | null;
    feedback: string;
    artifacts: unknown[];
    interview_mode?: InterviewMode;
    completed_at: string;
    rejection_reason?: string | null;
  }) => {
    if (!feedbackInterview || !user) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('candidate_interviews')
        .update({
          verdict: data.verdict,
          overall_score: data.overall_score,
          rating_categories: data.rating_categories,
          feedback: data.feedback,
          artifacts: data.artifacts,
          interview_mode: data.interview_mode,
          completed_at: data.completed_at,
          interviewer_user_id: user.id,
          ...(data.rejection_reason != null && { rejection_reason: data.rejection_reason }),
        })
        .eq('id', feedbackInterview.id);

      if (error) throw error;
      setFeedbackInterview(null);
      toast({ title: 'Feedback submitted' });
      notifyStaffEmail('verdict_submitted', feedbackInterview.id);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['pending-feedback-interviews'] }),
        queryClient.invalidateQueries({ queryKey: ['candidate-interviews'] }),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit feedback';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!accessLoading && !canAccess) {
    return <Navigate to="/" replace />;
  }

  const pendingPastCount = past.filter(iv => !iv.verdict).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header showSearch={false} />

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 flex-1 space-y-5 sm:space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">My Interviews</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit scorecard feedback after each interview — question kits are optional prep
            </p>
            {pendingPastCount > 0 && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                {pendingPastCount} interview{pendingPastCount > 1 ? 's' : ''} awaiting your feedback
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link to="/calendar">
              <CalendarDays className="h-4 w-4 mr-2" />
              Calendar
            </Link>
          </Button>
        </div>

        {accessLoading ? (
          <LoadingSkeleton />
        ) : (
          <Tabs defaultValue={pendingPastCount > 0 ? 'past' : 'upcoming'} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="upcoming" className="gap-2">
                Upcoming
                {!isLoadingUpcoming && upcoming.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{upcoming.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="past" className="gap-2">
                Past
                {!isLoadingPast && pastTotalCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{pastTotalCount}</Badge>
                )}
                {pendingPastCount > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{pendingPastCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-5">
              <InterviewList
                interviews={upcoming}
                variant="upcoming"
                isLoading={isLoadingUpcoming}
                userTimezone={userTimezone}
                onSubmitFeedback={setFeedbackInterview}
                onViewKit={openKitForInterview}
                onOpenCandidateProfile={openCandidateDetailFromInterview}
              />
            </TabsContent>

            <TabsContent value="past" className="mt-5">
              <InterviewList
                interviews={past}
                variant="past"
                isLoading={isLoadingPast}
                userTimezone={userTimezone}
                hasMore={hasMorePast}
                isFetchingMore={isFetchingNextPast}
                onLoadMore={() => fetchMorePast()}
                onSubmitFeedback={setFeedbackInterview}
                onViewKit={openKitForInterview}
                onOpenCandidateProfile={openCandidateDetailFromInterview}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <Footer />

      <InterviewFeedbackDialog
        open={!!feedbackInterview}
        onOpenChange={(open) => !open && setFeedbackInterview(null)}
        interview={feedbackInterview}
        onSubmit={handleFeedbackSubmit}
        isSubmitting={isSubmitting}
      />

      <InterviewKitDrawer
        interview={kitInterview}
        open={kitDrawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (mobilePrepActive) closeMobilePrep();
            else setKitInterview(null);
          }
        }}
        onOpenCandidate={handleOpenCandidateFromKit}
        hideOverlay={drawerBackdropOpen}
        mobilePrepSwitcher={mobilePrepSwitcher}
        hideCloseButton={mobilePrepActive}
      />

      <CandidateDetailDrawer
        candidate={detailCandidate}
        contextInterviewId={detailInterviewId}
        open={candidateDrawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (mobilePrepActive) {
              setMobilePrepPane('kit');
              return;
            }
            setDetailCandidate(null);
            setDetailInterviewId(null);
          }
        }}
        hideOverlay={drawerBackdropOpen}
        onViewQuestionKit={handleViewQuestionKitFromDrawer}
        kitVisibleInterviewId={kitAlreadyVisible ? kitInterview?.id ?? null : null}
        sheetClassName={cn(
          'sm:max-w-xl',
          kitOpen && detailOpen && 'z-[52] sm:right-[28rem]',
        )}
        notesStackOffset={kitOpen ? 'right-[64rem]' : 'right-[36rem]'}
        mobilePrepSwitcher={mobilePrepSwitcher}
        hideCloseButton={mobilePrepActive}
      />

      {/* Backdrop is below drawers (z-50+). With kit open, use the kit header name link for profile — card links are covered. */}
      {drawerBackdropOpen && (
        <button
          type="button"
          aria-label="Close drawer"
          className="fixed inset-0 z-[39] bg-black/80 animate-in fade-in-0"
          onClick={() => {
            if (mobilePrepActive) closeMobilePrep();
            else {
              setKitInterview(null);
              setDetailCandidate(null);
              setDetailInterviewId(null);
            }
          }}
        />
      )}
    </div>
  );
}
