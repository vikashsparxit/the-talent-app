export interface ReopenStage {
  id: string;
  order_index: number;
}

export interface ReopenInterviewRow {
  id: string;
  job_interview_stage_id: string;
  verdict?: string | null;
  round?: number | null;
  removed_from_pipeline_at?: string | null;
}

export interface ReopenTarget {
  stageId: string;
  round: number;
}

/**
 * Where a reopened candidate resumes: the stage they were rejected at in their
 * latest round (furthest one if several), else that round's furthest stage.
 * The new round number is one past every existing row, removed ones included.
 */
export function computeReopenTarget(
  stages: ReopenStage[],
  interviews: ReopenInterviewRow[],
): ReopenTarget | null {
  const stageOrder = new Map(stages.map(s => [s.id, s.order_index]));
  const jobRows = interviews.filter(iv => stageOrder.has(iv.job_interview_stage_id));
  const active = jobRows.filter(iv => !iv.removed_from_pipeline_at);
  if (!active.length) return null;

  const latestRound = Math.max(...active.map(iv => iv.round ?? 1));
  const latestRows = active.filter(iv => (iv.round ?? 1) === latestRound);
  const rejected = latestRows.filter(iv => iv.verdict === 'rejected');
  const pool = rejected.length ? rejected : latestRows;
  const target = pool.reduce((best, iv) =>
    stageOrder.get(iv.job_interview_stage_id)! > stageOrder.get(best.job_interview_stage_id)! ? iv : best,
  );

  return {
    stageId: target.job_interview_stage_id,
    round: Math.max(...jobRows.map(iv => iv.round ?? 1)) + 1,
  };
}

export interface BoardRow {
  id: string;
  candidate_id: string;
  job_interview_stage_id: string;
  round?: number | null;
  created_at?: string | null;
}

/**
 * The single row that represents each candidate on the board: latest round
 * first, then furthest stage, then newest created_at, then id.
 */
export function pickBoardRows<T extends BoardRow>(
  rows: T[],
  stageOrder: Map<string, number>,
): Map<string, T> {
  const best = new Map<string, T>();
  const rank = (iv: T) => ({
    round: iv.round ?? 1,
    order: stageOrder.get(iv.job_interview_stage_id) ?? -1,
    ts: iv.created_at ?? '',
  });
  for (const iv of rows) {
    const cur = best.get(iv.candidate_id);
    if (!cur) {
      best.set(iv.candidate_id, iv);
      continue;
    }
    const a = rank(iv);
    const b = rank(cur);
    if (
      a.round > b.round ||
      (a.round === b.round && a.order > b.order) ||
      (a.round === b.round && a.order === b.order && a.ts > b.ts) ||
      (a.round === b.round && a.order === b.order && a.ts === b.ts && iv.id > cur.id)
    ) {
      best.set(iv.candidate_id, iv);
    }
  }
  return best;
}
