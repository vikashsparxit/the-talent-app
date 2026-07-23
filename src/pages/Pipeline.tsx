import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { useJobs } from '@/hooks/useJobs';
import { useCandidateInterviews, useJobInterviewStages, usePipelineJobCounts, usePendingApprovalCounts } from '@/hooks/useInterviewPipeline';
import { useCandidateAssignees } from '@/hooks/useCandidateAssignees';
import { usePinnedJobs } from '@/hooks/usePinnedJobs';
import { sortActiveJobsThenPaused } from '@/lib/pinnedJobs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { InterviewFeedbackDialog } from '@/components/pipeline/InterviewFeedbackDialog';
import { ScheduleInterviewDialog } from '@/components/pipeline/ScheduleInterviewDialog';
import { StageTemplateManager } from '@/components/pipeline/StageTemplateManager';
import {
  DraggablePipelineCard,
  PendingApprovalColumn,
  PipelineCardContent,
} from '@/components/pipeline/PipelineKanbanCards';
import { PipelineHealthChip } from '@/components/pipeline/PipelineHealthChip';
import { PipelineActionQueue } from '@/components/pipeline/PipelineActionQueue';
import { PipelineRadar } from '@/components/pipeline/PipelineRadar';import {
  DndContext, DragOverlay, closestCenter, pointerWithin, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type CollisionDetection,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import {
  Plus, ChevronRight, Settings2, Pause, Layers,
  Pencil, Trash2, Check, X as XIcon, ChevronLeft, Filter,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openCandidateDetailWithFetch } from '@/lib/candidateDetail';
import {
  buildPipelineActionQueue,
  isFeedbackOverdueInterview,
  isScheduleActionFocus,
  isUnscheduledInterview,
  needsDecideInterview,
  parsePipelineActionFocus,
  type PipelineActionId,
} from '@/lib/pipelineActionQueue';
import { buildPipelineClosePlan } from '@/lib/pipelineClosePlan';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import type { InterviewVerdict, HolisticInterview } from '@/hooks/useInterviewPipeline';
import { applyInterviewSchedule, formatInterviewScheduleError, insertInterviewSessionsAfterVerdict, moveCandidateToStage, type ScheduleInterviewData } from '@/lib/interviewPanelists';
import { notifyStaffEmail } from '@/lib/staffEmail';
import { CandidateDetailDrawer } from '@/components/candidates/CandidateDetailDrawer';
import { InterviewKitDrawer } from '@/components/pipeline/InterviewKitDrawer';
import { useInterviewKitDrawerHost } from '@/hooks/useInterviewKitDrawerHost';
import { useJobApplicationFormStatuses } from '@/hooks/useJobApplicationForm';
import { AssignAssessmentDialog } from '@/components/candidates/AssignAssessmentDialog';
import { useJobAssessmentConfig, usePipelineAssessmentStatuses, type PipelineAssessmentStatus } from '@/hooks/useJobAssessment';
import type { Candidate } from '@/types/database';

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

  const navigate = useNavigate();
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
  const [actionFocus, setActionFocus] = useState<PipelineActionId | null>(
    () => parsePipelineActionFocus(searchParams.get('action')),
  );
  const [showTemplates, setShowTemplates] = useState(false);
  const [feedbackInterview, setFeedbackInterview] = useState<HolisticInterview | null>(null);
  const [scheduleInterview, setScheduleInterview] = useState<HolisticInterview | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isMarkingHired, setIsMarkingHired] = useState(false);
  const [isApprovingPending, setIsApprovingPending] = useState(false);
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
    action?: PipelineActionId | null;
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
      if (updates.action !== undefined) {
        if (updates.action) next.set('action', updates.action);
        else next.delete('action');
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

  const clearActionFocus = useCallback(() => {
    setActionFocus(null);
    setPendingFeedbackOnly(false);
    updatePipelineFilterParams({ action: null, feedback: false });
  }, [updatePipelineFilterParams]);

  const selectActionFocus = useCallback((id: PipelineActionId) => {
    if (id === 'source') {
      const href = activeJobId
        ? `/hiring?view=list&job=${activeJobId}&action=add`
        : '/hiring?view=list&action=add';
      navigate(href);
      return;
    }

    const next = actionFocus === id ||
      (isScheduleActionFocus(actionFocus) && isScheduleActionFocus(id))
      ? null
      : id;
    setActionFocus(next);
    const feedbackOn = next === 'feedback';
    setPendingFeedbackOnly(feedbackOn);
    // Clear verdict filters when focusing an action so the queue isn't masked
    if (next) {
      const urlAction = next === 'schedule_push' ? 'schedule' : next;
      setStatusFilters(new Set());
      updatePipelineFilterParams({
        action: urlAction,
        feedback: feedbackOn,
        verdict: new Set(),
      });
    } else {
      updatePipelineFilterParams({ action: null, feedback: false });
    }
    if (next === 'pending') {
      requestAnimationFrame(() => {
        document.getElementById('pipeline-pending-approval')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'start',
        });
      });
    }
  }, [actionFocus, activeJobId, navigate, updatePipelineFilterParams]);

  const clearPipelineFilters = useCallback(() => {
    setStatusFilters(new Set());
    setFitScoreFilter('all');
    setPendingFeedbackOnly(false);
    setActionFocus(null);
    updatePipelineFilterParams({
      verdict: new Set(),
      fit: 'all',
      feedback: false,
      action: null,
    });
  }, [updatePipelineFilterParams]);

  const activeFilterCount =
    statusFilters.size +
    (fitScoreFilter !== 'all' ? 1 : 0) +
    (pendingFeedbackOnly ? 1 : 0) +
    (actionFocus ? 1 : 0);
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

  /** rejection_reason is not yet on get_job_pipeline_interviews — fetch for Close Plan mix. */
  const { data: rejectionReasons = [] } = useQuery({
    queryKey: ['pipeline-rejection-reasons', activeJobId, selectedJobStages.map((s) => s.id).join(',')],
    enabled: !!activeJobId && selectedJobStages.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const stageIds = selectedJobStages.map((s) => s.id);
      const { data, error } = await supabase
        .from('candidate_interviews')
        .select('rejection_reason')
        .in('job_interview_stage_id', stageIds)
        .eq('verdict', 'rejected');
      if (error) throw error;
      return (data ?? []).map((r) => r.rejection_reason as string | null);
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
    // Pinned order within groups; active jobs first, paused last
    return sortActiveJobsThenPaused(sortJobs(filtered));
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

  /** Best row per candidate for the active job — action counts ignore search/status filters. */
  const boardInterviews = useMemo(() => {
    const stageOrder = new Map(selectedJobStages.map(s => [s.id, s.order_index]));
    const bestRowMap = new Map<string, { stageOrder: number; ts: string; id: string }>();
    interviews.forEach(iv => {
      if (!selectedJobStageIds.has(iv.job_interview_stage_id)) return;
      if (isOutOfActivePipeline(iv.candidate)) return;
      const order = stageOrder.get(iv.job_interview_stage_id) ?? -1;
      const ts = (iv as { created_at?: string }).created_at ?? '';
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
      return bestRowMap.get(iv.candidate_id)?.id === iv.id;
    });
  }, [interviews, selectedJobStages, selectedJobStageIds]);

  const activeJob = useMemo(
    () => availableJobs.find((j: { id: string }) => j.id === activeJobId) ?? null,
    [availableJobs, activeJobId],
  );

  const actionQueueItems = useMemo(
    () =>
      buildPipelineActionQueue({
        boardInterviews,
        stages: selectedJobStages,
        pendingCandidates: pendingCandidates as Array<{ candidate_status?: string | null }>,
        allInterviews: interviews,
        job: activeJob
          ? {
              jobId: activeJob.id,
              total_openings: activeJob.total_openings ?? 1,
              positions_filled: activeJob.positions_filled ?? null,
              application_deadline: activeJob.application_deadline ?? null,
              created_at: activeJob.created_at ?? null,
            }
          : activeJobId
            ? { jobId: activeJobId }
            : null,
      }),
    [boardInterviews, selectedJobStages, pendingCandidates, interviews, activeJob, activeJobId],
  );

  const closePlan = useMemo(
    () =>
      buildPipelineClosePlan({
        boardInterviews,
        stages: selectedJobStages,
        pendingCandidates: pendingCandidates as Array<{
          candidate_status?: string | null;
          suitability_score?: number | null;
        }>,
        allInterviews: interviews,
        rejectionReasons,
        job: activeJob
          ? {
              jobId: activeJob.id,
              total_openings: activeJob.total_openings ?? 1,
              positions_filled: activeJob.positions_filled ?? null,
              application_deadline: activeJob.application_deadline ?? null,
              created_at: activeJob.created_at ?? null,
            }
          : activeJobId
            ? { jobId: activeJobId }
            : null,
      }),
    [
      boardInterviews,
      selectedJobStages,
      pendingCandidates,
      interviews,
      rejectionReasons,
      activeJob,
      activeJobId,
    ],
  );

  const filteredInterviews = useMemo(() => {
    return boardInterviews.filter(iv => {
      if (!matchesPipelineSearch(iv.candidate?.name, iv.candidate?.email, searchQuery)) return false;
      if (!interviewMatchesStatusFilter(iv, statusFilters)) return false;
      if (!matchesFitScoreFilter((iv.candidate as { suitability_score?: number | null })?.suitability_score, fitScoreFilter)) return false;
      if (pendingFeedbackOnly && !interviewNeedsFeedback(iv)) return false;
      if (actionFocus === 'decide' && !needsDecideInterview(iv, selectedJobStages)) return false;
      if (isScheduleActionFocus(actionFocus) && !isUnscheduledInterview(iv)) return false;
      if (actionFocus === 'feedback' && !isFeedbackOverdueInterview(iv)) return false;
      if (actionFocus === 'noshow' && iv.verdict !== 'no_show') return false;
      if (actionFocus === 'pending' || actionFocus === 'source') return false;
      return true;
    });
  }, [
    boardInterviews,
    selectedJobStages,
    searchQuery,
    statusFilters,
    fitScoreFilter,
    pendingFeedbackOnly,
    actionFocus,
  ]);

  const filteredPendingCandidates = useMemo(() => {
    if (pendingFeedbackOnly) return [];
    if (
      actionFocus === 'decide' ||
      isScheduleActionFocus(actionFocus) ||
      actionFocus === 'feedback' ||
      actionFocus === 'source' ||
      actionFocus === 'noshow'
    ) {
      return [];
    }
    return pendingCandidates.filter((c: { name?: string; email?: string; candidate_status?: string; suitability_score?: number | null }) => {
      if (!matchesPipelineSearch(c.name, c.email, searchQuery)) return false;
      if (!pendingMatchesStatusFilter(c, statusFilters)) return false;
      if (!matchesFitScoreFilter(c.suitability_score, fitScoreFilter)) return false;
      return true;
    });
  }, [pendingCandidates, searchQuery, statusFilters, fitScoreFilter, pendingFeedbackOnly, actionFocus]);

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

  const { recruiterMap } = useCandidateAssignees(visibleCandidateIds);

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

  // ─── Pending Approval handlers (RPC — same path for admin/HR/recruiter/interviewer) ───
  const canManage = isAdmin || isAdminOrHR || role === 'recruiter';
  const canApprovePending = canManage || role === 'interviewer';

  const handleApprovePending = async (candidateId: string) => {
    if (!canApprovePending || !user) return;
    setIsApprovingPending(true);
    try {
      const { error } = await supabase.rpc('approve_pending_candidate', {
        p_candidate_id: candidateId,
      });
      if (error) {
        toast({ title: 'Error approving candidate', description: error.message, variant: 'destructive' });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['candidate-interviews', activeJobId] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval', activeJobId] });
      toast({ title: 'Candidate approved', description: 'Moved to first interview stage.' });
    } finally {
      setIsApprovingPending(false);
    }
  };

  const handleDeclinePending = async (candidateId: string) => {
    if (!canApprovePending || !user) return;
    const { error } = await supabase.rpc('decline_pending_candidate', {
      p_candidate_id: candidateId,
      p_reason: declineReason.trim() || null,
    });
    if (error) {
      toast({ title: 'Error declining candidate', description: error.message, variant: 'destructive' });
      return;
    }
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
    if (!canManage) return;
    const iv = filteredInterviews.find(i => i.id === event.active.id);
    setActiveInterview(iv || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveInterview(null);
    const { active, over } = event;
    if (!over || !user || !canManage) return;

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

  const totalInPipeline = filteredInterviews.length + filteredPendingCandidates.length;
  const isActiveJobPaused = activeJob?.status === 'paused';

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
          <div className="flex items-center gap-3 flex-wrap w-full">
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                updatePipelineFilterParams({ q: e.target.value });
              }}
              className="w-full sm:w-[200px]"
            />
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {activeJobId && !isActiveJobPaused && <PipelineHealthChip jobId={activeJobId} />}
              {activeJobId && !isActiveJobPaused && closePlan && (
                <PipelineRadar plan={closePlan} jobTitle={activeJob?.title} />
              )}
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
                        setActionFocus(enabled ? 'feedback' : null);
                        updatePipelineFilterParams({
                          feedback: enabled,
                          action: enabled ? 'feedback' : null,
                        });
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
                <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)} className="gap-1">
                  <Layers className="w-4 h-4" /> Templates
                </Button>
              )}
            </div>
          </div>
        </div>

        {activeJobId && !isActiveJobPaused && actionQueueItems.length > 0 && (
          <PipelineActionQueue
            items={actionQueueItems}
            activeFocus={actionFocus}
            onSelect={selectActionFocus}
            onClear={clearActionFocus}
          />
        )}

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
                    onClick={() => {
                      setActionFocus(null);
                      setPendingFeedbackOnly(false);
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('job', job.id);
                        next.delete('action');
                        next.delete('feedback');
                        return next;
                      }, { replace: true });
                    }}
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
        {isActiveJobPaused && (
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
                <div id="pipeline-pending-approval">
                <PendingApprovalColumn
                  candidates={filteredPendingCandidates}
                  onApprove={handleApprovePending}
                  onDecline={(c: any) => setDeclineConfirm({ id: c.id, name: c.name })}
                  onCardClick={(c: any) => openDrawerCandidate(c)}
                  isApproving={isApprovingPending}
                  canApprove={canApprovePending}
                  applicationFormStatuses={applicationFormStatuses}
                />
                </div>

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
