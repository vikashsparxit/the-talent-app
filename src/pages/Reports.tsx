import { useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useJobs } from '@/hooks/useJobs';
import { useRecruitmentTracker, TrackerStage } from '@/hooks/useRecruitmentTracker';
import { useRecruiterPerformance, useRecruiterPerformanceDetail, RecruiterStat } from '@/hooks/useRecruiterPerformance';
import { useVendors } from '@/hooks/useVendors';
import { useVendorPerformance, useVendorPerformanceDetail, type VendorStat } from '@/hooks/useVendorPerformance';
import { useReportsJobStats } from '@/hooks/useReportsJobStats';
import { useAuth } from '@/hooks/useAuth';
import { TimeVelocitySection } from '@/components/reports/TimeVelocitySection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FileSpreadsheet, Loader2, Users, CheckCircle2, XCircle, PauseCircle,
  Clock, ChevronRight, TrendingUp, Sparkles, RefreshCw, Zap, Heart, Info, AlertTriangle,
  BarChart3, Trophy, Briefcase, UserRound, Building2, Gauge,
} from 'lucide-react';
import { differenceInDays, parseISO, subDays, format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePipelineAnalysis, useAnalysePipeline } from '@/hooks/usePipelineAnalysis';
import { cn } from '@/lib/utils';

const verdictColors: Record<string, string> = {
  proceeded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  hold:      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  no_show:   'bg-muted text-muted-foreground',
};

const modeLabels: Record<string, string> = {
  in_person: 'In-Person',
  video:     'Video',
  phone:     'Phone',
};

// ── Tooltip-wrapped truncated cell ───────────────────────────────────────────

function TruncCell({
  text,
  maxW = 200,
  className,
}: {
  text: string | null | undefined;
  maxW?: number;
  className?: string;
}) {
  if (!text) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span
          className={cn('block truncate cursor-default', className)}
          style={{ maxWidth: maxW }}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-xs text-xs leading-relaxed whitespace-pre-wrap break-words"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Reports() {
  usePageTitle('Reports — Recruitment Tracker');
  const { toast } = useToast();
  const { isAdminOrHR } = useAuth();
  const { jobs, isLoading: jobsLoading } = useJobs({ reportList: true });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { stages, rows, isLoading: trackerLoading } = useRecruitmentTracker(selectedJobId);
  const { data: scoreResult } = usePipelineAnalysis(selectedJobId);
  const analysePipeline = useAnalysePipeline();

  // View toggle: job report vs recruiter leaderboard vs vendor leaderboard vs time & velocity
  const [view, setView] = useState<'job' | 'recruiter' | 'vendor' | 'velocity'>('job');

  // Recruiter leaderboard state
  const [dateRange, setDateRange] = useState('7');
  const [selectedRecruiter, setSelectedRecruiter] = useState<RecruiterStat | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorStat | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const rangeStart = format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd');
  const { data: recruiterStats = [], isLoading: recruiterLoading } = useRecruiterPerformance(
    rangeStart,
    today,
    { enabled: view === 'recruiter' },
  );
  const { data: recruiterDetail, isLoading: recruiterDetailLoading } = useRecruiterPerformanceDetail(
    selectedRecruiter?.recruiter_id,
    rangeStart,
    today,
  );

  const { data: allVendors = [] } = useVendors(false, { enabled: view === 'vendor' });
  const { data: vendorStats = [], isLoading: vendorLoading } = useVendorPerformance(
    allVendors,
    rangeStart,
    today,
    { enabled: view === 'vendor' },
  );
  const { data: vendorDetailCandidates = [], isLoading: vendorDetailLoading } = useVendorPerformanceDetail(
    selectedVendor?.vendor.source_key,
    rangeStart,
    today,
  );

  const { data: jobIvStats = {}, isError: jobStatsError, refetch: refetchJobStats } = useReportsJobStats(
    view === 'job' && !selectedJobId,
  );

  const activeJobs = (jobs || []).filter(j => j.status !== 'closed');

  const staticColumns = [
    { key: 'sno',           label: 'S.No',             width: 'w-12' },
    { key: 'recruiter',     label: 'Recruiter',         width: 'w-32' },
    { key: 'source',        label: 'Source',            width: 'w-24' },
    { key: 'position',      label: 'Position Name',     width: 'w-44' },
    { key: 'name',          label: 'Candidate Name',    width: 'w-40' },
    { key: 'phone',         label: 'Contact Number',    width: 'w-36' },
    { key: 'email',         label: 'Email',             width: 'w-48' },
    { key: 'total_exp',     label: 'Total Exp.',        width: 'w-24' },
    { key: 'relevant_exp',  label: 'Relevant Exp.',     width: 'w-28' },
    { key: 'current_ctc',   label: 'Current CTC',       width: 'w-28' },
    { key: 'expected_ctc',  label: 'Expected Salary',   width: 'w-32' },
    { key: 'notice_period', label: 'Notice Period',     width: 'w-28' },
    { key: 'status',        label: 'Interview Status',  width: 'w-32' },
  ];

  const stageSubColumns = ['Status', 'Interviewer', 'Feedback', 'Date', 'Time', 'Mode'];

  const trailingColumns = [
    { key: 'final_feedback', label: 'Final Feedback', width: 'w-40' },
    { key: 'remarks',        label: 'Remarks',        width: 'w-40' },
    { key: 'comms_rating',   label: 'Comms Rating',   width: 'w-28' },
  ];

  const getOverallStatus = (interviews: Record<string, any>, stagesList: TrackerStage[]) => {
    const sorted = [...stagesList].sort((a, b) => b.order_index - a.order_index);
    for (const s of sorted) {
      const iv = interviews[s.stage_id];
      if (iv?.verdict) return iv.verdict;
    }
    return null;
  };

  const getFinalFeedback = (interviews: Record<string, any>, stagesList: TrackerStage[]) => {
    const sorted = [...stagesList].sort((a, b) => b.order_index - a.order_index);
    for (const s of sorted) {
      const iv = interviews[s.stage_id];
      if (iv?.feedback) return iv.feedback as string;
    }
    return null;
  };

  // ── Metrics computation for the scorer ─────────────────────────────────────

  const computePipelineMetrics = () => {
    const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index);
    const today = new Date();

    // Verdict counts (overall = last stage with a verdict)
    let proceeded = 0, rejected = 0, hold = 0, no_show = 0, pendingFeedback = 0;
    rows.forEach(row => {
      const status = getOverallStatus(row.interviews, stages);
      if (status === 'proceeded') proceeded++;
      else if (status === 'rejected') rejected++;
      else if (status === 'hold') hold++;
      else if (status === 'no_show') no_show++;
      const hasPending = stages.some(s => {
        const iv = row.interviews[s.stage_id];
        return iv?.scheduled_date && !iv.verdict;
      });
      if (hasPending) pendingFeedback++;
    });

    // Conversion rate: % reaching the last stage
    const conversionRate = sortedStages.length > 1 && rows.length > 0
      ? Math.round((rows.filter(r => r.interviews[sortedStages[sortedStages.length - 1].stage_id]).length / rows.length) * 100)
      : null;

    // Feedback coverage
    const scheduledRows = rows.filter(row => stages.some(s => row.interviews[s.stage_id]?.scheduled_date));
    const withFeedback = rows.filter(row => stages.some(s => {
      const iv = row.interviews[s.stage_id];
      return iv?.feedback && iv.feedback.trim().length > 0;
    })).length;
    const feedbackCoveragePct = scheduledRows.length > 0
      ? Math.round((withFeedback / scheduledRows.length) * 100)
      : 0;

    // Avg days between stages (using raw ISO timestamps)
    const deltas: number[] = [];
    rows.forEach(row => {
      const isoTimes = sortedStages
        .map(s => row.interviews[s.stage_id]?.scheduled_at_iso)
        .filter(Boolean)
        .map(iso => new Date(iso!).getTime());
      for (let i = 1; i < isoTimes.length; i++) {
        const d = Math.round((isoTimes[i] - isoTimes[i - 1]) / 86_400_000);
        if (d >= 0) deltas.push(d);
      }
    });
    const avgDaysBetweenStages = deltas.length > 0
      ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
      : null;

    // Days since last activity
    const allTimes: number[] = [];
    rows.forEach(row => stages.forEach(s => {
      const iso = row.interviews[s.stage_id]?.scheduled_at_iso;
      if (iso) allTimes.push(new Date(iso).getTime());
    }));
    const daysSinceLastActivity = allTimes.length > 0
      ? differenceInDays(today, new Date(Math.max(...allTimes)))
      : null;

    // Days to deadline
    const selectedJob = (jobs || []).find(j => j.id === selectedJobId);
    const daysToDeadline = selectedJob?.application_deadline
      ? differenceInDays(parseISO(selectedJob.application_deadline), today)
      : null;

    const stageFunnel = sortedStages.map(stage => {
      const inStage = rows.filter(r => r.interviews[stage.stage_id]);
      const vds = inStage.map(r => r.interviews[stage.stage_id]?.verdict);
      return {
        name: stage.stage_name,
        count: inStage.length,
        proceeded: vds.filter(v => v === 'proceeded').length,
        rejected:  vds.filter(v => v === 'rejected').length,
        hold:      vds.filter(v => v === 'hold').length,
        pending:   inStage.filter(r => !r.interviews[stage.stage_id]?.verdict).length,
      };
    });

    return {
      total_candidates: rows.length,
      proceeded, rejected, hold, no_show, pending_feedback: pendingFeedback,
      conversion_rate: conversionRate,
      feedback_coverage_pct: feedbackCoveragePct,
      avg_days_between_stages: avgDaysBetweenStages,
      days_since_last_activity: daysSinceLastActivity,
      days_to_deadline: daysToDeadline,
      stage_funnel: stageFunnel,
    };
  };

  const handleAnalysePipeline = async () => {
    const selectedJob = (jobs || []).find(j => j.id === selectedJobId);
    if (!selectedJob || rows.length === 0 || analysePipeline.isPending) return;
    try {
      const metrics = computePipelineMetrics();
      await analysePipeline.mutateAsync({
        job: {
          id: selectedJob.id,
          title: selectedJob.title,
          total_openings: (selectedJob as { total_openings?: number | null }).total_openings ?? null,
          application_deadline: selectedJob.application_deadline ?? null,
          status: selectedJob.status,
        },
        metrics,
      });
    } catch (err) {
      toast({
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const scoring = analysePipeline.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header showSearch={false} />
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-6 h-6 text-primary shrink-0" />
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Recruitment Tracker</h1>
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden sm:ml-2 w-fit">
              <button
                onClick={() => setView('job')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  view === 'job' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                By Job
              </button>
              <button
                onClick={() => setView('recruiter')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  view === 'recruiter' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Trophy className="h-3.5 w-3.5" />
                By Recruiter
              </button>
              <button
                onClick={() => setView('vendor')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  view === 'vendor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                By Vendor
              </button>
              {isAdminOrHR && (
                <button
                  onClick={() => setView('velocity')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                    view === 'velocity' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <Gauge className="h-3.5 w-3.5" />
                  Time & Velocity
                </button>
              )}
            </div>
          </div>

          {/* Right controls — selected job title or date range picker */}
          {view === 'job' ? (
            selectedJobId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Viewing:</span>
                <span className="font-medium text-foreground truncate max-w-[280px]">
                  {(jobs || []).find(j => j.id === selectedJobId)?.title ?? ''}
                </span>
              </div>
            )
          ) : view === 'velocity' ? null : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Period:</span>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── Time & Velocity view (admin/HR only) ───────────────────────────── */}
        {view === 'velocity' && isAdminOrHR && (
          <TimeVelocitySection />
        )}

        {/* ── Recruiter leaderboard view ───────────────────────────────────── */}
        {view === 'recruiter' && (
          <>
            {recruiterLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : recruiterStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <UserRound className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">No candidates sourced in this period</p>
                <p className="text-sm">Try extending the date range</p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-10">#</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Recruiter</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Sourced</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[160px]">Pipeline</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Proceeded</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Hired</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recruiterStats.map(r => {
                      const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : null;
                      return (
                        <tr
                          key={r.recruiter_id}
                          className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer group"
                          onClick={() => setSelectedRecruiter(r)}
                        >
                          <td className="px-3 py-3 text-center">
                            {medal
                              ? <span className="text-lg leading-none">{medal}</span>
                              : <span className="text-sm text-muted-foreground font-mono">{r.rank}</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                                r.rank === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                r.rank === 2 ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' :
                                r.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                                'bg-primary/10 text-primary',
                              )}>
                                {r.initials}
                              </div>
                              <div>
                                <p className="font-medium text-foreground group-hover:text-primary transition-colors">{r.recruiter_name}</p>
                                <p className="text-xs text-muted-foreground">{r.job_count} job{r.job_count !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold">{r.sourced}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium w-6 text-right shrink-0">{r.in_pipeline}</span>
                              <div className="flex-1 min-w-[80px]">
                                <Progress value={r.conversion_pct} className="h-1.5" />
                              </div>
                              <span className="text-xs text-muted-foreground w-9 shrink-0">{r.conversion_pct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {r.proceeded > 0
                              ? <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{r.proceeded}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {r.hired > 0
                              ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 font-semibold">{r.hired}</Badge>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {r.pending > 0
                              ? <span className="text-orange-600 font-medium">{r.pending}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Recruiter drill-down drawer ── */}
            <Sheet open={!!selectedRecruiter} onOpenChange={open => { if (!open) setSelectedRecruiter(null); }}>
              <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                {selectedRecruiter && (
                  <>
                    <SheetHeader className="mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">
                          {selectedRecruiter.initials}
                        </div>
                        <div>
                          <SheetTitle>{selectedRecruiter.recruiter_name}</SheetTitle>
                          <p className="text-sm text-muted-foreground">Last {dateRange} days · {selectedRecruiter.sourced} candidates sourced</p>
                        </div>
                      </div>
                    </SheetHeader>

                    {/* Summary chips */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 border border-border text-sm">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="font-semibold">{selectedRecruiter.sourced}</span>
                        <span className="text-muted-foreground text-xs">Sourced</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/8 border border-blue-200 dark:border-blue-800 text-sm">
                        <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                        <span className="font-semibold text-blue-700 dark:text-blue-400">{selectedRecruiter.in_pipeline}</span>
                        <span className="text-muted-foreground text-xs">In Pipeline</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/8 border border-emerald-200 dark:border-emerald-800 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{selectedRecruiter.proceeded}</span>
                        <span className="text-muted-foreground text-xs">Proceeded</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/8 border border-emerald-200 dark:border-emerald-800 text-sm">
                        <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{selectedRecruiter.hired}</span>
                        <span className="text-muted-foreground text-xs">Hired</span>
                      </div>
                      {selectedRecruiter.pending > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/8 border border-orange-200 dark:border-orange-800 text-sm">
                          <Clock className="h-3.5 w-3.5 text-orange-500" />
                          <span className="font-semibold text-orange-600 dark:text-orange-400">{selectedRecruiter.pending}</span>
                          <span className="text-muted-foreground text-xs">Pending</span>
                        </div>
                      )}
                    </div>

                    {recruiterDetailLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : (
                    <>
                    {/* Jobs breakdown */}
                    {(recruiterDetail?.jobs.length ?? 0) > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <Briefcase className="h-4 w-4 text-muted-foreground" /> Jobs Breakdown
                        </h3>
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-muted border-b border-border">
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Job</th>
                                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Sourced</th>
                                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Pipeline</th>
                                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Hired</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(recruiterDetail?.jobs ?? []).map(j => (
                                <tr key={j.job_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                                  <td className="px-3 py-2 font-medium">{j.title}</td>
                                  <td className="px-3 py-2 text-center">{j.sourced}</td>
                                  <td className="px-3 py-2 text-center text-blue-600 dark:text-blue-400">{j.in_pipeline}</td>
                                  <td className="px-3 py-2 text-center">
                                    {j.hired > 0
                                      ? <span className="text-emerald-600 font-semibold">{j.hired}</span>
                                      : <span className="text-muted-foreground">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Source breakdown */}
                    {(recruiterDetail?.sources.length ?? 0) > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" /> Source Breakdown
                        </h3>
                        <div className="space-y-2">
                          {(recruiterDetail?.sources ?? []).map(s => {
                            const convPct = s.count > 0 ? Math.round((s.in_pipeline / s.count) * 100) : 0;
                            return (
                              <div key={s.source} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground capitalize w-24 shrink-0">{s.source || 'manual'}</span>
                                <div className="flex-1">
                                  <Progress value={convPct} className="h-1.5" />
                                </div>
                                <span className="text-xs font-medium w-16 text-right shrink-0">{s.in_pipeline}/{s.count} ({convPct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">Bar shows pipeline conversion per source</p>
                      </div>
                    )}

                    {/* Candidate list */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-muted-foreground" /> Candidates ({recruiterDetail?.candidates.length ?? 0})
                      </h3>
                      <div className="border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted border-b border-border">
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Job</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Highest Stage</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(recruiterDetail?.candidates ?? []).map(c => (
                              <tr
                                key={c.id}
                                className={cn(
                                  'border-b border-border last:border-0',
                                  c.is_hired && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                                  !c.is_hired && c.overall_verdict === 'rejected' && 'bg-red-50/40 dark:bg-red-950/10',
                                )}
                              >
                                <td className="px-3 py-2 font-medium">{c.name}</td>
                                <td className="px-3 py-2 text-muted-foreground">{c.job_title}</td>
                                <td className="px-3 py-2 capitalize text-muted-foreground">{c.source || 'manual'}</td>
                                <td className="px-3 py-2 text-muted-foreground">{c.highest_stage || '—'}</td>
                                <td className="px-3 py-2">
                                  {c.is_hired
                                    ? <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Hired</span>
                                    : c.overall_verdict
                                      ? <span className={cn('capitalize',
                                          c.overall_verdict === 'proceeded' && 'text-emerald-600',
                                          c.overall_verdict === 'rejected' && 'text-red-500',
                                          c.overall_verdict === 'hold' && 'text-amber-600',
                                          c.overall_verdict === 'no_show' && 'text-muted-foreground',
                                        )}>{c.overall_verdict.replace('_', ' ')}</span>
                                      : <span className="text-muted-foreground">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </>
                    )}
                  </>
                )}
              </SheetContent>
            </Sheet>
          </>
        )}

        {/* ── Vendor leaderboard view ─────────────────────────────────────────── */}
        {view === 'vendor' && (
          <>
            {allVendors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <Building2 className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">No vendors registered</p>
                <p className="text-sm">Add vendors in Settings → Vendors, then tag imports with a vendor during bulk upload.</p>
              </div>
            ) : vendorLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-10">#</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Vendor</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Submitted</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[160px]">Pipeline</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Final Round</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Hired</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Fee %</th>
                      <th className="px-3 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {vendorStats.map(vs => (
                      <tr
                        key={vs.vendor.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedVendor(vs)}
                      >
                        <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{vs.rank}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                              {vs.vendor.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{vs.vendor.name}</p>
                              {vs.vendor.contact_name && <p className="text-xs text-muted-foreground">{vs.vendor.contact_name}</p>}
                            </div>
                            {!vs.vendor.is_active && (
                              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">inactive</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center font-bold">{vs.submitted}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${vs.conversion_pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">{vs.in_pipeline} ({vs.conversion_pct}%)</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {vs.shortlisted > 0
                            ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{vs.shortlisted}</span>
                            : <span className="text-muted-foreground">0</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center">
                          {vs.hired > 0
                            ? <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">✓ {vs.hired}</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center text-muted-foreground text-xs">
                          {vs.vendor.fee_pct != null ? `${vs.vendor.fee_pct}%` : '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Vendor detail sheet */}
            <Sheet open={!!selectedVendor} onOpenChange={o => { if (!o) setSelectedVendor(null); }}>
              <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                {selectedVendor && (
                  <>
                    <SheetHeader className="mb-4">
                      <SheetTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        {selectedVendor.vendor.name}
                      </SheetTitle>
                      {selectedVendor.vendor.contact_email && (
                        <p className="text-sm text-muted-foreground">{selectedVendor.vendor.contact_name} · {selectedVendor.vendor.contact_email}</p>
                      )}
                    </SheetHeader>

                    {/* Stats strip */}
                    <div className="grid grid-cols-4 gap-3 mb-6">
                      {[
                        { label: 'Submitted', value: selectedVendor.submitted, color: 'text-foreground' },
                        { label: 'In Pipeline', value: `${selectedVendor.in_pipeline} (${selectedVendor.conversion_pct}%)`, color: 'text-primary' },
                        { label: 'Final Round', value: selectedVendor.shortlisted, color: 'text-emerald-600' },
                        { label: 'Hired', value: selectedVendor.hired, color: selectedVendor.hired > 0 ? 'text-emerald-600 font-bold' : 'text-muted-foreground' },
                      ].map(s => (
                        <div key={s.label} className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {vendorDetailLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : vendorDetailCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No candidates from this vendor in the selected period.</p>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted border-b">
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Candidate</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Job</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                              <th className="px-3 py-2 text-center font-medium text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vendorDetailCandidates.map(c => (
                              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="px-3 py-2.5 font-medium">{c.name}</td>
                                <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate">{c.job_title}</td>
                                <td className="px-3 py-2.5 text-muted-foreground">{c.highest_stage ?? '—'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {c.is_hired ? (
                                    <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">Hired</span>
                                  ) : c.overall_verdict ? (
                                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', verdictColors[c.overall_verdict] ?? 'bg-muted text-muted-foreground')}>
                                      {c.overall_verdict}
                                    </span>
                                  ) : c.is_in_pipeline ? (
                                    <span className="text-[10px] text-primary font-medium">In pipeline</span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </SheetContent>
            </Sheet>
          </>
        )}

        {view === 'job' && !selectedJobId ? (
          <>
          {jobStatsError && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm mb-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Could not load pipeline stats. Job list is shown without In Pipeline / Proceeded / Pending counts.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchJobStats()}>Retry</Button>
            </div>
          )}
          {jobsLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (jobs || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <FileSpreadsheet className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">No jobs found</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[720px]">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Job</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-24">Status</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Candidates</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">In Pipeline</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Proceeded</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Pending</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(jobs || [])]
                    .sort((a, b) => {
                      const order: Record<string, number> = { open: 0, paused: 1, draft: 2, closed: 3 };
                      const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4);
                      if (diff !== 0) return diff;
                      return ((b as any).candidate_count ?? 0) - ((a as any).candidate_count ?? 0);
                    })
                    .map(job => {
                      const stats = jobIvStats[job.id] ?? { inPipeline: 0, proceeded: 0, pending: 0 };
                      const totalCandidates = (job as any).candidate_count ?? 0;
                      const deadlineDays = job.application_deadline && job.status === 'open'
                        ? differenceInDays(parseISO(job.application_deadline), new Date())
                        : null;
                      const isDeadlineExpired = job.status === 'open' && deadlineDays !== null && deadlineDays < 0;
                      const isDeadlineSoon = job.status === 'open' && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 20;
                      const statusCls: Record<string, string> = {
                        open:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
                        paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                        draft:  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                        closed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
                      };
                      return (
                        <tr
                          key={job.id}
                          className={cn(
                            'border-b border-border transition-colors cursor-pointer group',
                            isDeadlineExpired
                              ? 'bg-red-50/90 hover:bg-red-100/80 dark:bg-red-950/25 dark:hover:bg-red-950/40'
                              : isDeadlineSoon
                                ? 'bg-amber-50/80 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/35'
                                : 'hover:bg-muted/30',
                          )}
                          onClick={() => setSelectedJobId(job.id)}
                        >
                          <td className="px-3 py-3">
                            <div>
                              <p className="font-medium group-hover:text-primary transition-colors">{job.title}</p>
                              {(job.department || (job as any).domain) && (
                                <p className="text-xs text-muted-foreground">{job.department || (job as any).domain}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium border capitalize', statusCls[job.status] ?? '')}>
                              {job.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold">{totalCandidates}</td>
                          <td className="px-3 py-3 text-center">
                            {stats.inPipeline > 0
                              ? <span className="text-blue-600 dark:text-blue-400 font-medium">{stats.inPipeline}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {stats.proceeded > 0
                              ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.proceeded}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {stats.pending > 0
                              ? <span className="text-orange-600 font-medium">{stats.pending}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {job.application_deadline ? (
                              <span className={cn(
                                job.status !== 'open' ? 'text-muted-foreground' :
                                deadlineDays === null ? 'text-muted-foreground' :
                                deadlineDays < 0 ? 'text-red-600 font-semibold' :
                                deadlineDays <= 7 ? 'text-orange-600 font-medium' :
                                deadlineDays <= 20 ? 'text-yellow-600' : 'text-muted-foreground'
                              )}>
                                {format(parseISO(job.application_deadline), 'dd MMM yyyy')}
                                {job.status === 'open' && deadlineDays !== null && deadlineDays < 0 && (
                                  <span className="ml-1 text-xs font-normal">Expired</span>
                                )}
                                {job.status === 'open' && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 20 && (
                                  <span className="ml-1 text-xs font-normal">≤{deadlineDays}d</span>
                                )}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          </>
        ) : view === 'job' && trackerLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : view === 'job' && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-lg font-medium">No candidates found for this position</p>
          </div>
        ) : view === 'job' ? (
          <>
            {/* Back to job listing */}
            <button
              onClick={() => setSelectedJobId(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              All jobs
            </button>

            {/* ── Pipeline Summary ── */}
            {(() => {
              // Overall verdict counts
              let proceeded = 0, rejected = 0, hold = 0, noShow = 0, pendingFeedback = 0;
              rows.forEach(row => {
                const status = getOverallStatus(row.interviews, stages);
                if (status === 'proceeded') proceeded++;
                else if (status === 'rejected') rejected++;
                else if (status === 'hold') hold++;
                else if (status === 'no_show') noShow++;
                const hasPending = stages.some(s => {
                  const iv = row.interviews[s.stage_id];
                  return iv?.scheduled_date && !iv.verdict;
                });
                if (hasPending) pendingFeedback++;
              });

              // Per-stage funnel (sorted by order)
              const funnel = [...stages]
                .sort((a, b) => a.order_index - b.order_index)
                .map(stage => {
                  const inStage = rows.filter(r => r.interviews[stage.stage_id]);
                  const vds = inStage.map(r => r.interviews[stage.stage_id]?.verdict);
                  return {
                    ...stage,
                    count: inStage.length,
                    proceeded: vds.filter(v => v === 'proceeded').length,
                    rejected:  vds.filter(v => v === 'rejected').length,
                    hold:      vds.filter(v => v === 'hold').length,
                    pending:   inStage.filter(r => !r.interviews[stage.stage_id]?.verdict).length,
                  };
                });

              const conversionRate = funnel.length > 1 && rows.length > 0
                ? Math.round((funnel[funnel.length - 1].count / rows.length) * 100)
                : null;

              return (
                <div className="mb-5 space-y-4">
                  {/* Stat chips */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/60 border border-border">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-xl font-bold leading-none">{rows.length}</span>
                      <span className="text-xs text-muted-foreground leading-none">Total</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/8 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-xl font-bold leading-none text-emerald-700 dark:text-emerald-400">{proceeded}</span>
                      <span className="text-xs text-muted-foreground leading-none">Proceeded</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/8 border border-red-200 dark:border-red-800">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-xl font-bold leading-none text-red-600 dark:text-red-400">{rejected}</span>
                      <span className="text-xs text-muted-foreground leading-none">Rejected</span>
                    </div>
                    {hold > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/8 border border-amber-200 dark:border-amber-800">
                        <PauseCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-xl font-bold leading-none text-amber-700 dark:text-amber-400">{hold}</span>
                        <span className="text-xs text-muted-foreground leading-none">On Hold</span>
                      </div>
                    )}
                    {pendingFeedback > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500/8 border border-orange-200 dark:border-orange-800">
                        <Clock className="h-4 w-4 text-orange-500" />
                        <span className="text-xl font-bold leading-none text-orange-600 dark:text-orange-400">{pendingFeedback}</span>
                        <span className="text-xs text-muted-foreground leading-none">Pending Feedback</span>
                      </div>
                    )}
                    {conversionRate !== null && conversionRate > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-500/8 border border-violet-200 dark:border-violet-800">
                        <TrendingUp className="h-4 w-4 text-violet-600" />
                        <span className="text-xl font-bold leading-none text-violet-700 dark:text-violet-400">{conversionRate}%</span>
                        <span className="text-xs text-muted-foreground leading-none">Conversion</span>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAnalysePipeline}
                      disabled={scoring}
                      className="ml-auto gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                    >
                      {scoring
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Sparkles className="h-3.5 w-3.5" />}
                      {scoring ? 'Analysing…' : 'Analyse Pipeline'}
                    </Button>
                  </div>

                  {/* ── Score card ── */}
                  {scoreResult && (
                    <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start gap-5 flex-wrap">
                        {/* Grade badge */}
                        <div className={cn(
                          'flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 shrink-0',
                          scoreResult.grade === 'A' && 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700',
                          scoreResult.grade === 'B' && 'bg-primary/10 border-primary/40',
                          scoreResult.grade === 'C' && 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700',
                          scoreResult.grade === 'D' && 'bg-orange-50 border-orange-300 dark:bg-orange-900/20 dark:border-orange-700',
                          scoreResult.grade === 'F' && 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700',
                        )}>
                          <span className={cn(
                            'text-4xl font-black leading-none',
                            scoreResult.grade === 'A' && 'text-emerald-700 dark:text-emerald-400',
                            scoreResult.grade === 'B' && 'text-primary',
                            scoreResult.grade === 'C' && 'text-amber-700 dark:text-amber-400',
                            scoreResult.grade === 'D' && 'text-orange-700 dark:text-orange-400',
                            scoreResult.grade === 'F' && 'text-red-700 dark:text-red-400',
                          )}>{scoreResult.grade}</span>
                          <span className="text-[10px] font-semibold text-muted-foreground mt-0.5 tracking-wide">{scoreResult.grade_label}</span>
                        </div>

                        {/* Sub-scores */}
                        <div className="flex flex-col gap-2.5 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="text-xs text-muted-foreground w-14 shrink-0">Speed</span>
                            <Progress value={scoreResult.speed_score} className="h-1.5 flex-1" />
                            <span className="text-xs font-semibold w-8 text-right">{scoreResult.speed_score}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Heart className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                            <span className="text-xs text-muted-foreground w-14 shrink-0">Health</span>
                            <Progress value={scoreResult.health_score} className="h-1.5 flex-1" />
                            <span className="text-xs font-semibold w-8 text-right">{scoreResult.health_score}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground pl-5.5">
                            Overall: <span className="font-bold text-foreground">{scoreResult.overall_score}/100</span>
                          </p>
                        </div>

                        {/* Insights + Risks + Recommendation */}
                        <div className="flex-1 space-y-2 min-w-[240px]">
                          <div className="flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <ul className="space-y-0.5">
                              {scoreResult.insights.map((ins, i) => (
                                <li key={i} className="text-xs text-foreground leading-snug">{ins}</li>
                              ))}
                            </ul>
                          </div>
                          {scoreResult.risks.length > 0 && (
                            <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/8 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                              <ul className="space-y-0.5">
                                {scoreResult.risks.map((risk, i) => (
                                  <li key={i} className="text-xs text-amber-800 dark:text-amber-300 leading-snug">{risk}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="rounded-lg bg-primary/5 border border-primary/20 px-2.5 py-1.5">
                            <p className="text-xs font-medium text-primary leading-snug">
                              Recommendation: {scoreResult.recommendation}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-border flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          Last generated {formatDistanceToNow(parseISO(scoreResult.generated_at), { addSuffix: true })}
                        </span>
                        <button
                          onClick={handleAnalysePipeline}
                          disabled={scoring}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary ml-2 disabled:opacity-50"
                        >
                          <RefreshCw className={cn('h-3 w-3', scoring && 'animate-spin')} />
                          Regenerate
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stage funnel */}
                  <div className="flex items-start gap-1.5 flex-wrap">
                    {funnel.map((s, i) => (
                      <div key={s.stage_id} className="flex items-start gap-1.5">
                        <div className="flex flex-col items-center gap-1">
                          <div className={cn(
                            'px-3 py-1.5 rounded-lg border text-center min-w-[80px]',
                            i === 0
                              ? 'bg-primary/10 border-primary/30'
                              : i === funnel.length - 1
                                ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-700'
                                : 'bg-muted/60 border-border',
                          )}>
                            <p className={cn(
                              'text-lg font-bold leading-none',
                              i === funnel.length - 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
                            )}>
                              {s.count}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[100px] truncate">{s.stage_name}</p>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-medium h-4">
                            {s.proceeded > 0 && <span className="text-emerald-600">↑{s.proceeded}</span>}
                            {s.rejected > 0  && <span className="text-red-500">✕{s.rejected}</span>}
                            {s.hold > 0      && <span className="text-amber-600">‖{s.hold}</span>}
                            {s.pending > 0   && <span className="text-orange-500">…{s.pending}</span>}
                          </div>
                        </div>
                        {i < funnel.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <TooltipProvider>
                  <table className="min-w-max border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th colSpan={staticColumns.length} className="border-r border-border" />
                        {stages.map((stage) => (
                          <th
                            key={stage.stage_id}
                            colSpan={stageSubColumns.length}
                            className="px-2 py-2 text-center font-semibold text-primary border-r border-border bg-primary/5"
                          >
                            {stage.stage_name}
                          </th>
                        ))}
                        <th colSpan={trailingColumns.length} />
                      </tr>
                      <tr className="bg-muted border-b border-border">
                        {staticColumns.map(col => (
                          <th
                            key={col.key}
                            className={cn('px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border', col.width)}
                          >
                            {col.label}
                          </th>
                        ))}
                        {stages.map((stage) =>
                          stageSubColumns.map((sub) => (
                            <th
                              key={`${stage.stage_id}-${sub}`}
                              className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border/50 min-w-[100px]"
                            >
                              {sub}
                            </th>
                          ))
                        )}
                        {trailingColumns.map(col => (
                          <th
                            key={col.key}
                            className={cn('px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border', col.width)}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => {
                        const overallStatus = getOverallStatus(row.interviews, stages);
                        const finalFeedback = getFinalFeedback(row.interviews, stages);
                        return (
                          <tr key={row.candidate_id} className={cn(
                            'border-b border-border transition-colors',
                            overallStatus === 'rejected'  && 'bg-red-50/60 dark:bg-red-950/20 hover:bg-red-100/50 dark:hover:bg-red-950/30',
                            overallStatus === 'hold'      && 'bg-yellow-50/60 dark:bg-yellow-950/20 hover:bg-yellow-100/50 dark:hover:bg-yellow-950/30',
                            overallStatus === 'proceeded' && 'bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30',
                            !overallStatus               && 'hover:bg-muted/30',
                          )}>
                            {/* Static cells */}
                            <td className="px-3 py-2.5 text-muted-foreground border-r border-border">{idx + 1}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border">{row.recruiter_name || '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border capitalize">
                              {row.source || '—'}
                              {row.source === 'referral' && row.referred_by && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">by {row.referred_by}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 border-r border-border font-medium">
                              <TruncCell text={row.position_name} maxW={160} />
                            </td>
                            <td className="px-3 py-2.5 border-r border-border font-medium text-foreground">
                              <TruncCell text={row.candidate_name} maxW={150} />
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border">{row.phone || '—'}</td>
                            <td className="px-3 py-2.5 border-r border-border text-muted-foreground">
                              <TruncCell text={row.email} maxW={180} />
                            </td>
                            <td className="px-3 py-2.5 text-center border-r border-border">{row.total_experience ?? '—'}</td>
                            <td className="px-3 py-2.5 text-center border-r border-border">{row.relevant_experience ?? '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border">{row.current_ctc || '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border">{row.expected_ctc || '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border">{row.notice_period || '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-border">
                              {overallStatus ? (
                                <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize', verdictColors[overallStatus] || 'bg-muted text-muted-foreground')}>
                                  {overallStatus.replace('_', ' ')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Dynamic stage cells */}
                            {stages.map((stage) => {
                              const iv = row.interviews[stage.stage_id];
                              return [
                                <td key={`${stage.stage_id}-status`} className="px-3 py-2.5 whitespace-nowrap border-r border-border/50">
                                  {iv?.verdict ? (
                                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize', verdictColors[iv.verdict] || 'bg-muted text-muted-foreground')}>
                                      {iv.verdict.replace('_', ' ')}
                                    </span>
                                  ) : '—'}
                                </td>,
                                <td key={`${stage.stage_id}-interviewer`} className="px-3 py-2.5 whitespace-nowrap border-r border-border/50">
                                  {iv?.interviewer_name || '—'}
                                </td>,
                                <td key={`${stage.stage_id}-feedback`} className="px-3 py-2.5 border-r border-border/50">
                                  <TruncCell text={iv?.feedback} maxW={180} />
                                </td>,
                                <td key={`${stage.stage_id}-date`} className="px-3 py-2.5 whitespace-nowrap border-r border-border/50">
                                  {iv?.scheduled_date || '—'}
                                </td>,
                                <td key={`${stage.stage_id}-time`} className="px-3 py-2.5 whitespace-nowrap border-r border-border/50">
                                  {iv?.scheduled_time || '—'}
                                </td>,
                                <td key={`${stage.stage_id}-mode`} className="px-3 py-2.5 whitespace-nowrap border-r border-border/50 capitalize">
                                  {iv?.interview_mode ? (modeLabels[iv.interview_mode] || iv.interview_mode) : '—'}
                                </td>,
                              ];
                            })}

                            {/* Trailing cells */}
                            <td className="px-3 py-2.5 border-r border-border">
                              <TruncCell text={finalFeedback} maxW={180} />
                            </td>
                            <td className="px-3 py-2.5 border-r border-border">
                              <TruncCell text={row.notes} maxW={180} />
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {row.comms_rating != null ? `${row.comms_rating}/10` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TooltipProvider>
              </div>
            </div>
          </>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
