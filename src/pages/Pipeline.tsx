import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { useJobs } from '@/hooks/useJobs';
import { useCandidateInterviews, useJobInterviewStages, usePipelineJobCounts, usePendingApprovalCounts } from '@/hooks/useInterviewPipeline';
import { useCandidateAssignees } from '@/hooks/useCandidateAssignees';
import { usePinnedJobs } from '@/hooks/usePinnedJobs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { InterviewFeedbackDialog } from '@/components/pipeline/InterviewFeedbackDialog';
import { ScheduleInterviewDialog } from '@/components/pipeline/ScheduleInterviewDialog';
import { StageTemplateManager } from '@/components/pipeline/StageTemplateManager';
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type CollisionDetection,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, ChevronRight, Settings2, User, Star,
  ThumbsUp, ThumbsDown, Pause, UserX, ArrowRight, Layers, Briefcase, GripVertical, CalendarDays, ExternalLink, AlertTriangle,
  Pencil, Trash2, Check, X as XIcon, ChevronLeft, MoreHorizontal, UserMinus, RefreshCw, Clock, UserCheck, ClipboardCheck,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateTimeInTz } from '@/lib/formatTz';
import { supabase } from '@/integrations/supabase/client';
import { openCandidateDetailWithFetch } from '@/lib/candidateDetail';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import type { InterviewVerdict, HolisticInterview } from '@/hooks/useInterviewPipeline';
import { applyInterviewSchedule, formatInterviewScheduleError, formatPanelistNames, insertInterviewSessionsAfterVerdict, moveCandidateToStage, type ScheduleInterviewData } from '@/lib/interviewPanelists';
import { notifyStaffEmail } from '@/lib/staffEmail';
import { CandidateDetailDrawer } from '@/components/candidates/CandidateDetailDrawer';
import { InterviewKitDrawer } from '@/components/pipeline/InterviewKitDrawer';
import { useInterviewKitDrawerHost } from '@/hooks/useInterviewKitDrawerHost';
import { useJobApplicationFormStatuses } from '@/hooks/useJobApplicationForm';
import { ApplicationFormStatusBadge } from '@/components/candidates/JobApplicationFormSection';
import { AssessmentStatusBadge } from '@/components/candidates/AssessmentSection';
import { AssignAssessmentDialog } from '@/components/candidates/AssignAssessmentDialog';
import { useJobAssessmentConfig, usePipelineAssessmentStatuses, type PipelineAssessmentStatus } from '@/hooks/useJobAssessment';
import type { Candidate } from '@/types/database';

const verdictColors: Record<InterviewVerdict, string> = {
  proceeded: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  hold: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  no_show: 'bg-muted text-muted-foreground border-border',
};

const verdictIcons: Record<InterviewVerdict, any> = {
  proceeded: ThumbsUp,
  rejected: ThumbsDown,
  hold: Pause,
  no_show: UserX,
};

const PIPELINE_TERMINAL_STATUSES = new Set(['shortlisted', 'rejected', 'backout']);

type FitScoreFilter = 'all' | '70' | '80' | '90';

const PIPELINE_STATUS_FILTERS: { value: InterviewVerdict; label: string }[] = [
  { value: 'proceeded', label: 'Proceeded' },
  { value: 'hold', label: 'On Hold' },
  { value: 'no_show', label: 'No Show' },
  { value: 'rejected', label: 'Declined' },
];

const FIT_SCORE_FILTER_OPTIONS: { value: FitScoreFilter; label: string }[] = [
  { value: 'all', label: 'Any fit score' },
  { value: '70', label: '70%+ fit' },
  { value: '80', label: '80%+ fit' },
  { value: '90', label: '90%+ fit' },
];

function parseVerdictFilters(raw: string | null): Set<InterviewVerdict> {
  if (!raw) return new Set();
  const allowed = new Set<InterviewVerdict>(['proceeded', 'rejected', 'hold', 'no_show']);
  return new Set(
    raw.split(',').filter((v): v is InterviewVerdict => allowed.has(v as InterviewVerdict)),
  );
}

function serializeVerdictFilters(filters: Set<InterviewVerdict>): string | null {
  if (filters.size === 0) return null;
  return [...filters].join(',');
}

function matchesPipelineSearch(name: string | undefined, email: string | undefined, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return !!name?.toLowerCase().includes(q) || !!email?.toLowerCase().includes(q);
}

function matchesFitScoreFilter(score: number | null | undefined, min: FitScoreFilter): boolean {
  if (min === 'all') return true;
  if (score == null) return false;
  return score >= Number(min);
}

function interviewNeedsFeedback(interview: HolisticInterview): boolean {
  return !!interview.scheduled_at && !interview.verdict;
}

function interviewMatchesStatusFilter(interview: HolisticInterview, selected: Set<InterviewVerdict>): boolean {
  if (selected.size === 0) return true;
  return !!interview.verdict && selected.has(interview.verdict);
}

function pendingMatchesStatusFilter(
  candidate: { candidate_status?: string },
  selected: Set<InterviewVerdict>,
): boolean {
  if (selected.size === 0) return true;
  const isDeclined = candidate.candidate_status === 'rejected';
  if (isDeclined) return selected.has('rejected');
  return false;
}

/** 0 = active, 1 = on-hold / no-show, 2 = rejected at this stage */
function getPipelineCardSortTier(interview: HolisticInterview): number {
  const verdict = interview.verdict;
  if (verdict === 'rejected') return 2;
  if (verdict === 'hold' || verdict === 'no_show') return 1;
  return 0;
}

function comparePipelineInterviews(a: HolisticInterview, b: HolisticInterview): number {
  const tierDiff = getPipelineCardSortTier(a) - getPipelineCardSortTier(b);
  if (tierDiff !== 0) return tierDiff;
  const sortOrderDiff = ((a as { sort_order?: number }).sort_order ?? 0) - ((b as { sort_order?: number }).sort_order ?? 0);
  if (sortOrderDiff !== 0) return sortOrderDiff;
  return a.id.localeCompare(b.id);
}

function isOutOfActivePipeline(
  candidate: { candidate_status?: string; hired_at?: string | null } | null | undefined,
): boolean {
  if (!candidate) return false;
  if (candidate.hired_at) return true;
  return PIPELINE_TERMINAL_STATUSES.has(candidate.candidate_status ?? '');
}

interface PipelineProps {
  embedded?: boolean;
}

export default function Pipeline({ embedded = false }: PipelineProps) {
  usePageTitle(embedded ? 'Hiring' : 'Interview Pipeline');
  const { user, isAdmin, isAdminOrHR, role } = useAuth();
  const { sortJobs } = usePinnedJobs(user?.id);
  const { jobs } = useJobs({ summary: true });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeJobId = searchParams.get('job');
  const deepLinkCandidateId = searchParams.get('candidate');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [statusFilters, setStatusFilters] = useState<Set<InterviewVerdict>>(
    () => parseVerdictFilters(searchParams.get('verdict')),
  );
  const [fitScoreFilter, setFitScoreFilter] = useState<FitScoreFilter>(() => {
    const raw = searchParams.get('fit');
    return raw === '70' || raw === '80' || raw === '90' ? raw : 'all';
  });
  const [pendingFeedbackOnly, setPendingFeedbackOnly] = useState(
    () => searchParams.get('feedback') === '1',
  );
  const [showTemplates, setShowTemplates] = useState(false);
  const [feedbackInterview, setFeedbackInterview] = useState<HolisticInterview | null>(null);
  const [scheduleInterview, setScheduleInterview] = useState<HolisticInterview | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isMarkingHired, setIsMarkingHired] = useState(false);
  const [applyTemplateJobId, setApplyTemplateJobId] = useState<string>('');
  const [activeInterview, setActiveInterview] = useState<HolisticInterview | null>(null);
  const [drawerCandidate, setDrawerCandidate] = useState<any>(null);

  const closeDrawerCandidate = useCallback(() => setDrawerCandidate(null), []);
  const detailOpen = !!drawerCandidate;
  const {
    drawerBackdropOpen,
    closeAll,
    interviewKitDrawerProps,
    candidateDrawerKitProps,
  } = useInterviewKitDrawerHost({
    detailOpen,
    onCloseDetail: closeDrawerCandidate,
  });

  const openDrawerCandidate = useCallback((stub: { id: string; [key: string]: unknown }) => {
    void openCandidateDetailWithFetch(stub as any, setDrawerCandidate);
  }, []);

  const updatePipelineFilterParams = useCallback((updates: {
    q?: string;
    verdict?: Set<InterviewVerdict>;
    fit?: FitScoreFilter;
    feedback?: boolean;
  }) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (updates.q !== undefined) {
        if (updates.q.trim()) next.set('q', updates.q.trim());
        else next.delete('q');
      }
      if (updates.verdict !== undefined) {
        const serialized = serializeVerdictFilters(updates.verdict);
        if (serialized) next.set('verdict', serialized);
        else next.delete('verdict');
      }
      if (updates.fit !== undefined) {
        if (updates.fit === 'all') next.delete('fit');
        else next.set('fit', updates.fit);
      }
      if (updates.feedback !== undefined) {
        if (updates.feedback) next.set('feedback', '1');
        else next.delete('feedback');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const toggleStatusFilter = useCallback((value: InterviewVerdict) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      updatePipelineFilterParams({ verdict: next });
      return next;
    });
  }, [updatePipelineFilterParams]);

  const clearPipelineFilters = useCallback(() => {
    setStatusFilters(new Set());
    setFitScoreFilter('all');
    setPendingFeedbackOnly(false);
    updatePipelineFilterParams({ verdict: new Set(), fit: 'all', feedback: false });
  }, [updatePipelineFilterParams]);

  const activeFilterCount =
    statusFilters.size +
    (fitScoreFilter !== 'all' ? 1 : 0) +
    (pendingFeedbackOnly ? 1 : 0);
  // Stage editing state
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState('');
  const [newStageName, setNewStageName] = useState('');
  const [showAddStage, setShowAddStage] = useState(false);
  // Confirm dialogs for remove / reopen
  const [removeConfirm, setRemoveConfirm] = useState<HolisticInterview | null>(null);
  const [reopenConfirm, setReopenConfirm] = useState<HolisticInterview | null>(null);
  const [deleteStageConfirm, setDeleteStageConfirm] = useState<{ id: string; name: string } | null>(null);
  const [declineConfirm, setDeclineConfirm] = useState<{ id: string; name: string } | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [assignAssessmentCandidate, setAssignAssessmentCandidate] = useState<Candidate | null>(null);
  const [advanceOverrideConfirm, setAdvanceOverrideConfirm] = useState<HolisticInterview | null>(null);

  const {
    interviews,
    isLoading,
    updateInterview,
    advanceCandidate,
    createInterview,
    removeFromPipeline,
    reopenCandidate,
  } = useCandidateInterviews(activeJobId ?? undefined);

  const {
    stages: selectedJobStages,
    addStage,
    deleteStage,
    renameStage,
    reorderStages,
  } = useJobInterviewStages(activeJobId ?? undefined);


  // For recruiter role: fetch only their assigned job IDs so we can filter tabs
  const { data: recruiterJobIds } = useQuery({
    queryKey: ['my-recruiter-jobs', user?.id],
    enabled: role === 'recruiter' && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('job_recruiters')
        .select('job_id')
        .eq('recruiter_user_id', user!.id);
      return new Set((data || []).map((r: any) => r.job_id));
    },
  });

  // Pending Approval: candidates assigned to this job but not yet enrolled in any stage
  const { data: pendingCandidates = [], refetch: refetchPending } = useQuery({
    queryKey: ['pending-approval', activeJobId],
    enabled: !!activeJobId,
    queryFn: async () => {
      if (!activeJobId) return [];

      const { data: enrolledIdsRaw, error: enrolledErr } = await supabase.rpc(
        'get_job_enrolled_candidate_ids',
        { p_job_id: activeJobId },
      );
      if (enrolledErr) throw enrolledErr;
      const enrolledIds = new Set<string>((enrolledIdsRaw ?? []) as string[]);

      // Fetch candidates for this job not yet enrolled — include 'rejected' so declined
      // candidates remain visible at the bottom of the Pending Approval column
      const { data: candidates, error } = await supabase
        .from('candidates')
        .select('id, name, email, role_applied, candidate_status, suitability_score, pending_approval_decline_reason')
        .eq('job_id', activeJobId)
        .neq('candidate_status', 'backout')
        .neq('candidate_status', 'shortlisted')
        .is('hired_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const unenrolled = (candidates || []).filter((c: any) => !enrolledIds.has(c.id));
      // Sort: pending (not declined) first, rejected at bottom
      return [
        ...unenrolled.filter((c: any) => c.candidate_status !== 'rejected'),
        ...unenrolled.filter((c: any) => c.candidate_status === 'rejected'),
      ];
    },
  });

  const availableJobs = useMemo(() => {
    if (!jobs) return [];
    const openJobs = jobs.filter((j: any) => j.status === 'open' || j.status === 'paused');
    let filtered = openJobs;
    // Recruiters only see their assigned jobs; admins/HR see all
    if (role === 'recruiter' && recruiterJobIds) {
      filtered = openJobs.filter((j: any) => recruiterJobIds.has(j.id));
    }
    return sortJobs(filtered);
  }, [jobs, role, recruiterJobIds, sortJobs]);

  const openJobIds = useMemo(
    () => availableJobs.map((j: { id: string }) => j.id),
    [availableJobs],
  );

  const { data: jobCandidateCounts = new Map<string, number>() } = usePipelineJobCounts(openJobIds);
  const { data: pendingApprovalCounts = new Map<string, number>() } = usePendingApprovalCounts(openJobIds);

  // Auto-select the first job if no ?job= param is set or the stored job is no longer available
  useEffect(() => {
    if (availableJobs.length === 0) return;
    const isValid = activeJobId && availableJobs.some((j: any) => j.id === activeJobId);
    if (!isValid) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('job', availableJobs[0].id);
        return next;
      }, { replace: true });
    }
  }, [availableJobs, activeJobId]);

  // Auto-open candidate drawer when ?candidate= is in the URL (deep link from Chitragupta)
  useEffect(() => {
    if (!deepLinkCandidateId || drawerCandidate) return;

    const clearCandidateParam = () => setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('candidate');
      return next;
    }, { replace: true });

    // 1. Check enrolled pipeline candidates first
    if (interviews.length) {
      const match = interviews.find(iv => iv.candidate_id === deepLinkCandidateId);
      if (match?.candidate) {
        openDrawerCandidate(match.candidate);
        clearCandidateParam();
        return;
      }
    }

    // 2. Check pending approval candidates (not yet enrolled in any stage)
    if (pendingCandidates.length) {
      const pendingMatch = (pendingCandidates as any[]).find(c => c.id === deepLinkCandidateId);
      if (pendingMatch) {
        openDrawerCandidate(pendingMatch);
        clearCandidateParam();
      }
    }
  }, [deepLinkCandidateId, interviews, pendingCandidates, drawerCandidate, openDrawerCandidate]);

  const selectedJobStageIds = useMemo(
    () => new Set(selectedJobStages.map(s => s.id)),
    [selectedJobStages]
  );

  const filteredInterviews = useMemo(() => {
    // For each candidate, keep only the row in the highest order_index stage
    // (most advanced). Within the same stage, prefer latest created_at then id.
    // This handles both advance-button rows and drag-moved rows without relying
    // on advanced_at (which drag-drop does not set).
    const stageOrder = new Map(selectedJobStages.map(s => [s.id, s.order_index]));

    // Build a map: candidate_id → best row id (across all stages in the active job)
    const bestRowMap = new Map<string, { stageOrder: number; ts: string; id: string }>();
    interviews.forEach(iv => {
      if (!selectedJobStageIds.has(iv.job_interview_stage_id)) return;
      if (isOutOfActivePipeline(iv.candidate)) return;
      const order = stageOrder.get(iv.job_interview_stage_id) ?? -1;
      const ts = (iv as any).created_at as string ?? '';
      const cur = bestRowMap.get(iv.candidate_id);
      if (
        !cur ||
        order > cur.stageOrder ||
        (order === cur.stageOrder && ts > cur.ts) ||
        (order === cur.stageOrder && ts === cur.ts && iv.id > cur.id)
      ) {
        bestRowMap.set(iv.candidate_id, { stageOrder: order, ts, id: iv.id });
      }
    });

    return interviews.filter(iv => {
      if (!selectedJobStageIds.has(iv.job_interview_stage_id)) return false;
      if (isOutOfActivePipeline(iv.candidate)) return false;
      if (bestRowMap.get(iv.candidate_id)?.id !== iv.id) return false;
      if (!matchesPipelineSearch(iv.candidate?.name, iv.candidate?.email, searchQuery)) return false;
      if (!interviewMatchesStatusFilter(iv, statusFilters)) return false;
      if (!matchesFitScoreFilter((iv.candidate as any)?.suitability_score, fitScoreFilter)) return false;
      if (pendingFeedbackOnly && !interviewNeedsFeedback(iv)) return false;
      return true;
    });
  }, [interviews, selectedJobStages, selectedJobStageIds, searchQuery, statusFilters, fitScoreFilter, pendingFeedbackOnly]);

  const filteredPendingCandidates = useMemo(() => {
    if (pendingFeedbackOnly) return [];
    return pendingCandidates.filter((c: any) => {
      if (!matchesPipelineSearch(c.name, c.email, searchQuery)) return false;
      if (!pendingMatchesStatusFilter(c, statusFilters)) return false;
      if (!matchesFitScoreFilter(c.suitability_score, fitScoreFilter)) return false;
      return true;
    });
  }, [pendingCandidates, searchQuery, statusFilters, fitScoreFilter, pendingFeedbackOnly]);

  // Keyed by stage ID (not merged stage name) — one-to-one with selectedJobStages
  const stageInterviewMap = useMemo(() => {
    const map = new Map<string, HolisticInterview[]>();
    selectedJobStages.forEach(s => map.set(s.id, []));
    filteredInterviews.forEach(iv => {
      if (map.has(iv.job_interview_stage_id)) map.get(iv.job_interview_stage_id)!.push(iv);
    });
    map.forEach(arr => arr.sort(comparePipelineInterviews));
    return map;
  }, [selectedJobStages, filteredInterviews]);

  const visibleCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    filteredInterviews.forEach((iv) => ids.add(iv.candidate_id));
    filteredPendingCandidates.forEach((c: { id: string }) => ids.add(c.id));
    return [...ids];
  }, [filteredInterviews, filteredPendingCandidates]);

  const { recruiterMap, interviewerMap } = useCandidateAssignees(visibleCandidateIds);

  const pipelineEmails = useMemo(() => {
    const emails = new Set<string>();
    filteredInterviews.forEach((iv) => {
      if (iv.candidate?.email) emails.add(iv.candidate.email);
    });
    filteredPendingCandidates.forEach((c: { email?: string }) => {
      if (c.email) emails.add(c.email);
    });
    return [...emails];
  }, [filteredInterviews, filteredPendingCandidates]);

  const { data: applicationFormStatuses = new Map() } = useJobApplicationFormStatuses(
    activeJobId,
    pipelineEmails,
  );

  const { data: jobAssessmentConfig } = useJobAssessmentConfig(activeJobId);

  const { data: assessmentStatuses = new Map<string, PipelineAssessmentStatus>() } = usePipelineAssessmentStatuses(
    activeJobId,
    visibleCandidateIds,
    jobAssessmentConfig
      ? {
          assessmentEnabled: jobAssessmentConfig.assessmentEnabled,
          defaultAssessmentId: jobAssessmentConfig.defaultAssessmentId,
        }
      : null,
  );

  // ─── Feedback handler — records interviewer_user_id ───
  const handleFeedbackSubmit = (data: any) => {
    if (!feedbackInterview || !user) return;
    const stageSnapshot =
      (feedbackInterview as HolisticInterview & { stage_name_snapshot?: string | null }).stage_name_snapshot
      ?? feedbackInterview.job_interview_stage?.stage_name
      ?? null;
    updateInterview.mutate({
      id: feedbackInterview.id,
      verdict: data.verdict,
      overall_score: data.overall_score,
      rating_categories: data.rating_categories,
      feedback: data.feedback,
      artifacts: data.artifacts,
      interview_mode: data.interview_mode,
      completed_at: data.completed_at,
      interviewer_user_id: user.id, // Always record who gave the feedback
      ...(stageSnapshot && { stage_name_snapshot: stageSnapshot }),
      ...(data.rejection_reason != null && { rejection_reason: data.rejection_reason }),
    }, {
      onSuccess: () => {
        setFeedbackInterview(null);
        toast({ title: 'Feedback submitted' });
        notifyStaffEmail('verdict_submitted', feedbackInterview.id);
      },
    });
  };

  const handleAdvance = (interview: HolisticInterview, forceOverride = false) => {
    if (!user || !interview.job_interview_stage) return;

    if (
      !forceOverride
      && jobAssessmentConfig?.assessmentEnabled
      && jobAssessmentConfig.defaultAssessmentId
      && jobAssessmentConfig.config.require_pass_before_interview !== false
    ) {
      const status = assessmentStatuses.get(interview.candidate_id);
      if (status && status !== 'not_required' && status !== 'passed') {
        if (isAdminOrHR) {
          setAdvanceOverrideConfirm(interview);
          return;
        }
        toast({
          title: 'Assessment required',
          description: 'Candidate must pass the job assessment before advancing.',
          variant: 'destructive',
        });
        return;
      }
    }

    const jobId = interview.job_interview_stage.job_id;
    const jobStages = [...selectedJobStages].sort((a, b) => a.order_index - b.order_index);
    const currentIdx = jobStages.findIndex(s => s.id === interview.job_interview_stage_id);
    if (currentIdx === -1 || currentIdx >= jobStages.length - 1) {
      toast({ title: 'Final stage', description: 'Candidate has completed all interview stages.' });
      return;
    }
    const nextStage = jobStages[currentIdx + 1];
    advanceCandidate.mutate({
      candidateId: interview.candidate_id,
      fromStageId: interview.job_interview_stage_id,
      toStageId: nextStage.id,
      advancedBy: user.id,
    }, {
      onSuccess: () => setAdvanceOverrideConfirm(null),
    });
  };

  const handleScheduleSubmit = async (data: ScheduleInterviewData) => {
    if (!scheduleInterview) return;
    setIsScheduling(true);

    try {
      // After feedback, always INSERT new session rows — never UPDATE the completed row
      // (scheduled_at remains set on completed rows, so the old guard caused overwrites).
      const isNewSessionAfterVerdict = !!scheduleInterview.verdict;

      if (isNewSessionAfterVerdict) {
        const createdIds = await insertInterviewSessionsAfterVerdict(
          {
            candidate_id: scheduleInterview.candidate_id,
            job_interview_stage_id: scheduleInterview.job_interview_stage_id,
            stage_name_snapshot: scheduleInterview.job_interview_stage?.stage_name ?? undefined,
            round: (scheduleInterview as HolisticInterview & { round?: number }).round ?? 1,
          },
          data,
        );
        setScheduleInterview(null);
        toast({ title: 'New interview session scheduled' });
        await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
        await queryClient.invalidateQueries({ queryKey: ['scheduled-interviews'] });
        await queryClient.invalidateQueries({ queryKey: ['my-interviews-upcoming'] });
        await queryClient.invalidateQueries({ queryKey: ['pending-feedback-interviews'] });
        await queryClient.invalidateQueries({ queryKey: ['candidate-interview-history'] });
        for (const id of createdIds) {
          queryClient.invalidateQueries({ queryKey: ['interview-kit', id] });
        }
      } else {
        await applyInterviewSchedule(scheduleInterview.id, data);
        setScheduleInterview(null);
        toast({ title: scheduleInterview.scheduled_at ? 'Interview rescheduled' : 'Interview scheduled' });
        await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
        await queryClient.invalidateQueries({ queryKey: ['scheduled-interviews'] });
        await queryClient.invalidateQueries({ queryKey: ['my-interviews-upcoming'] });
        await queryClient.invalidateQueries({ queryKey: ['pending-feedback-interviews'] });
        await queryClient.invalidateQueries({ queryKey: ['candidate-interview-history'] });
        queryClient.invalidateQueries({ queryKey: ['interview-kit', scheduleInterview.id] });
      }
    } catch (err: unknown) {
      toast({ title: 'Error', description: formatInterviewScheduleError(err), variant: 'destructive' });
    } finally {
      setIsScheduling(false);
    }
  };

  // ─── Pending Approval handlers ───
  const handleApprovePending = async (candidateId: string) => {
    if (!selectedJobStages.length || !user) return;
    const firstStageId = selectedJobStages[0].id;

    // Check if a record already exists (possibly with removed_from_pipeline_at set
    // from the old auto-enroll trigger). If so, un-remove it instead of inserting
    // a new one — which would hit the unique constraint (409 Conflict).
    const { data: existing } = await supabase
      .from('candidate_interviews')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_interview_stage_id', firstStageId)
      .maybeSingle();

    const now = new Date().toISOString();
    if (existing) {
      const { error } = await supabase
        .from('candidate_interviews')
        .update({
          removed_from_pipeline_at: null,
          removed_by: null,
          verdict: null,
          advanced_at: null,
          advanced_by: null,
          enrolled_at: now,
        } as any)
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Error approving candidate', description: error.message, variant: 'destructive' });
        return;
      }
    } else {
      const { error } = await supabase
        .from('candidate_interviews')
        .insert({ candidate_id: candidateId, job_interview_stage_id: firstStageId, enrolled_at: now } as any);
      if (error) {
        toast({ title: 'Error approving candidate', description: error.message, variant: 'destructive' });
        return;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
    await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
    await queryClient.invalidateQueries({ queryKey: ['pending-approval', activeJobId] });
    toast({ title: 'Candidate approved', description: 'Moved to first interview stage.' });
  };

  const handleDeclinePending = async (candidateId: string) => {
    await supabase.from('candidates').update({
      candidate_status: 'rejected',
      ...(declineReason.trim() && { pending_approval_decline_reason: declineReason.trim() }),
    } as any).eq('id', candidateId);
    queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
    queryClient.invalidateQueries({ queryKey: ['pending-approval', activeJobId] });
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    setDeclineConfirm(null);
    setDeclineReason('');
    toast({ title: 'Candidate declined', description: 'Candidate stays in the talent database.' });
  };

  const handleMarkHired = async (interview: HolisticInterview) => {
    setIsMarkingHired(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('candidates')
        .update({ hired_at: now, candidate_status: 'shortlisted' })
        .eq('id', interview.candidate_id);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      toast({ title: 'Candidate marked as hired', description: 'Removed from active pipeline.' });
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to mark as hired',
        variant: 'destructive',
      });
    } finally {
      setIsMarkingHired(false);
    }
  };

  // ─── Drag & Drop ───
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Custom collision: prefer pointer-within for column droppables (fixes empty column drops)
  // then fall back to closestCenter for within-column card ordering.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const iv = filteredInterviews.find(i => i.id === event.active.id);
    setActiveInterview(iv || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveInterview(null);
    const { active, over } = event;
    if (!over || !user) return;

    const interviewId = active.id as string;
    const overId = over.id as string;
    
    const interview = filteredInterviews.find(i => i.id === interviewId);
    if (!interview || !interview.job_interview_stage) return;

    const currentStageId = interview.job_interview_stage_id;

    // Check if dropped on a stage column (cross-column move)
    const isStageTarget = selectedJobStages.some(s => s.id === overId);

    if (isStageTarget) {
      // Cross-column move
      if (currentStageId === overId) return; // Same stage — no-op
      const targetStage = selectedJobStages.find(s => s.id === overId);
      if (!targetStage) return;

      try {
        await moveCandidateToStage(
          {
            id: interviewId,
            candidate_id: interview.candidate_id,
            job_interview_stage_id: currentStageId,
            verdict: interview.verdict,
            round: (interview as HolisticInterview & { round?: number }).round,
          },
          targetStage,
          user.id,
        );
        toast({ title: 'Candidate moved', description: `Moved to ${targetStage.stage_name}` });
        await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      } catch (err: any) {
        toast({ title: 'Error moving candidate', description: err?.message, variant: 'destructive' });
      }
    } else {
      // Within-column reorder (dropped on another card)
      const overInterview = filteredInterviews.find(i => i.id === overId);
      if (!overInterview) return;

      const overStageId = overInterview.job_interview_stage_id;
      if (currentStageId !== overStageId) {
        // Cross-column drop on a card — move to that card's stage
        const targetStage = selectedJobStages.find(s => s.id === overStageId);
        if (!targetStage) return;
        try {
          await moveCandidateToStage(
            {
              id: interviewId,
              candidate_id: interview.candidate_id,
              job_interview_stage_id: currentStageId,
              verdict: interview.verdict,
              round: (interview as HolisticInterview & { round?: number }).round,
            },
            targetStage,
            user.id,
          );
          toast({ title: 'Candidate moved', description: `Moved to ${targetStage.stage_name}` });
          await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
        } catch (err: any) {
          toast({ title: 'Error moving candidate', description: err?.message, variant: 'destructive' });
        }
        return;
      }

      // Same column reorder
      const columnInterviews = stageInterviewMap.get(currentStageId) || [];
      const oldIndex = columnInterviews.findIndex(i => i.id === interviewId);
      const newIndex = columnInterviews.findIndex(i => i.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(columnInterviews, oldIndex, newIndex);
      
      // Persist new sort_order for all affected cards
      try {
        const updates = reordered.map((iv, idx) => 
          supabase.from('candidate_interviews').update({ sort_order: idx }).eq('id', iv.id)
        );
        await Promise.all(updates);
        await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      } catch (err: any) {
        console.error('Error reordering:', err);
        toast({ title: 'Error reordering', description: err?.message, variant: 'destructive' });
      }
    }
  };

  const canManage = isAdmin || isAdminOrHR || role === 'recruiter';
  const totalInPipeline = filteredInterviews.length + filteredPendingCandidates.length;

  const pipelineContent = (
    <>
      <main className={embedded ? 'space-y-6' : 'container mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6'}>
        <div className={embedded ? 'flex items-center gap-3 flex-wrap' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'}>
          {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Interview Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              {totalInPipeline} candidate{totalInPipeline !== 1 ? 's' : ''} across {selectedJobStages.length} stage{selectedJobStages.length !== 1 ? 's' : ''}
            </p>
          </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                updatePipelineFilterParams({ q: e.target.value });
              }}
              className="w-full sm:w-[200px]"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={activeFilterCount > 0 ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5 h-9"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-background/20 px-1.5 text-xs">{activeFilterCount}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Status</p>
                  <div className="space-y-2">
                    {PIPELINE_STATUS_FILTERS.map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={statusFilters.has(value)}
                          onCheckedChange={() => toggleStatusFilter(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Fit score</Label>
                  <Select
                    value={fitScoreFilter}
                    onValueChange={(value: FitScoreFilter) => {
                      setFitScoreFilter(value);
                      updatePipelineFilterParams({ fit: value });
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIT_SCORE_FILTER_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={pendingFeedbackOnly}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true;
                      setPendingFeedbackOnly(enabled);
                      updatePipelineFilterParams({ feedback: enabled });
                    }}
                  />
                  <span>Pending feedback</span>
                </label>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-muted-foreground"
                    onClick={clearPipelineFilters}
                  >
                    Clear all filters
                  </Button>
                )}
              </PopoverContent>
            </Popover>
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)} className="gap-1">
                  <Layers className="w-4 h-4" /> Templates
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Job Tabs */}
        {!embedded && (availableJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open jobs found.</p>
        ) : (
          <ScrollArea className="w-full">
            <div className="flex border-b">
              {availableJobs.map((job: any) => {
                const count = jobCandidateCounts.get(job.id) ?? 0;
                const pendingCount = pendingApprovalCounts.get(job.id) ?? 0;
                const isActive = activeJobId === job.id;
                return (
                  <button
                    key={job.id}
                    ref={isActive ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                    onClick={() => setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set('job', job.id);
                      return next;
                    }, { replace: true })}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-2',
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {job.status === 'paused' && (
                      <Pause className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    {job.title}
                    {pendingCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 px-1.5 text-[10px] font-semibold rounded-full shrink-0"
                        title={`${pendingCount} pending approval`}
                      >
                        {pendingCount}
                      </Badge>
                    )}
                    {count > 0 && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full leading-none shrink-0">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ))}

        {/* Paused job banner */}
        {availableJobs.find((j: any) => j.id === activeJobId)?.status === 'paused' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
            <Pause className="h-3.5 w-3.5 shrink-0" />
            <span>This job is <strong>paused</strong> — hiring is on hold. You can still process interviews in the pipeline.</span>
          </div>
        )}

        {/* Pipeline Kanban with DnD */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : selectedJobStages.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <Settings2 className="w-12 h-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">No interview stages configured for this job.</p>
              <p className="text-xs text-muted-foreground">Apply a template to set up the pipeline stages.</p>
              {canManage && (
                <Button variant="outline" onClick={() => setShowTemplates(true)} className="gap-1">
                  <Layers className="w-4 h-4" /> Manage Templates
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-4 min-w-max">
                {/* Pending Approval — synthetic first column */}
                <PendingApprovalColumn
                  candidates={filteredPendingCandidates}
                  onApprove={handleApprovePending}
                  onDecline={(c: any) => setDeclineConfirm({ id: c.id, name: c.name })}
                  onCardClick={(c: any) => openDrawerCandidate(c)}
                  isApproving={createInterview.isPending}
                  applicationFormStatuses={applicationFormStatuses}
                />

                {selectedJobStages.map((stage, idx) => {
                  const stageInterviews = stageInterviewMap.get(stage.id) || [];
                  return (
                    <DroppableColumn
                      key={stage.id}
                      stageId={stage.id}
                      stageName={stage.stage_name}
                      count={stageInterviews.length}
                      isFirst={idx === 0}
                      isLast={idx === selectedJobStages.length - 1}
                      interviewIds={stageInterviews.map(iv => iv.id)}
                      canManage={isAdminOrHR}
                      isEmpty={stageInterviews.length === 0}
                      isEditing={editingStageId === stage.id}
                      editingName={editingStageName}
                      onStartEdit={() => { setEditingStageId(stage.id); setEditingStageName(stage.stage_name); }}
                      onEditNameChange={setEditingStageName}
                      onSaveEdit={() => {
                        if (editingStageName.trim()) renameStage.mutate({ stageId: stage.id, stageName: editingStageName.trim() });
                        setEditingStageId(null);
                      }}
                      onCancelEdit={() => setEditingStageId(null)}
                      onDelete={() => setDeleteStageConfirm({ id: stage.id, name: stage.stage_name })}
                      onMoveLeft={() => {
                        const ids = selectedJobStages.map(s => s.id);
                        const newIds = [...ids];
                        [newIds[idx - 1], newIds[idx]] = [newIds[idx], newIds[idx - 1]];
                        reorderStages.mutate(newIds);
                      }}
                      onMoveRight={() => {
                        const ids = selectedJobStages.map(s => s.id);
                        const newIds = [...ids];
                        [newIds[idx], newIds[idx + 1]] = [newIds[idx + 1], newIds[idx]];
                        reorderStages.mutate(newIds);
                      }}
                    >
                      {stageInterviews.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">No candidates</p>
                      ) : (
                        stageInterviews.map(iv => (
                          <DraggablePipelineCard
                            key={iv.id}
                            interview={iv}
                            canManage={canManage}
                            allStages={selectedJobStages}
                            recruiter={recruiterMap.get(iv.candidate_id)}
                            interviewers={interviewerMap.get(iv.candidate_id)}
                            canAdminAction={isAdminOrHR}
                            onFeedback={() => setFeedbackInterview(iv)}
                            onAdvance={() => handleAdvance(iv)}
                            onSchedule={() => setScheduleInterview(iv)}
                            onCardClick={() => iv.candidate && openDrawerCandidate(iv.candidate)}
                            onRemove={() => setRemoveConfirm(iv)}
                            onReopen={iv.verdict === 'rejected' ? () => setReopenConfirm(iv) : undefined}
                            onMarkHired={() => handleMarkHired(iv)}
                            isMarkingHired={isMarkingHired}
                            applicationFormStatus={iv.candidate?.email ? applicationFormStatuses.get(iv.candidate.email) : undefined}
                            assessmentStatus={assessmentStatuses.get(iv.candidate_id)}
                            assessmentEnabled={jobAssessmentConfig?.assessmentEnabled === true}
                            onAssignAssessment={iv.candidate ? () => setAssignAssessmentCandidate(iv.candidate as Candidate) : undefined}
                          />
                        ))
                      )}
                    </DroppableColumn>
                  );
                })}

                {/* Add new stage inline — admin/HR */}
                {isAdminOrHR && (
                  <div className="w-[220px] shrink-0">
                    {showAddStage ? (
                      <div className="flex flex-col gap-1 mb-3 px-1">
                        {(() => {
                          const isDuplicate = !!newStageName.trim() &&
                            selectedJobStages.some(s => s.stage_name.toLowerCase() === newStageName.trim().toLowerCase());
                          const handleCommit = () => {
                            if (!newStageName.trim() || !activeJobId || isDuplicate) return;
                            addStage.mutate({ jobId: activeJobId, stageName: newStageName.trim(), orderIndex: selectedJobStages.length });
                            setNewStageName(''); setShowAddStage(false);
                          };
                          return (
                            <>
                              <div className="flex items-center gap-1">
                                <input
                                  className={cn(
                                    'flex-1 text-sm border rounded px-2 py-1 bg-background focus:outline-none focus:ring-2',
                                    isDuplicate ? 'border-destructive focus:ring-destructive' : 'focus:ring-primary',
                                  )}
                                  placeholder="Stage name…"
                                  value={newStageName}
                                  onChange={e => setNewStageName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleCommit();
                                    if (e.key === 'Escape') { setShowAddStage(false); setNewStageName(''); }
                                  }}
                                  autoFocus
                                />
                                <button onClick={handleCommit} disabled={isDuplicate} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40 p-1">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setShowAddStage(false); setNewStageName(''); }} className="text-muted-foreground p-1"><XIcon className="w-4 h-4" /></button>
                              </div>
                              {isDuplicate && (
                                <p className="text-xs text-destructive px-0.5">A stage with this name already exists.</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddStage(true)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors w-full"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Stage
                      </button>
                    )}
                  </div>
                )}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            <DragOverlay>
              {activeInterview && (
                <div className="w-[300px] opacity-90">
                  <PipelineCardContent interview={activeInterview} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={(open) => { setShowTemplates(open); if (!open) setApplyTemplateJobId(''); }}>
        <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stage Templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Apply to Job</label>
              <Select value={applyTemplateJobId} onValueChange={setApplyTemplateJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job to apply stages..." />
                </SelectTrigger>
                <SelectContent>
                  {availableJobs.map((j: any) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!applyTemplateJobId && (
                <p className="text-xs text-muted-foreground">Select a job first, then click "Apply" on a template to set up its stages.</p>
              )}
            </div>
            <StageTemplateManager
              showApply={!!applyTemplateJobId}
              onApplyTemplate={async (stages) => {
                if (!applyTemplateJobId) return;
                try {
                  // Insert new stages (keep old ones — interviews reference them)
                  // First, check existing stages for this job
                  const { data: existingStages } = await supabase
                    .from('job_interview_stages')
                    .select('id, stage_name')
                    .eq('job_id', applyTemplateJobId);

                  const existingNames = new Set((existingStages || []).map(s => s.stage_name));
                  
                  // Only insert stages that don't already exist
                  const newStages = stages.filter(s => !existingNames.has(s.name));
                  
                  if (newStages.length > 0) {
                    const inserts = newStages.map((s, i) => ({
                      job_id: applyTemplateJobId,
                      stage_name: s.name,
                      order_index: s.order ?? (existingStages?.length || 0) + i,
                      is_eliminatory: false,
                    }));
                    const { error } = await supabase.from('job_interview_stages').insert(inserts);
                    if (error) throw error;
                  }

                  // Update order_index for all stages to match template order
                  const { data: allJobStages } = await supabase
                    .from('job_interview_stages')
                    .select('id, stage_name')
                    .eq('job_id', applyTemplateJobId);
                  
                  if (allJobStages) {
                    const stageOrderMap = new Map(stages.map((s, i) => [s.name, s.order ?? i]));
                    for (const s of allJobStages) {
                      const newOrder = stageOrderMap.get(s.stage_name);
                      if (newOrder !== undefined) {
                        await supabase.from('job_interview_stages')
                          .update({ order_index: newOrder })
                          .eq('id', s.id);
                      }
                    }
                  }

                  // Candidates remain in Pending Approval — they are enrolled
                  // into the pipeline only when explicitly approved by a recruiter/HR.
                  toast({ title: 'Template applied', description: `Stages configured. Candidates will appear in Pending Approval.` });
                  setShowTemplates(false);
                  setApplyTemplateJobId('');
                  await queryClient.invalidateQueries({ queryKey: ['all-job-interview-stages'] });
                  await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
                } catch (err: any) {
                  console.error('Error applying template:', err);
                  toast({ title: 'Error applying template', description: err?.message || 'Something went wrong', variant: 'destructive' });
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Candidate Detail Drawer */}
      <InterviewKitDrawer {...interviewKitDrawerProps} />
      <CandidateDetailDrawer
        candidate={drawerCandidate}
        open={detailOpen}
        onOpenChange={(open) => !open && closeDrawerCandidate()}
        isInterviewerOnly={role === 'interviewer' && !isAdminOrHR}
        {...candidateDrawerKitProps}
      />
      {drawerBackdropOpen && (
        <button
          type="button"
          aria-label="Close drawer"
          className="fixed inset-0 z-[39] bg-black/80 animate-in fade-in-0"
          onClick={closeAll}
        />
      )}

      {assignAssessmentCandidate && (
        <AssignAssessmentDialog
          open={!!assignAssessmentCandidate}
          onOpenChange={(open) => !open && setAssignAssessmentCandidate(null)}
          candidate={assignAssessmentCandidate}
          jobId={activeJobId}
          defaultAssessmentId={jobAssessmentConfig?.defaultAssessmentId ?? null}
          deadlineDays={jobAssessmentConfig?.config.deadline_days ?? 7}
        />
      )}

      <Dialog open={!!advanceOverrideConfirm} onOpenChange={(open) => !open && setAdvanceOverrideConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Advance without passing assessment?</DialogTitle>
            <DialogDescription>
              <strong>{advanceOverrideConfirm?.candidate?.name}</strong> has not passed the required job assessment.
              As admin/HR you can override and advance anyway.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceOverrideConfirm(null)}>Cancel</Button>
            <Button
              onClick={() => advanceOverrideConfirm && handleAdvance(advanceOverrideConfirm, true)}
              disabled={advanceCandidate.isPending}
            >
              {advanceCandidate.isPending ? 'Advancing…' : 'Override & Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <InterviewFeedbackDialog
        open={!!feedbackInterview}
        onOpenChange={(open) => !open && setFeedbackInterview(null)}
        interview={feedbackInterview}
        onSubmit={handleFeedbackSubmit}
        isSubmitting={updateInterview.isPending}
      />

      {/* Schedule Interview Dialog */}
      <ScheduleInterviewDialog
        open={!!scheduleInterview}
        onOpenChange={(open) => !open && setScheduleInterview(null)}
        interview={scheduleInterview}
        onSubmit={handleScheduleSubmit}
        isSubmitting={isScheduling}
        prescreenFormIncomplete={
          !!scheduleInterview?.candidate?.email
          && applicationFormStatuses.get(scheduleInterview.candidate.email) !== 'submitted'
          && applicationFormStatuses.has(scheduleInterview.candidate.email)
        }
      />
      {/* Remove from Pipeline confirmation */}
      <Dialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove from Pipeline?</DialogTitle>
            <DialogDescription>
              <strong>{removeConfirm?.candidate?.name}</strong> will be removed from the <strong>{removeConfirm?.job?.title}</strong> pipeline.
              Their interview history will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={removeFromPipeline.isPending}
              onClick={() => {
                if (!removeConfirm || !user) return;
                const jobId = removeConfirm.job?.id || (removeConfirm.job_interview_stage as any)?.job_id;
                if (!jobId) return;
                removeFromPipeline.mutate(
                  { candidateId: removeConfirm.candidate_id, removedBy: user.id },
                  { onSuccess: () => setRemoveConfirm(null) }
                );
              }}
            >
              {removeFromPipeline.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Stage confirmation */}
      <Dialog open={!!deleteStageConfirm} onOpenChange={(open) => !open && setDeleteStageConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Stage?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete the <strong>{deleteStageConfirm?.name}</strong> stage?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStageConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteStage.isPending}
              onClick={() => {
                if (!deleteStageConfirm) return;
                deleteStage.mutate(deleteStageConfirm.id, {
                  onSuccess: () => setDeleteStageConfirm(null),
                });
              }}
            >
              {deleteStage.isPending ? 'Deleting…' : 'Delete Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Pending Approval confirmation */}
      <Dialog open={!!declineConfirm} onOpenChange={(open) => { if (!open) { setDeclineConfirm(null); setDeclineReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Decline Candidate?</DialogTitle>
            <DialogDescription>
              <strong>{declineConfirm?.name}</strong> will be marked as declined for this role.
              They will remain in the talent database and can be reconsidered for future openings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <label className="text-sm font-medium">Reason for declining <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              rows={3}
              placeholder="e.g. Skills don't match the role requirements, Over-experienced for this level…"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Helps recruiters source more relevant profiles.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeclineConfirm(null); setDeclineReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => declineConfirm && handleDeclinePending(declineConfirm.id)}
            >
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-open Candidate confirmation */}
      <Dialog open={!!reopenConfirm} onOpenChange={(open) => !open && setReopenConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Re-open Candidate?</DialogTitle>
            <DialogDescription>
              Start a new round for <strong>{reopenConfirm?.candidate?.name}</strong> on <strong>{reopenConfirm?.job?.title}</strong>.
              Round 1 feedback will be preserved in history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenConfirm(null)}>Cancel</Button>
            <Button
              disabled={reopenCandidate.isPending}
              onClick={() => {
                if (!reopenConfirm) return;
                const jobId = reopenConfirm.job?.id || (reopenConfirm.job_interview_stage as any)?.job_id;
                if (!jobId) return;
                reopenCandidate.mutate(
                  { candidateId: reopenConfirm.candidate_id },
                  { onSuccess: () => setReopenConfirm(null) }
                );
              }}
            >
              {reopenCandidate.isPending ? 'Re-opening…' : 'Start New Round'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return pipelineContent;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header showSearch={false} />
      {pipelineContent}
      <Footer />
    </div>
  );
}

// ─── Droppable Column ───

function DroppableColumn({
  stageId, stageName, count, isFirst, isLast, interviewIds, children,
  canManage, isEmpty,
  isEditing, editingName, onStartEdit, onEditNameChange, onSaveEdit, onCancelEdit,
  onDelete, onMoveLeft, onMoveRight,
}: {
  stageId: string;
  stageName: string;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  interviewIds: string[];
  children: React.ReactNode;
  canManage: boolean;
  isEmpty: boolean;
  isEditing: boolean;
  editingName: string;
  onStartEdit: () => void;
  onEditNameChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  return (
    <div ref={setNodeRef} className="w-[320px] shrink-0">
      <div className="flex items-center justify-between mb-3 px-1 group">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                className="flex-1 text-sm font-semibold border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                value={editingName}
                onChange={e => onEditNameChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
                autoFocus
              />
              <button onClick={onSaveEdit} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground p-0.5"><XIcon className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <h3 className="font-semibold text-sm text-foreground truncate">{stageName}</h3>
              <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
            </>
          )}
        </div>
        {!isEditing && canManage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button onClick={onMoveLeft} disabled={isFirst} title="Move stage left"
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={onMoveRight} disabled={isLast} title="Move stage right"
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={onStartEdit} title="Rename stage"
              className="p-1 rounded text-muted-foreground hover:text-foreground">
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={onDelete}
              disabled={!isEmpty}
              title={isEmpty ? 'Delete stage' : 'Remove candidates first'}
              className="p-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        {!isEditing && !canManage && !isLast && (
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        )}
      </div>
      <SortableContext items={interviewIds} strategy={verticalListSortingStrategy}>
        <div className={`space-y-2 min-h-[200px] rounded-lg p-2 transition-colors ${
          isOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-secondary/30'
        }`}>
          {children}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Draggable Pipeline Card ───

function DraggablePipelineCard({
  interview, canManage, canAdminAction, allStages, recruiter, interviewers, onFeedback, onAdvance, onSchedule, onCardClick, onRemove, onReopen, onMarkHired, isMarkingHired, applicationFormStatus, assessmentStatus, assessmentEnabled, onAssignAssessment,
}: {
  interview: HolisticInterview;
  canManage: boolean;
  canAdminAction: boolean;
  allStages: any[];
  recruiter?: { recruiter_name: string; recruiter_email: string }[];
  interviewers?: { interviewer_name: string; interviewer_email: string }[];
  onFeedback: () => void;
  onAdvance: () => void;
  onSchedule: () => void;
  onCardClick: () => void;
  onRemove: () => void;
  onReopen?: () => void;
  onMarkHired: () => void;
  isMarkingHired: boolean;
  applicationFormStatus?: 'pending' | 'submitted' | 'none';
  assessmentStatus?: PipelineAssessmentStatus;
  assessmentEnabled?: boolean;
  onAssignAssessment?: () => void;
}) {
  const userTimezone = useUserTimezone();
  const isNewlyApproved = !!interview.enrolled_at &&
    new Date(interview.enrolled_at).getTime() > Date.now() - 24 * 60 * 60 * 1000;
  const candidateStatus = (interview.candidate as any)?.candidate_status as string | undefined;
  const isBackout = candidateStatus === 'backout';
  const isRejected = interview.verdict === 'rejected';
  const isLocked = isBackout || isRejected;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: interview.id,
    disabled: isLocked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const candidate = interview.candidate;
  const VerdictIcon = interview.verdict ? verdictIcons[interview.verdict] : null;

  const jobStages = allStages
    .filter(s => s.job_id === interview.job_interview_stage?.job_id)
    .sort((a: any, b: any) => a.order_index - b.order_index);
  const isLastStage = jobStages.length > 0 && jobStages[jobStages.length - 1]?.id === interview.job_interview_stage_id;

  // True when interview was scheduled >30 min ago but no verdict yet
  const isFeedbackOverdue = !interview.verdict && !!interview.scheduled_at &&
    new Date(interview.scheduled_at).getTime() < Date.now() - 30 * 60 * 1000;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'opacity-40 z-50' : ''}`}
    >
      <Card
        className={cn(
          'border cursor-default',
          isBackout ? 'opacity-60 bg-muted/40 border-muted' : 'card-elevated',
          isRejected && !isBackout ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : '',
        )}
        onClick={onCardClick}
      >
        <CardContent className="p-3 space-y-2">
          {/* Status banner for backout/rejected */}
          {isBackout && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-200/80 dark:bg-slate-700/60 -mx-1 -mt-1">
              <UserX className="w-3 h-3 text-slate-500" />
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Withdrawn</span>
            </div>
          )}

          {/* Drag handle + candidate info */}
          <div className="flex items-start gap-2">
            {!isLocked && (
              <div {...attributes} {...listeners} className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            {isLocked && <div className="w-4 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isNewlyApproved && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white leading-none">
                        NEW
                      </span>
                    )}
                    <p className={cn("font-medium text-sm truncate", isBackout && "line-through text-muted-foreground")}>{candidate?.name || 'Unknown'}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{candidate?.role_applied || candidate?.email}</p>
                  {applicationFormStatus && applicationFormStatus !== 'none' && (
                    <div className="mt-1">
                      <ApplicationFormStatusBadge
                        status={applicationFormStatus === 'submitted' ? 'submitted' : 'pending'}
                      />
                    </div>
                  )}
                  {assessmentEnabled && assessmentStatus && assessmentStatus !== 'not_required' && (
                    <div className="mt-1">
                      <AssessmentStatusBadge status={assessmentStatus} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {(interview.candidate as any)?.suitability_score != null && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-semibold px-1.5 py-0',
                        (interview.candidate as any).suitability_score >= 70
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30'
                          : (interview.candidate as any).suitability_score >= 40
                          ? 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30'
                          : 'border-red-300 text-red-600 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-950/30'
                      )}
                    >
                      {(interview.candidate as any).suitability_score}% fit
                    </Badge>
                  )}
                  {interview.overall_score && (
                    <Badge variant="secondary" className="text-xs font-bold">
                      <Star className="w-3 h-3 mr-0.5" /> {interview.overall_score}/5
                    </Badge>
                  )}
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <button className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-sm" onClick={e => e.stopPropagation()}>
                        {assessmentEnabled && onAssignAssessment && (
                          <DropdownMenuItem onClick={onAssignAssessment} className="gap-2">
                            <ClipboardCheck className="w-3.5 h-3.5 text-violet-500" /> Assign Assessment
                          </DropdownMenuItem>
                        )}
                        {isRejected && onReopen && (
                          <DropdownMenuItem onClick={onReopen} className="gap-2">
                            <RefreshCw className="w-3.5 h-3.5 text-blue-500" /> Re-open Candidate
                          </DropdownMenuItem>
                        )}
                        {canAdminAction && (
                          <DropdownMenuItem onClick={onRemove} className="gap-2 text-destructive focus:text-destructive">
                            <UserMinus className="w-3.5 h-3.5" /> Remove from Pipeline
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Job badge */}
          {interview.job && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-6">
              <Briefcase className="w-3 h-3" />
              <span className="truncate">{interview.job.title}</span>
            </div>
          )}

          {/* Verdict */}
          {interview.verdict && (
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ml-6 ${verdictColors[interview.verdict]}`}>
              {VerdictIcon && <VerdictIcon className="w-3 h-3" />}
              {interview.verdict === 'proceeded' ? 'Proceeded' : interview.verdict === 'rejected' ? 'Rejected' : interview.verdict === 'hold' ? 'On Hold' : 'No Show'}
            </div>
          )}

          {/* Assigned recruiter & interviewers */}
          {((recruiter && recruiter.length > 0) || (interviewers && interviewers.length > 0)) && (
            <div className="space-y-0.5 ml-6">
              {recruiter?.map((r, idx) => (
                <p key={idx} className="text-xs text-muted-foreground flex items-center gap-1" title={`Recruiter: ${r.recruiter_name}`}>
                  <Briefcase className="w-3 h-3 shrink-0" /> <span className="font-medium text-foreground">{r.recruiter_name}</span>
                </p>
              ))}
              {interviewers?.map((iv, idx) => (
                <p key={idx} className="text-xs text-muted-foreground flex items-center gap-1" title={`Interviewer: ${iv.interviewer_name}`}>
                  <User className="w-3 h-3 shrink-0" /> {iv.interviewer_name}
                </p>
              ))}
            </div>
          )}

          {/* Feedback interviewer (who gave this specific feedback) */}
          {interview.interviewer && !interviewers?.some(i => i.interviewer_name === interview.interviewer?.full_name) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 ml-6">
              <User className="w-3 h-3" /> {interview.interviewer.full_name}
            </p>
          )}

          {/* Feedback preview */}
          {interview.feedback && (
            <p className="text-xs text-muted-foreground line-clamp-2 italic ml-6">"{interview.feedback}"</p>
          )}

          {/* Scheduled date badge + overdue nudge */}
          {interview.scheduled_at && !interview.verdict && (
            <div className="flex items-center gap-2 ml-6 flex-wrap">
              <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                <CalendarDays className="w-3 h-3" />
                {formatDateTimeInTz(interview.scheduled_at, userTimezone)}
              </span>
              {(interview.panelists?.length || interview.interviewer) && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="w-3 h-3" />
                  {formatPanelistNames(
                    interview.panelists?.length
                      ? interview.panelists
                      : interview.interviewer
                        ? [{ full_name: interview.interviewer.full_name }]
                        : [],
                  )}
                </span>
              )}
              {interview.meeting_link && (
                <a
                  href={interview.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Join
                </a>
              )}
              {isFeedbackOverdue && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 animate-pulse">
                  <AlertTriangle className="w-3 h-3" /> Feedback required
                </span>
              )}
            </div>
          )}

          {/* Actions — hidden for backout/rejected cards */}
          {!isLocked && (
            <div className="flex gap-1.5 pt-1 ml-6 flex-wrap">
              {canManage && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                  <CalendarDays className="w-3 h-3 mr-1" />
                  {interview.scheduled_at ? 'Reschedule' : 'Schedule'}
                </Button>
              )}
              <Button
                size="sm"
                variant={isFeedbackOverdue ? 'default' : 'outline'}
                className={`h-7 text-xs flex-1 ${isFeedbackOverdue ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : ''}`}
                onClick={(e) => { e.stopPropagation(); onFeedback(); }}
              >
                <Star className="w-3 h-3 mr-1" />
                {interview.verdict ? 'Edit Feedback' : 'Feedback'}
              </Button>
              {interview.verdict === 'proceeded' && !interview.advanced_at && canManage && !isLastStage && (
                <Button size="sm" className="h-7 text-xs flex-1 btn-gradient text-primary-foreground" onClick={(e) => { e.stopPropagation(); onAdvance(); }}>
                  <ArrowRight className="w-3 h-3 mr-1" /> Advance
                </Button>
              )}
              {interview.verdict === 'proceeded' && isLastStage && canManage && !isOutOfActivePipeline(interview.candidate) && (
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isMarkingHired}
                  onClick={(e) => { e.stopPropagation(); onMarkHired(); }}
                >
                  <UserCheck className="w-3 h-3 mr-1" /> Mark as Hired
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pending Approval Column ───

function PendingApprovalColumn({
  candidates,
  onApprove,
  onDecline,
  onCardClick,
  isApproving,
  applicationFormStatuses,
}: {
  candidates: any[];
  onApprove: (id: string) => void;
  onDecline: (c: any) => void;
  onCardClick: (c: any) => void;
  isApproving: boolean;
  applicationFormStatuses?: Map<string, 'pending' | 'submitted' | 'none'>;
}) {
  return (
    <div className="w-[300px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Clock className="w-4 h-4 text-violet-500 shrink-0" />
        <h3 className="font-semibold text-sm text-foreground">Pending Approval</h3>
        <Badge variant="secondary" className="text-xs shrink-0">{candidates.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[200px] rounded-lg p-2 bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40">
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No pending candidates</p>
        ) : (
          candidates.map((c: any) => {
            const isDeclined = c.candidate_status === 'rejected';
            return (
              <Card
                key={c.id}
                className={cn(
                  'border bg-background shadow-sm cursor-pointer transition-shadow',
                  isDeclined
                    ? 'border-border opacity-50 cursor-default'
                    : 'border-violet-200/80 dark:border-violet-800/50 hover:shadow-md'
                )}
                onClick={() => !isDeclined && onCardClick(c)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className={cn('font-medium text-sm truncate', isDeclined && 'line-through text-muted-foreground')}>{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.role_applied || c.email}</p>
                      {!isDeclined && c.email && applicationFormStatuses?.get(c.email) && applicationFormStatuses.get(c.email) !== 'none' && (
                        <div className="mt-1">
                          <ApplicationFormStatusBadge
                            status={applicationFormStatuses.get(c.email) === 'submitted' ? 'submitted' : 'pending'}
                          />
                        </div>
                      )}
                      {isDeclined && c.pending_approval_decline_reason && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">
                          "{c.pending_approval_decline_reason}"
                        </p>
                      )}
                    </div>
                    {isDeclined ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 shrink-0 leading-none">
                        Declined
                      </span>
                    ) : c.suitability_score != null && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-semibold px-1.5 py-0 shrink-0',
                          c.suitability_score >= 70
                            ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30'
                            : c.suitability_score >= 40
                            ? 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30'
                            : 'border-red-300 text-red-600 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-950/30'
                        )}
                      >
                        {c.suitability_score}% fit
                      </Badge>
                    )}
                  </div>
                  {!isDeclined && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={isApproving}
                        onClick={(e) => { e.stopPropagation(); onApprove(c.id); }}
                      >
                        <Check className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400"
                        onClick={(e) => { e.stopPropagation(); onDecline(c); }}
                      >
                        <XIcon className="w-3 h-3 mr-1" /> Decline
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Card content for drag overlay ───

function PipelineCardContent({ interview }: { interview: HolisticInterview }) {
  const candidate = interview.candidate;
  return (
    <Card className="card-elevated border shadow-xl">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{candidate?.name || 'Unknown'}</p>
            <p className="text-xs text-muted-foreground truncate">{candidate?.role_applied || candidate?.email}</p>
          </div>
          {interview.overall_score && (
            <Badge variant="secondary" className="text-xs font-bold shrink-0">
              <Star className="w-3 h-3 mr-0.5" /> {interview.overall_score}/5
            </Badge>
          )}
        </div>
        {interview.job && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Briefcase className="w-3 h-3" />
            <span className="truncate">{interview.job.title}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
