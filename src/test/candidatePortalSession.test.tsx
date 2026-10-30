import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Minimal Supabase double: records function invocations and lets each test
// decide what table writes return.
const invoke = vi.fn();
let tableResult: { data: unknown; error: unknown } = { data: null, error: null };

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'insert', 'eq']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(async () => tableResult);
  c.single = vi.fn(async () => tableResult);
  c.then = (resolve: (v: unknown) => void) => resolve(tableResult);
  return c;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: vi.fn(() => chain()),
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useSaveResponse, useSubmitAssessment } from '@/hooks/useCandidatePortal';
import { PortalError } from '@/lib/assessmentGrading';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  invoke.mockReset();
  tableResult = { data: null, error: null };
});

describe('dashboard (signed-in) submit triggers grading (bug 1)', () => {
  it('calls notify-staff-complete with the attempt token and reports grading pending', async () => {
    tableResult = { data: { access_token: 'tok-123' }, error: null };
    invoke.mockResolvedValue({ data: { success: true, data: { grading_pending: true } }, error: null });

    const { result } = renderHook(() => useSubmitAssessment(), { wrapper });
    const out = await result.current.mutateAsync({ candidateAssessmentId: 'ca-1', accessToken: 'session' });

    expect(invoke).toHaveBeenCalledWith('candidate-portal', {
      body: {
        action: 'notify-staff-complete',
        access_token: 'tok-123',
        data: { candidate_assessment_id: 'ca-1' },
      },
    });
    expect(out).toEqual({ percentage: null, passed: null, grading_pending: true });
  });

  it('still reports the submit as done when the notify call fails', async () => {
    tableResult = { data: { access_token: 'tok-123' }, error: null };
    invoke.mockResolvedValue({ data: null, error: new Error('network') });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useSubmitAssessment(), { wrapper });
    const out = await result.current.mutateAsync({ candidateAssessmentId: 'ca-1', accessToken: 'session' });

    expect(out.grading_pending).toBe(false);
    warn.mockRestore();
  });
});

describe('saving after submit is an error (bug 5)', () => {
  it('link path: surfaces the server code instead of success', async () => {
    const body = { error: 'This assessment has already been submitted', code: 'already_submitted' };
    const context = new Response(JSON.stringify(body), { status: 409 });
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('non-2xx'), { context }) });

    const { result } = renderHook(() => useSaveResponse(), { wrapper });
    const err = await result.current
      .mutateAsync({ candidateAssessmentId: 'ca-1', questionId: 'q-1', response: { text: 'x' }, accessToken: 'tok' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(PortalError);
    expect(err.code).toBe('already_submitted');
    expect(err.message).toBe('This assessment has already been submitted');
  });

  it('dashboard path: maps the database trigger error', async () => {
    tableResult = { data: null, error: { message: 'assessment_already_submitted' } };

    const { result } = renderHook(() => useSaveResponse(), { wrapper });
    const err = await result.current
      .mutateAsync({ candidateAssessmentId: 'ca-1', questionId: 'q-1', response: { text: 'x' }, accessToken: 'session' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(PortalError);
    expect(err.code).toBe('already_submitted');
  });
});
