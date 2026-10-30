import { differenceInDays, format, parseISO } from 'date-fns';
import type { HolisticInterview, JobInterviewStage } from '@/hooks/useInterviewPipeline';
import {
  computeOpeningsLeft,
  computeSourceRecommendCount,
  countCleanActive,
  countUnresolvedNoShows,
  FUNNEL_PER_OPENING,
  type PipelineActionJobContext,
} from '@/lib/pipelineActionQueue';

const NEAR_DEADLINE_DAYS = 14;
const STAGE_SIGNAL_MIN_N = 5;
const REJECTION_MIX_MIN_N = 4;
const REJECTION_MIX_MIN_POPULATED_RATIO = 0.4;
export const HIGH_FIT_THRESHOLD = 70;

const REJECTION_LABELS: Record<string, string> = {
  skill_gap: 'Skill gap',
  culture_fit: 'Culture fit',
  salary_mismatch: 'Salary mismatch',
  communication: 'Communication',
  overqualified: 'Overqualified',
  no_show_final: 'No-show (final)',
  other: 'Other',
};

export interface PipelineClosePlanLine {
  id: string;
  text: string;
}

export interface PipelineClosePlan {
  openingsLeft: number;
  cleanActive: number;
  funnelTarget: number;
  weeklyAdd: number;
  noShowCount: number;
  /** Deadline with relative cue (e.g. "24 Jul (in 4 days)", "24 Jul (today)", "24 Jul (overdue by 2 days)"). */
  deadlineLabel: string | null;
  /** True when deadline is within NEAR_DEADLINE_DAYS (not overdue). */
  nearDeadline: boolean;
  /** True when the application deadline date is in the past. */
  deadlineOverdue: boolean;
  /** True when funnel depth meets target and no volume/strategy signals. */
  healthy: boolean;
  /** Plain-English Radar callout (1–2 sentences). Deterministic — no Gemini. */
  summary: string;
  /** Compact strategy / volume lines for the Radar panel. */
  lines: PipelineClosePlanLine[];
}

/** Cap ~2 sentences; one primary tension; calm ops coach (not Chitra voice). */
function buildPlainSummary(input: {
  openingsLeft: number;
  cleanActive: number;
  funnelTarget: number;
  weeklyAdd: number;
  noShowCount: number;
  daysToDeadline: number | null;
  nearDeadline: boolean;
  deadlineOverdue: boolean;
  healthy: boolean;
  hasShortlist: boolean;
}): string {
  const {
    openingsLeft,
    cleanActive,
    funnelTarget,
    weeklyAdd,
    noShowCount,
    daysToDeadline,
    nearDeadline,
    deadlineOverdue,
    healthy,
    hasShortlist,
  } = input;

  const roleWord = openingsLeft === 1 ? 'role' : 'roles';
  const openingWord = openingsLeft === 1 ? 'opening' : 'openings';
  const peopleWord = cleanActive === 1 ? 'person is' : 'people are';

  // Filled + hygiene
  if (openingsLeft <= 0 && noShowCount > 0) {
    const n = noShowCount;
    return n === 1
      ? 'This role is filled on paper, but 1 no-show still needs a decision so the board stays clean.'
      : `This role is filled on paper, but ${n} no-shows still need a decision so the board stays clean.`;
  }

  if (healthy) {
    return `Depth looks solid: ${cleanActive} ${cleanActive === 1 ? 'person' : 'people'} still in play for about ${funnelTarget} we need. Clear Do before sourcing more.`;
  }

  // Time pressure
  if (deadlineOverdue) {
    const thin = openingsLeft > 0 && cleanActive < funnelTarget;
    return thin
      ? 'The application deadline has passed. Work the people you already have, and only source if the funnel stays thin.'
      : 'The application deadline has passed. Work the people you already have; only source if depth is thin.';
  }

  if (nearDeadline && daysToDeadline != null && daysToDeadline >= 0) {
    const dayCue =
      daysToDeadline === 0
        ? 'Applications close today.'
        : daysToDeadline === 1
          ? 'You have 1 day left on applications.'
          : `You have ${daysToDeadline} days left on applications.`;
    if (weeklyAdd > 0) {
      return `${dayCue} Focus on this week's add and advancing people already in the funnel.`;
    }
    return `${dayCue} Focus on advancing people already in the funnel.`;
  }

  // Depth / volume
  if (openingsLeft > 0 && cleanActive < funnelTarget) {
    const addCue =
      weeklyAdd > 0 ? ' Plan on adding a few this week.' : ' Keep advancing people already in play.';
    return `Only ${cleanActive} ${peopleWord} still in play for ${openingsLeft} ${openingWord} — we usually want about ${funnelTarget}.${addCue}`;
  }

  // Shortlist when depth is OK
  if (hasShortlist && openingsLeft > 0) {
    return 'You have enough people in early stages — prioritize shortlisting the stronger fits before adding volume.';
  }

  // Openings still left, depth OK
  if (openingsLeft > 0) {
    return openingsLeft === 1
      ? "1 role still open. Keep the pipeline moving until it's filled."
      : `${openingsLeft} ${roleWord} still open. Keep the pipeline moving until they're filled.`;
  }

  if (noShowCount > 0) {
    return noShowCount === 1
      ? '1 no-show still needs a decision so the board stays clean.'
      : `${noShowCount} no-shows still need a decision so the board stays clean.`;
  }

  return 'Review Do for next clicks; Radar is weekly volume and funnel strategy.';
}

function formatDeadlineLabel(iso: string, now: number): string {
  const date = parseISO(iso);
  const short = format(date, 'd MMM');
  const days = differenceInDays(date, new Date(now));
  if (days > 0) return `${short} (in ${days} day${days === 1 ? '' : 's'})`;
  if (days === 0) return `${short} (today)`;
  const overdue = Math.abs(days);
  return `${short} (overdue by ${overdue} day${overdue === 1 ? '' : 's'})`;
}

/** Date-only fragment for compact cues (e.g. "by 24 Jul"). */
function formatDeadlineShort(iso: string): string {
  return format(parseISO(iso), 'd MMM');
}

function labelRejectionReason(raw: string): string {
  return REJECTION_LABELS[raw] ?? raw.replace(/_/g, ' ');
}

function isScreeningStage(stage: JobInterviewStage): boolean {
  const n = stage.stage_name.toLowerCase();
  return n.includes('screen') || n.includes('pending') || n === 'l0';
}

function isL1Stage(stage: JobInterviewStage): boolean {
  const n = stage.stage_name.toLowerCase();
  return (
    /\bl\s*1\b/.test(n) ||
    n.includes('round 1') ||
    n.includes('round1') ||
    n.includes('first round') ||
    n.includes('technical 1')
  );
}

/** Stage pass / reject rate from board best-rows with a decided verdict. */
function buildStagePassLine(
  boardInterviews: HolisticInterview[],
  stages: JobInterviewStage[],
): PipelineClosePlanLine | null {
  if (stages.length === 0) return null;
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);

  let from = sorted[0]!;
  let to = sorted[1] ?? null;
  const screening = sorted.find(isScreeningStage);
  const l1 = sorted.find(isL1Stage);
  if (screening && l1 && screening.id !== l1.id) {
    from = screening;
    to = l1;
  } else if (l1 && sorted[0] && l1.id !== sorted[0].id) {
    // Prefer first→L1 when L1 exists later
    to = l1;
  }

  const decided = boardInterviews.filter(
    (iv) =>
      iv.job_interview_stage_id === from.id &&
      (iv.verdict === 'proceeded' || iv.verdict === 'rejected'),
  );
  const n = decided.length;
  if (n === 0) return null;

  if (n < STAGE_SIGNAL_MIN_N) {
    return {
      id: 'stage_pass',
      text: `${from.stage_name}: not enough decisions yet to read pass rate (${n} decided)`,
    };
  }

  const proceeded = decided.filter((iv) => iv.verdict === 'proceeded').length;
  const rejected = n - proceeded;
  const proceedPct = Math.round((proceeded / n) * 100);
  const rejectPct = Math.round((rejected / n) * 100);
  const dest = to ? to.stage_name : 'next';
  return {
    id: 'stage_pass',
    text: `${from.stage_name} → ${dest}: ${proceedPct}% advance / ${rejectPct}% stop (${n} decided)`,
  };
}

function buildRejectionMixLine(
  reasons: Array<string | null | undefined>,
): PipelineClosePlanLine | null {
  const totalRejected = reasons.length;
  if (totalRejected < REJECTION_MIX_MIN_N) return null;
  const populated = reasons.filter((r): r is string => typeof r === 'string' && r.length > 0);
  if (populated.length < REJECTION_MIX_MIN_N) return null;
  if (populated.length / totalRejected < REJECTION_MIX_MIN_POPULATED_RATIO) return null;

  const counts = new Map<string, number>();
  for (const r of populated) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length === 0) return null;
  const parts = top.map(([reason, count]) => `${labelRejectionReason(reason)} ${count}`);
  return {
    id: 'reject_mix',
    text: `Top reject reasons: ${parts.join(', ')}`,
  };
}

function buildShortlistLine(
  boardInterviews: HolisticInterview[],
  stages: JobInterviewStage[],
  pendingCandidates: Array<{ suitability_score?: number | null; candidate_status?: string | null }>,
): PipelineClosePlanLine | null {
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const earlyStageIds = new Set(
    sorted.filter((s, i) => i === 0 || isScreeningStage(s) || isL1Stage(s)).map((s) => s.id),
  );

  type Scored = { score: number | null };
  const pool: Scored[] = [];

  for (const c of pendingCandidates) {
    if (c.candidate_status === 'rejected') continue;
    pool.push({ score: c.suitability_score ?? null });
  }
  for (const iv of boardInterviews) {
    if (!earlyStageIds.has(iv.job_interview_stage_id)) continue;
    if (iv.verdict === 'rejected' || iv.verdict === 'no_show') continue;
    const score =
      (iv.candidate as { suitability_score?: number | null } | undefined)?.suitability_score ?? null;
    pool.push({ score });
  }

  const withFit = pool.filter((p) => p.score != null);
  if (withFit.length === 0) return null;
  const high = withFit.filter((p) => (p.score as number) >= HIGH_FIT_THRESHOLD).length;
  const low = withFit.length - high;
  if (high === 0) {
    return {
      id: 'shortlist',
      text: `Score before shortlist — ${low} below ${HIGH_FIT_THRESHOLD}% fit in early stages`,
    };
  }
  return {
    id: 'shortlist',
    text: `Shortlist ${high} by fit (≥${HIGH_FIT_THRESHOLD}%)${low > 0 ? `; ${low} lower` : ''}`,
  };
}

/**
 * Deterministic Close Plan — weekly/closure strategy from board math.
 * No Gemini. Ops labels + numbers only.
 */
export function buildPipelineClosePlan(input: {
  boardInterviews: HolisticInterview[];
  stages: JobInterviewStage[];
  pendingCandidates: Array<{
    candidate_status?: string | null;
    suitability_score?: number | null;
  }>;
  allInterviews?: HolisticInterview[];
  /** Prefetched rejection_reason values for rejected interviews on this job. */
  rejectionReasons?: Array<string | null | undefined>;
  job?: PipelineActionJobContext | null;
  now?: number;
}): PipelineClosePlan | null {
  const now = input.now ?? Date.now();
  const job = input.job ?? null;
  if (!job?.jobId) return null;

  const openingsLeft = computeOpeningsLeft({
    total_openings: job.total_openings,
    positions_filled: job.positions_filled,
    allInterviews: input.allInterviews ?? input.boardInterviews,
  });

  const cleanActive = countCleanActive(input.boardInterviews, input.pendingCandidates);
  const funnelTarget = openingsLeft * FUNNEL_PER_OPENING;
  const noShowCount = countUnresolvedNoShows(input.boardInterviews);

  const deadlineIso = job.application_deadline ?? null;
  const daysToDeadline =
    deadlineIso != null && deadlineIso !== ''
      ? differenceInDays(parseISO(deadlineIso), new Date(now))
      : null;
  const nearDeadline =
    daysToDeadline != null && daysToDeadline >= 0 && daysToDeadline <= NEAR_DEADLINE_DAYS;
  const deadlineOverdue = daysToDeadline != null && daysToDeadline < 0;

  const weeklyAdd = computeSourceRecommendCount({
    openingsLeft,
    activeCount: cleanActive,
    nearDeadline,
  });

  const lines: PipelineClosePlanLine[] = [];

  const deadlineLabel =
    deadlineIso != null && deadlineIso !== '' ? formatDeadlineLabel(deadlineIso, now) : null;
  const deadlineShort =
    deadlineIso != null && deadlineIso !== '' ? formatDeadlineShort(deadlineIso) : null;

  // Funnel / volume (structured fields drive Radar UI; lines stay for notes fallback)
  if (openingsLeft > 0) {
    lines.push({
      id: 'funnel',
      text: `Openings left ${openingsLeft}; ${cleanActive} still in play (aim ~${funnelTarget})`,
    });
  }

  if (weeklyAdd > 0 && openingsLeft > 0) {
    lines.push({
      id: 'weekly_add',
      text:
        nearDeadline && deadlineShort
          ? `Add ${weeklyAdd} by ${deadlineShort}`
          : `Add ${weeklyAdd} candidates`,
    });
  }

  const stageLine = buildStagePassLine(input.boardInterviews, input.stages);
  if (stageLine) lines.push(stageLine);

  if (noShowCount > 0) {
    lines.push({
      id: 'noshow',
      text:
        noShowCount === 1
          ? '1 no-show stuck — re-engage or clear via Do'
          : `${noShowCount} no-shows stuck — re-engage or clear via Do`,
    });
  }

  const rejectionSource =
    input.rejectionReasons ??
    input.boardInterviews
      .filter((iv) => iv.verdict === 'rejected')
      .map((iv) => iv.rejection_reason);
  const rejectLine = buildRejectionMixLine(rejectionSource);
  if (rejectLine) lines.push(rejectLine);

  const shortlistLine = buildShortlistLine(
    input.boardInterviews,
    input.stages,
    input.pendingCandidates,
  );
  if (shortlistLine) lines.push(shortlistLine);

  const funnelOk = openingsLeft <= 0 || cleanActive >= funnelTarget;
  const strategySignals = lines.filter((l) =>
    l.id !== 'funnel' &&
    !(l.id === 'stage_pass' && l.text.includes('not enough decisions')),
  );
  const healthy = funnelOk && weeklyAdd === 0 && noShowCount === 0 && strategySignals.length === 0;

  // Hide entirely when role is filled and no dirt signals
  if (openingsLeft <= 0 && noShowCount === 0 && strategySignals.length === 0) {
    return null;
  }

  lines.push({
    id: 'do_link',
    text: 'Do = next clicks (Approve / Schedule / Chase). Radar = weekly volume + funnel strategy.',
  });

  const hasShortlist = lines.some((l) => l.id === 'shortlist');
  const summary = buildPlainSummary({
    openingsLeft,
    cleanActive,
    funnelTarget,
    weeklyAdd,
    noShowCount,
    daysToDeadline,
    nearDeadline,
    deadlineOverdue,
    healthy,
    hasShortlist,
  });

  return {
    openingsLeft,
    cleanActive,
    funnelTarget,
    weeklyAdd,
    noShowCount,
    deadlineLabel,
    nearDeadline,
    deadlineOverdue,
    healthy,
    summary,
    lines: healthy
      ? [{ id: 'healthy', text: summary }]
      : lines,
  };
}
