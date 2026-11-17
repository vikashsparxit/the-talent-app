import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CandidateAssessmentStatus } from '@/types/database';

// ── Supabase double: records every query; candidate_assessments rows are in `rows`. ──

type Row = { id: string; status: CandidateAssessmentStatus; deadline: string | null; token_expires_at: string | null };
interface Op {
  kind: 'select' | 'insert' | 'update';
  table: string;
  payload?: Record<string, unknown>;
  filters: [string, string, unknown][];
}

let rows: Row[] = [];
let insertError: { message: string; code?: string } | null = null;
const ops: Op[] = [];

function from(table: string) {
  const op: Op = { kind: 'select', table, filters: [] };
  ops.push(op);
  const result = () => {
    if (op.kind === 'select') return { data: rows, error: null };
    if (op.kind === 'update') return { data: null, error: null };
    if (insertError) return { data: null, error: insertError };
    return { data: { id: 'ca-new', access_token: 'tok-new', status: 'invited', ...op.payload }, error: null };
  };
  const builder = {
    select: () => builder,
    insert: (payload: Record<string, unknown>) => {
      op.kind = 'insert';
      op.payload = payload;
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      op.kind = 'update';
      op.payload = payload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      op.filters.push(['eq', column, value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      op.filters.push(['in', column, value]);
      return builder;
    },
    single: () => Promise.resolve(result()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => from(t) } }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { useCandidateAssessments } from '@/hooks/useCandidates';
import { decideAssessmentAssignment, isDeadInvite } from '@/lib/assessmentAssignment';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const PAST = '2026-11-10T00:00:00Z';
const FUTURE = '2026-11-24T00:00:00Z';

const attempt = (id: string, status: Row['status'], extra: Partial<Row> = {}): Row => ({
  id,
  status,
  deadline: null,
  token_expires_at: null,
  ...extra,
});

// ── Decision (pure) ──────────────────────────────────────────────────────────

describe('decideAssessmentAssignment', () => {
  it('creates a first attempt when there is none', () => {
    expect(decideAssessmentAssignment([], NOW)).toEqual({ outcome: 'create', expireIds: [] });
  });

  it.each(['completed', 'evaluated', 'expired'] as const)('creates a new attempt after a %s one, leaving it alone', (status) => {
    expect(decideAssessmentAssignment([attempt('old', status)], NOW)).toEqual({ outcome: 'create', expireIds: [] });
  });

  it('treats an invite past its deadline or link expiry as expired, and marks it so', () => {
    const pastDeadline = attempt('a', 'invited', { deadline: PAST });
    const linkExpired = attempt('b', 'invited', { deadline: FUTURE, token_expires_at: PAST });
    expect(isDeadInvite(pastDeadline, NOW)).toBe(true);
    expect(isDeadInvite(linkExpired, NOW)).toBe(true);
    expect(decideAssessmentAssignment([attempt('c', 'completed'), pastDeadline, linkExpired], NOW)).toEqual({
      outcome: 'create',
      expireIds: ['a', 'b'],
    });
  });

  it('blocks while an invite can still be started', () => {
    expect(decideAssessmentAssignment([attempt('a', 'invited', { deadline: FUTURE, token_expires_at: FUTURE })], NOW)).toEqual({
      outcome: 'blocked',
      reason: 'invited',
    });
    expect(decideAssessmentAssignment([attempt('a', 'invited')], NOW)).toEqual({ outcome: 'blocked', reason: 'invited' });
  });

  it('blocks while an attempt is in progress, even past its deadline (the server sweep closes it)', () => {
    expect(
      decideAssessmentAssignment([attempt('a', 'completed'), attempt('b', 'in_progress', { deadline: PAST })], NOW),
    ).toEqual({ outcome: 'blocked', reason: 'in_progress' });
  });
});

// ── assignAssessment mutation ────────────────────────────────────────────────

function renderAssign() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCandidateAssessments({ enabled: false }), { wrapper }).result;
}

const assignArgs = { candidate_id: 'cand-1', assessment_id: 'asm-1', deadline: FUTURE, assigned_by: 'hr-1' };

beforeEach(() => {
  rows = [];
  insertError = null;
  ops.length = 0;
  toast.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('assignAssessment (re-assign)', () => {
  it('re-assigning a completed assessment creates a new attempt and leaves the old one untouched', async () => {
    rows = [attempt('ca-old', 'completed')];
    const result = renderAssign();

    const created = await result.current.assignAssessment.mutateAsync(assignArgs);

    expect(created).toMatchObject({ id: 'ca-new', access_token: 'tok-new' });
    expect(ops.map((o) => o.kind)).toEqual(['select', 'insert']);
    expect(ops[0].filters).toEqual([
      ['eq', 'candidate_id', 'cand-1'],
      ['eq', 'assessment_id', 'asm-1'],
    ]);
    expect(ops[1].payload).toMatchObject({ candidate_id: 'cand-1', assessment_id: 'asm-1', assigned_via: 'manual' });
    expect(ops.some((o) => o.kind === 'update')).toBe(false);
    expect(toast).toHaveBeenCalledWith({ title: 'Assessment assigned' });
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('re-assigning an expired assessment creates a new attempt', async () => {
    rows = [attempt('ca-old', 'expired')];
    const result = renderAssign();
    await result.current.assignAssessment.mutateAsync(assignArgs);
    expect(ops.map((o) => o.kind)).toEqual(['select', 'insert']);
  });

  it('an invite past its deadline only has its status set to expired, then a new attempt is created', async () => {
    rows = [attempt('ca-old', 'invited', { deadline: PAST })];
    const result = renderAssign();
    await result.current.assignAssessment.mutateAsync(assignArgs);

    expect(ops.map((o) => o.kind)).toEqual(['select', 'update', 'insert']);
    expect(ops[1].payload).toEqual({ status: 'expired' });
    expect(ops[1].filters).toEqual([
      ['in', 'id', ['ca-old']],
      ['eq', 'status', 'invited'],
    ]);
  });

  it.each([
    ['in_progress', /taking this assessment now/],
    ['invited', /already has an open invitation/],
  ] as const)('re-assigning an open (%s) attempt fails without creating a second one', async (status, message) => {
    rows = [attempt('ca-old', status, { deadline: FUTURE })];
    const result = renderAssign();

    await expect(result.current.assignAssessment.mutateAsync(assignArgs)).rejects.toThrow(message);
    expect(ops.map((o) => o.kind)).toEqual(['select']);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to assign assessment', description: expect.stringMatching(message) }),
    );
  });

  it('a duplicate created meanwhile still reports "already assigned"', async () => {
    insertError = { message: 'duplicate key value violates unique constraint "candidate_assessments_one_open_attempt"', code: '23505' };
    const result = renderAssign();
    await expect(result.current.assignAssessment.mutateAsync(assignArgs)).rejects.toBeTruthy();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'This assessment is already assigned to this candidate' }),
    );
  });
});
