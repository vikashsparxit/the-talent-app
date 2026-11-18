import { describe, it, expect } from 'vitest';
import { computeReopenTarget, pickBoardRows, type ReopenInterviewRow } from '@/lib/pipelineReopen';

const STAGES = [
  { id: 'screen', order_index: 0 },
  { id: 'tech', order_index: 1 },
  { id: 'manager', order_index: 2 },
  { id: 'hr', order_index: 3 },
];

let seq = 0;
function row(stage: string, round: number, verdict: string | null = null, extra: Partial<ReopenInterviewRow> = {}): ReopenInterviewRow {
  seq += 1;
  return { id: `iv-${seq}`, job_interview_stage_id: stage, round, verdict, ...extra };
}

describe('computeReopenTarget', () => {
  it('resumes at the stage where a mid-pipeline candidate was rejected', () => {
    const rows = [row('screen', 1, 'proceeded'), row('tech', 1, 'rejected')];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'tech', round: 2 });
  });

  it('uses the latest round when the candidate has been reopened before', () => {
    const rows = [
      row('screen', 1, 'proceeded'),
      row('tech', 1, 'rejected'),
      row('tech', 2, 'proceeded'),
      row('manager', 2, 'rejected'),
    ];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'manager', round: 3 });
  });

  it('handles a legacy round with verdict-less rows at every stage', () => {
    const rows = [
      row('screen', 1, 'proceeded'),
      row('tech', 1, 'rejected'),
      row('screen', 2, 'proceeded'),
      row('tech', 2, 'rejected'),
      row('manager', 2),
      row('hr', 2),
    ];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'tech', round: 3 });
  });

  it('picks the furthest rejected row when several exist in the latest round', () => {
    const rows = [row('screen', 1, 'rejected'), row('manager', 1, 'rejected')];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'manager', round: 2 });
  });

  it('falls back to the furthest row of the latest round when nothing was rejected', () => {
    const rows = [row('screen', 1, 'proceeded'), row('tech', 1, 'hold'), row('screen', 2, 'proceeded'), row('manager', 2, 'no_show')];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'manager', round: 3 });
  });

  it('ignores removed rows for the stage but still counts them for the round number', () => {
    const rows = [
      row('tech', 1, 'rejected'),
      row('hr', 2, 'rejected', { removed_from_pipeline_at: '2026-10-01T00:00:00Z' }),
    ];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'tech', round: 3 });
  });

  it('ignores rows on stages that do not belong to the job', () => {
    const rows = [row('tech', 1, 'rejected'), row('other-job-stage', 5, 'rejected')];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'tech', round: 2 });
  });

  it('treats a missing round as round 1', () => {
    const rows = [{ id: 'a', job_interview_stage_id: 'tech', verdict: 'rejected' }];
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'tech', round: 2 });
  });

  it('returns null when there is no active history', () => {
    expect(computeReopenTarget(STAGES, [])).toBeNull();
    expect(computeReopenTarget(STAGES, [row('tech', 1, 'rejected', { removed_from_pipeline_at: '2026-10-01' })])).toBeNull();
  });
});

describe('pickBoardRows', () => {
  const order = new Map(STAGES.map(s => [s.id, s.order_index]));
  const board = (id: string, stage: string, round: number | undefined, created_at = '2026-10-01T00:00:00Z', candidate_id = 'c1') =>
    ({ id, candidate_id, job_interview_stage_id: stage, round, created_at });

  it('prefers the latest round over a further stage in an older round', () => {
    const rows = [board('r1-hr', 'hr', 1), board('r2-tech', 'tech', 2, '2026-10-05T00:00:00Z')];
    expect(pickBoardRows(rows, order).get('c1')?.id).toBe('r2-tech');
  });

  it('shows the latest round row after a reopen, not the final stage', () => {
    const rows = [board('r1-screen', 'screen', 1), board('r1-tech', 'tech', 1), board('r2-tech', 'tech', 2, '2026-10-05T00:00:00Z')];
    expect(pickBoardRows(rows, order).get('c1')?.id).toBe('r2-tech');
  });

  it('within a round picks the furthest stage, then newest created_at, then id', () => {
    const rows = [
      board('a', 'screen', 2, '2026-10-09T00:00:00Z'),
      board('b', 'manager', 2, '2026-10-01T00:00:00Z'),
      board('c', 'manager', 2, '2026-10-02T00:00:00Z'),
      board('d', 'manager', 2, '2026-10-02T00:00:00Z'),
    ];
    expect(pickBoardRows(rows, order).get('c1')?.id).toBe('d');
  });

  it('treats undefined round as round 1', () => {
    const rows = [board('legacy', 'hr', undefined), board('new', 'screen', 2)];
    expect(pickBoardRows(rows, order).get('c1')?.id).toBe('new');
  });

  it('keeps one row per candidate', () => {
    const rows = [board('x', 'tech', 1, undefined, 'c1'), board('y', 'hr', 1, undefined, 'c2')];
    const picked = pickBoardRows(rows, order);
    expect(picked.get('c1')?.id).toBe('x');
    expect(picked.get('c2')?.id).toBe('y');
  });
});

// Row-level models of what the client reopen and advance_candidate_stage() write.
// fixedAdvance mirrors 20261027000002; oldAdvance mirrors 20260924000001.
describe('reopen -> advance -> reopen', () => {
  interface Row {
    id: string;
    candidate_id: string;
    job_interview_stage_id: string;
    round: number;
    verdict: string | null;
    created_at: string;
    advanced_at: string | null;
    removed_from_pipeline_at: string | null;
  }

  const order = new Map(STAGES.map(s => [s.id, s.order_index]));
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 9, 1) + ++clock * 60_000).toISOString();
  const make = (stage: string, round: number, verdict: string | null = null): Row => {
    seq += 1;
    return {
      id: `ci-${String(seq).padStart(4, '0')}`,
      candidate_id: 'c1',
      job_interview_stage_id: stage,
      round,
      verdict,
      created_at: tick(),
      advanced_at: null,
      removed_from_pipeline_at: null,
    };
  };

  const reopen = (rows: Row[]): Row[] => {
    const target = computeReopenTarget(STAGES, rows)!;
    return [...rows, make(target.stageId, target.round)];
  };

  const fixedAdvance = (rows: Row[], from: string, to: string): Row[] => {
    const advancing = rows
      .filter(r => r.job_interview_stage_id === from && !r.removed_from_pipeline_at)
      .sort((a, b) => b.round - a.round || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    const now = tick();
    const next = rows.map(r => (r.id === advancing.id ? { ...r, advanced_at: now } : r));
    const open = next.some(
      r => r.job_interview_stage_id === to && r.round === advancing.round && !r.removed_from_pipeline_at && !r.verdict && !r.advanced_at,
    );
    return open ? next : [...next, make(to, advancing.round)];
  };

  const oldAdvance = (rows: Row[], from: string, to: string): Row[] => {
    const now = tick();
    return [...rows.map(r => (r.job_interview_stage_id === from ? { ...r, advanced_at: now } : r)), make(to, 1)];
  };

  const setVerdict = (rows: Row[], verdict: string): Row[] => {
    const current = pickBoardRows(rows, order).get('c1')!;
    return rows.map(r => (r.id === current.id ? { ...r, verdict } : r));
  };

  const boardRow = (rows: Row[]) => pickBoardRows(rows, order).get('c1')!;

  // Round 1: screen proceeded + advanced, rejected at tech.
  const roundOne = (): Row[] => {
    let rows = [make('screen', 1, 'proceeded')];
    rows = fixedAdvance(rows, 'screen', 'tech');
    return setVerdict(rows, 'rejected');
  };

  it('advance after a reopen stays in the reopened round and moves the board', () => {
    let rows = reopen(roundOne());
    expect(boardRow(rows)).toMatchObject({ job_interview_stage_id: 'tech', round: 2 });

    rows = setVerdict(rows, 'proceeded');
    const before = rows.filter(r => r.round === 1).map(r => ({ ...r }));
    rows = fixedAdvance(rows, 'tech', 'manager');

    expect(boardRow(rows)).toMatchObject({ job_interview_stage_id: 'manager', round: 2, verdict: null });
    expect(rows.filter(r => r.round === 1)).toEqual(before);
    expect(rows.filter(r => r.job_interview_stage_id === 'tech' && r.advanced_at).map(r => r.round)).toEqual([2]);
  });

  it('second reopen resumes where round 2 stopped, in round 3', () => {
    let rows = reopen(roundOne());
    rows = setVerdict(rows, 'proceeded');
    rows = fixedAdvance(rows, 'tech', 'manager');
    rows = setVerdict(rows, 'rejected');

    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'manager', round: 3 });
    rows = reopen(rows);
    expect(boardRow(rows)).toMatchObject({ job_interview_stage_id: 'manager', round: 3, verdict: null });
  });

  it('a repeated advance does not add a second next-stage row', () => {
    let rows = reopen(roundOne());
    rows = setVerdict(rows, 'proceeded');
    rows = fixedAdvance(rows, 'tech', 'manager');
    const count = rows.length;
    rows = fixedAdvance(rows, 'tech', 'manager');
    expect(rows).toHaveLength(count);
  });

  it('old advance data: board stuck at the from-stage and second reopen picks the wrong stage', () => {
    let rows = reopen(roundOne());
    rows = setVerdict(rows, 'proceeded');
    rows = oldAdvance(rows, 'tech', 'manager');

    // The new manager row landed in round 1, so round 2's tech row still wins.
    expect(boardRow(rows)).toMatchObject({ job_interview_stage_id: 'tech', round: 2 });
    // Round 1's tech row was stamped as advanced too.
    expect(rows.filter(r => r.job_interview_stage_id === 'tech' && r.advanced_at).map(r => r.round)).toEqual([1, 2]);

    // Rejected at manager (the round-1 row), then reopened: resumes at tech, not manager.
    rows = rows.map(r => (r.job_interview_stage_id === 'manager' ? { ...r, verdict: 'rejected' } : r));
    expect(computeReopenTarget(STAGES, rows)).not.toEqual({ stageId: 'manager', round: 3 });
    expect(computeReopenTarget(STAGES, rows)).toEqual({ stageId: 'tech', round: 3 });
  });
});
