import { supabase } from '@/integrations/supabase/client';

/** No duration column on candidate_interviews — assume a 30-minute slot. */
export const DEFAULT_INTERVIEW_DURATION_MINUTES = 30;

/** Half-open interval [start, start + duration). Back-to-back slots do not conflict. */
export function interviewWindowMs(
  scheduledAt: string | Date,
  durationMinutes = DEFAULT_INTERVIEW_DURATION_MINUTES,
): { start: number; end: number } {
  const start = new Date(scheduledAt).getTime();
  return { start, end: start + durationMinutes * 60_000 };
}

/** True when intervals [a, a+dur) and [b, b+dur) intersect (same start → conflict; back-to-back → ok). */
export function interviewsOverlap(
  a: string | Date,
  b: string | Date,
  durationMinutes = DEFAULT_INTERVIEW_DURATION_MINUTES,
): boolean {
  const wa = interviewWindowMs(a, durationMinutes);
  const wb = interviewWindowMs(b, durationMinutes);
  return wa.start < wb.end && wb.start < wa.end;
}

/** IDs of interviews that overlap at least one other interview in the list. */
export function findOverlappingInterviewIds(
  interviews: Array<{ id: string; scheduled_at: string | null }>,
  durationMinutes = DEFAULT_INTERVIEW_DURATION_MINUTES,
): Set<string> {
  const withTime = interviews.filter((iv): iv is { id: string; scheduled_at: string } => !!iv.scheduled_at);
  const conflictIds = new Set<string>();

  for (let i = 0; i < withTime.length; i++) {
    for (let j = i + 1; j < withTime.length; j++) {
      if (interviewsOverlap(withTime[i].scheduled_at, withTime[j].scheduled_at, durationMinutes)) {
        conflictIds.add(withTime[i].id);
        conflictIds.add(withTime[j].id);
      }
    }
  }

  return conflictIds;
}

export interface PanelistScheduleConflict {
  panelistUserId: string;
  panelistName: string;
  conflictingInterviewId: string;
  candidateName: string;
  scheduledAt: string;
  stageName?: string;
}

type ConflictInterviewRow = {
  id: string;
  scheduled_at: string;
  interviewer_user_id: string | null;
  candidate: { name: string | null } | null;
  job_interview_stage: { stage_name: string | null } | null;
};

/**
 * Finds open interviews that overlap `scheduledAt` for any of the given panelists
 * (primary interviewer or candidate_interview_panelists membership).
 */
export async function findPanelistScheduleConflicts(params: {
  panelistUserIds: string[];
  scheduledAt: string;
  excludeInterviewId?: string;
  /** Skip other open rows for this candidate+stage (sibling panelist sessions). */
  excludeCandidateId?: string;
  excludeStageId?: string | null;
  durationMinutes?: number;
}): Promise<PanelistScheduleConflict[]> {
  const {
    panelistUserIds,
    scheduledAt,
    excludeInterviewId,
    excludeCandidateId,
    excludeStageId,
    durationMinutes = DEFAULT_INTERVIEW_DURATION_MINUTES,
  } = params;

  const uniqueIds = [...new Set(panelistUserIds.filter(Boolean))];
  if (uniqueIds.length === 0 || !scheduledAt) return [];

  const durationMs = durationMinutes * 60_000;
  const proposedStart = new Date(scheduledAt).getTime();
  if (Number.isNaN(proposedStart)) return [];

  const proposedEnd = proposedStart + durationMs;
  const rangeStart = new Date(proposedStart - durationMs).toISOString();
  const rangeEnd = new Date(proposedEnd).toISOString();

  const { data: panelRows, error: panelError } = await supabase
    .from('candidate_interview_panelists')
    .select('candidate_interview_id, interviewer_user_id')
    .in('interviewer_user_id', uniqueIds);
  if (panelError) throw panelError;

  const panelInterviewIds = [...new Set((panelRows ?? []).map(r => r.candidate_interview_id))];
  const panelByInterview = new Map<string, string[]>();
  for (const row of panelRows ?? []) {
    const list = panelByInterview.get(row.candidate_interview_id) ?? [];
    list.push(row.interviewer_user_id);
    panelByInterview.set(row.candidate_interview_id, list);
  }

  const orParts = [`interviewer_user_id.in.(${uniqueIds.join(',')})`];
  if (panelInterviewIds.length > 0) {
    orParts.push(`id.in.(${panelInterviewIds.join(',')})`);
  }

  let query = supabase
    .from('candidate_interviews')
    .select(`
      id,
      candidate_id,
      job_interview_stage_id,
      scheduled_at,
      interviewer_user_id,
      candidate:candidates!candidate_interviews_candidate_id_fkey(name),
      job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name)
    `)
    .not('scheduled_at', 'is', null)
    .is('verdict', null)
    .gte('scheduled_at', rangeStart)
    .lte('scheduled_at', rangeEnd)
    .or(orParts.join(','));

  if (excludeInterviewId) {
    query = query.neq('id', excludeInterviewId);
  }

  const { data, error } = await query;
  if (error) throw error;

  type ConflictRow = ConflictInterviewRow & {
    candidate_id: string;
    job_interview_stage_id: string | null;
  };

  const rows = (data ?? []) as unknown as ConflictRow[];
  const overlapping = rows.filter(row => {
    if (!row.scheduled_at) return false;
    if (
      excludeCandidateId
      && row.candidate_id === excludeCandidateId
      && excludeStageId
      && row.job_interview_stage_id === excludeStageId
    ) {
      return false;
    }
    return interviewsOverlap(scheduledAt, row.scheduled_at, durationMinutes);
  });

  if (overlapping.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name, email')
    .in('user_id', uniqueIds);

  const nameByUser = new Map(
    (profiles ?? []).map(p => [p.user_id, (p.full_name || p.email || 'Panelist').trim()]),
  );

  const conflicts: PanelistScheduleConflict[] = [];
  const seen = new Set<string>();

  for (const row of overlapping) {
    const involved = new Set<string>();
    if (row.interviewer_user_id && uniqueIds.includes(row.interviewer_user_id)) {
      involved.add(row.interviewer_user_id);
    }
    for (const uid of panelByInterview.get(row.id) ?? []) {
      if (uniqueIds.includes(uid)) involved.add(uid);
    }

    for (const panelistUserId of involved) {
      const key = `${panelistUserId}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({
        panelistUserId,
        panelistName: nameByUser.get(panelistUserId) || 'Panelist',
        conflictingInterviewId: row.id,
        candidateName: row.candidate?.name?.trim() || 'Unknown candidate',
        scheduledAt: row.scheduled_at,
        stageName: row.job_interview_stage?.stage_name ?? undefined,
      });
    }
  }

  return conflicts;
}

export function summarizeScheduleConflicts(conflicts: PanelistScheduleConflict[]): string {
  if (conflicts.length === 0) return '';
  const lines = conflicts.slice(0, 4).map(c => {
    const stage = c.stageName ? ` (${c.stageName})` : '';
    return `${c.panelistName} already has an interview with ${c.candidateName}${stage}`;
  });
  if (conflicts.length > 4) {
    lines.push(`…and ${conflicts.length - 4} more`);
  }
  return lines.join('\n');
}
