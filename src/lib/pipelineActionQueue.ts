import { differenceInDays, format, parseISO } from 'date-fns';
import type { HolisticInterview, JobInterviewStage } from '@/hooks/useInterviewPipeline';

export type PipelineActionId =
  | 'decide'
  | 'pending'
  | 'noshow'
  | 'schedule'
  | 'schedule_push'
  | 'source'
  | 'feedback';

export interface PipelineActionItem {
  id: PipelineActionId;
  /** Short template label, e.g. "Approve 4 pending" */
  label: string;
  count: number;
  cta: string;
  /** When set, selecting this action navigates instead of filtering the board */
  href?: string;
}

export interface PipelineActionJobContext {
  total_openings?: number | null;
  positions_filled?: number | null;
  application_deadline?: string | null;
  created_at?: string | null;
  jobId?: string | null;
}

const FEEDBACK_OVERDUE_MS = 30 * 60 * 1000;
const NEAR_DEADLINE_DAYS = 14;
/** Funnel depth target per remaining opening — shared with Close Plan. */
export const FUNNEL_PER_OPENING = 4;
const SOURCE_BITE_MIN = 3;
const SOURCE_BITE_MAX = 8;
const SCHEDULE_PUSH_CAP = 5;
const THIN_PIPELINE_N = 10;
const MAX_STRIP_ITEMS = 6;

export function isFeedbackOverdueInterview(interview: HolisticInterview, now = Date.now()): boolean {
  return (
    !interview.verdict &&
    !!interview.scheduled_at &&
    new Date(interview.scheduled_at).getTime() < now - FEEDBACK_OVERDUE_MS
  );
}

export function isUnscheduledInterview(interview: HolisticInterview): boolean {
  return !interview.scheduled_at && !interview.verdict;
}

/** Proceeded candidates who still need Advance or Mark Hired. */
export function needsDecideInterview(
  interview: HolisticInterview,
  stages: JobInterviewStage[],
): boolean {
  if (interview.verdict !== 'proceeded') return false;
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const isLastStage =
    sorted.length > 0 && sorted[sorted.length - 1]?.id === interview.job_interview_stage_id;
  if (isLastStage) return true;
  return !interview.advanced_at;
}

export function countPendingApprovalNeedingAction(
  pending: Array<{ candidate_status?: string | null }>,
): number {
  return pending.filter((c) => c.candidate_status !== 'rejected').length;
}

export function isScheduleActionFocus(id: PipelineActionId | null): boolean {
  return id === 'schedule' || id === 'schedule_push';
}

function isHiredCandidate(c: {
  hired_at?: string | null;
  candidate_status?: string | null;
} | null | undefined): boolean {
  if (!c) return false;
  return c.hired_at != null || c.candidate_status === 'shortlisted';
}

function countHiredFromInterviews(interviews: HolisticInterview[]): number {
  const hired = new Set<string>();
  for (const iv of interviews) {
    if (isHiredCandidate(iv.candidate)) hired.add(iv.candidate_id);
  }
  return hired.size;
}

/** Unresolved no-shows still on the board (need reschedule or clear). */
export function countUnresolvedNoShows(boardInterviews: HolisticInterview[]): number {
  return boardInterviews.filter((iv) => iv.verdict === 'no_show').length;
}

/**
 * Clean active funnel depth: non-rejected board + pending needing action,
 * excluding unresolved no-shows (they are not productive funnel depth).
 */
export function countCleanActive(
  boardInterviews: HolisticInterview[],
  pendingCandidates: Array<{ candidate_status?: string | null }>,
): number {
  const activeBoard = boardInterviews.filter(
    (iv) => iv.verdict !== 'rejected' && iv.verdict !== 'no_show',
  ).length;
  return activeBoard + countPendingApprovalNeedingAction(pendingCandidates);
}

export function computeOpeningsLeft(input: {
  total_openings?: number | null;
  positions_filled?: number | null;
  allInterviews?: HolisticInterview[];
}): number {
  const totalOpenings = Math.max(0, input.total_openings ?? 1);
  const hiredFromJob =
    input.positions_filled != null && input.positions_filled >= 0
      ? input.positions_filled
      : countHiredFromInterviews(input.allInterviews ?? []);
  return Math.max(0, totalOpenings - hiredFromJob);
}

/** Bite-size source target from openings gap vs clean active funnel depth. */
export function computeSourceRecommendCount(input: {
  openingsLeft: number;
  activeCount: number;
  nearDeadline: boolean;
}): number {
  if (input.openingsLeft <= 0) return 0;
  const funnelTarget = input.openingsLeft * FUNNEL_PER_OPENING;
  const need = Math.max(0, funnelTarget - input.activeCount);
  if (need <= 0) return 0;
  if (input.nearDeadline) {
    return Math.min(SOURCE_BITE_MAX, Math.max(1, need));
  }
  if (need < SOURCE_BITE_MIN) return need;
  return Math.min(SOURCE_BITE_MAX, need);
}

function formatDeadlineShort(iso: string): string {
  return format(parseISO(iso), 'd MMM');
}

/**
 * Build up to 6 action rows.
 * Priority: decide → pending → schedule/schedule_push → source → feedback.
 */
export function buildPipelineActionQueue(input: {
  boardInterviews: HolisticInterview[];
  stages: JobInterviewStage[];
  pendingCandidates: Array<{ candidate_status?: string | null }>;
  /** All job interviews (incl. hired) — used for hire signal when positions_filled missing */
  allInterviews?: HolisticInterview[];
  job?: PipelineActionJobContext | null;
  now?: number;
}): PipelineActionItem[] {
  const now = input.now ?? Date.now();
  const job = input.job ?? null;
  const decide = input.boardInterviews.filter((iv) =>
    needsDecideInterview(iv, input.stages),
  ).length;
  const pending = countPendingApprovalNeedingAction(input.pendingCandidates);
  const schedule = input.boardInterviews.filter(isUnscheduledInterview).length;
  const feedback = input.boardInterviews.filter((iv) =>
    isFeedbackOverdueInterview(iv, now),
  ).length;

  const openingsLeft = computeOpeningsLeft({
    total_openings: job?.total_openings,
    positions_filled: job?.positions_filled,
    allInterviews: input.allInterviews ?? input.boardInterviews,
  });

  const deadlineIso = job?.application_deadline ?? null;
  const daysToDeadline =
    deadlineIso != null && deadlineIso !== ''
      ? differenceInDays(parseISO(deadlineIso), new Date(now))
      : null;
  const nearDeadline =
    daysToDeadline != null && daysToDeadline >= 0 && daysToDeadline <= NEAR_DEADLINE_DAYS;

  const daysOpen =
    job?.created_at != null && job.created_at !== ''
      ? Math.max(0, differenceInDays(new Date(now), parseISO(job.created_at)))
      : null;

  const cleanActive = countCleanActive(input.boardInterviews, input.pendingCandidates);
  const thinPipeline = cleanActive < THIN_PIPELINE_N;
  const earlyThin = thinPipeline && daysOpen != null && daysOpen < 14;
  const agedThin = thinPipeline && !earlyThin;

  const sourceNeed = computeSourceRecommendCount({
    openingsLeft,
    activeCount: cleanActive,
    nearDeadline,
  });
  const showSource =
    openingsLeft > 0 &&
    sourceNeed > 0 &&
    (thinPipeline || nearDeadline || earlyThin || agedThin || cleanActive < openingsLeft * 3);

  const noShowCount = countUnresolvedNoShows(input.boardInterviews);

  const scheduledAhead = input.boardInterviews.filter(
    (iv) =>
      !!iv.scheduled_at &&
      !iv.verdict &&
      new Date(iv.scheduled_at).getTime() > now,
  ).length;
  const schedulePressure =
    schedule > 0 ||
    (nearDeadline && openingsLeft > 0 && scheduledAhead < openingsLeft);

  const items: PipelineActionItem[] = [];

  if (decide > 0) {
    items.push({
      id: 'decide',
      count: decide,
      cta: 'Review',
      label: decide === 1 ? 'Decide 1' : `Decide ${decide}`,
    });
  }
  if (pending > 0) {
    items.push({
      id: 'pending',
      count: pending,
      cta: 'Approve',
      label: pending === 1 ? 'Approve 1 pending' : `Approve ${pending} pending`,
    });
  }
  if (noShowCount > 0) {
    items.push({
      id: 'noshow',
      count: noShowCount,
      cta: 'Clear',
      label:
        noShowCount === 1
          ? 'Reschedule or clear 1 no-show'
          : `Reschedule or clear ${noShowCount} no-shows`,
    });
  }

  if (schedulePressure && schedule > 0) {
    const pushCount = Math.min(schedule, SCHEDULE_PUSH_CAP);
    if (deadlineIso && daysToDeadline != null && daysToDeadline >= 0) {
      items.push({
        id: 'schedule_push',
        count: pushCount,
        cta: 'Schedule',
        label:
          pushCount === 1
            ? `Align 1 interview before ${formatDeadlineShort(deadlineIso)}`
            : `Align ${pushCount} interviews before ${formatDeadlineShort(deadlineIso)}`,
      });
    } else {
      items.push({
        id: 'schedule',
        count: schedule,
        cta: 'Schedule',
        label:
          schedule === 1 ? 'Schedule 1 this week' : `Schedule ${schedule} this week`,
      });
    }
  }

  if (showSource) {
    const jobId = job?.jobId;
    const href = jobId
      ? `/hiring?view=list&job=${jobId}&action=add`
      : '/hiring?view=list&action=add';
    const label = nearDeadline && deadlineIso
      ? `Add ${sourceNeed} candidates by ${formatDeadlineShort(deadlineIso)}`
      : `Add ${sourceNeed} candidates this week`;
    items.push({
      id: 'source',
      count: sourceNeed,
      cta: 'Add',
      label,
      href,
    });
  }

  if (feedback > 0) {
    items.push({
      id: 'feedback',
      count: feedback,
      cta: 'Chase',
      label: feedback === 1 ? 'Feedback overdue · 1' : `Feedback overdue · ${feedback}`,
    });
  }

  return items.slice(0, MAX_STRIP_ITEMS);
}

export function parsePipelineActionFocus(raw: string | null): PipelineActionId | null {
  if (
    raw === 'decide' ||
    raw === 'pending' ||
    raw === 'noshow' ||
    raw === 'schedule' ||
    raw === 'schedule_push' ||
    raw === 'source' ||
    raw === 'feedback'
  ) {
    return raw;
  }
  return null;
}
