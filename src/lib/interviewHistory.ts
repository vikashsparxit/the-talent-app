export interface InterviewHistoryRow {
  id: string;
  stage_name_snapshot?: string | null;
  job_interview_stage?: { stage_name?: string | null } | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  verdict?: string | null;
}

export function interviewStageDisplayName(row: InterviewHistoryRow): string {
  return (
    row.stage_name_snapshot?.trim()
    || row.job_interview_stage?.stage_name?.trim()
    || 'Unknown Stage'
  );
}

function interviewHistorySortTime(row: InterviewHistoryRow): number {
  const raw = row.completed_at || row.scheduled_at || row.created_at;
  return raw ? new Date(raw).getTime() : 0;
}

export type InterviewHistoryEntry = InterviewHistoryRow & { displayRound: number };

/** Chronological session rounds: Round 1, Round 2, … even when stage name repeats. */
export function buildInterviewHistoryRounds(
  rows: InterviewHistoryRow[],
): Map<number, InterviewHistoryEntry[]> {
  const sorted = [...rows].sort(
    (a, b) => interviewHistorySortTime(a) - interviewHistorySortTime(b),
  );

  const roundMap = new Map<number, InterviewHistoryEntry[]>();
  sorted.forEach((row, index) => {
    const displayRound = index + 1;
    const entry = { ...row, displayRound };
    if (!roundMap.has(displayRound)) roundMap.set(displayRound, []);
    roundMap.get(displayRound)!.push(entry);
  });

  return roundMap;
}
