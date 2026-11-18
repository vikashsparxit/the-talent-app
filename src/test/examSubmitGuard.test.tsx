import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const calls: string[] = [];
const submit = vi.fn(async () => {
  calls.push('submit');
  return {};
});
const logIntegrity = vi.fn();
const logIntegrityAsync = vi.fn(async (_args: { event: { type: string } }) => {
  calls.push(`log:${_args.event.type}`);
});
vi.mock('@/hooks/useCandidatePortal', () => ({
  useStartAssessment: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useSaveResponse: () => ({ mutateAsync: vi.fn(async () => ({})) }),
  useSubmitAssessment: () => ({ mutateAsync: submit, isPending: false }),
  useCandidateResponses: () => ({ data: [] }),
  useLogIntegrityEvent: () => ({ mutate: logIntegrity, mutateAsync: logIntegrityAsync }),
  useCreateAssessmentFileUpload: () => ({ mutateAsync: vi.fn() }),
  resolvePortalAccessToken: vi.fn(async () => 'tok'),
}));
vi.mock('@/components/CompanyLogo', () => ({ AssessmentPortalHeader: () => null }));
vi.mock('@/components/portal/CodeEditor', () => ({ CodeEditor: () => null }));
vi.mock('@/components/portal/ExamMediaGate', () => ({
  ExamMediaGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useExamMedia', () => ({
  useExamMedia: () => ({ ready: true, stream: null }),
}));

// Webcam recording double: the test decides what flush resolves to.
const flush = vi.fn<(timeoutMs: number) => Promise<number>>();
const finish = vi.fn(async () => {
  calls.push('finish');
});
let webcamPending = 0;
vi.mock('@/hooks/useWebcamRecording', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useWebcamRecording')>();
  return {
    ...actual,
    useWebcamRecording: () => ({ phase: 'recording', pending: webcamPending, flush, finish }),
  };
});

// Spoken answer double: buttons that report an unsaved / saved take.
vi.mock('@/components/portal/SpokenAnswer', () => ({
  SpokenAnswer: ({ onUnsavedChange }: { onUnsavedChange?: (unsaved: boolean) => void }) => (
    <div>
      <button type="button" onClick={() => onUnsavedChange?.(true)}>record take</button>
      <button type="button" onClick={() => onUnsavedChange?.(false)}>save take</button>
    </div>
  ),
}));

import ExamInterface from '@/components/portal/ExamInterface';
import type { CandidateAssessmentInfo, PortalQuestion } from '@/hooks/useCandidatePortal';
import { AUTO_SUBMIT_FLUSH_TIMEOUT_MS, SUBMIT_FLUSH_TIMEOUT_MS } from '@/hooks/useWebcamRecording';

function question(id: string, type: string, text: string): PortalQuestion {
  return {
    id,
    question_text: text,
    type,
    marks: 5,
    order_index: 0,
    options: null,
    coding_language: null,
    coding_starter_code: null,
    coding_test_cases: null,
    subjective_max_words: null,
    section_id: 's-1',
  } as PortalQuestion;
}

function attempt(overrides: Partial<CandidateAssessmentInfo> = {}): CandidateAssessmentInfo {
  return {
    id: 'ca-1',
    status: 'in_progress',
    started_at: new Date().toISOString(),
    completed_at: null,
    deadline: null,
    total_score: null,
    percentage: null,
    passed: null,
    integrity_log: [],
    candidate: { id: 'c-1', name: 'Asha', email: 'asha@example.com' },
    assessment: {
      id: 'a-1',
      title: 'Backend test',
      description: null,
      duration_minutes: 30,
      settings: {},
      sections: [
        {
          id: 's-1',
          title: 'Basics',
          description: null,
          order_index: 0,
          weightage: 100,
          questions: [question('q-1', 'subjective', 'Explain HTTP caching'), question('q-2', 'spoken', 'Introduce yourself')],
        },
      ],
    },
    ...overrides,
  };
}

function renderExam(info: CandidateAssessmentInfo = attempt()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ExamInterface assessmentInfo={info} accessToken="tok" />, { wrapper });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function openSubmitDialog() {
  await screen.findByText('Explain HTTP caching');
  fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }));
  return screen.findByRole('button', { name: /Submit Now/ });
}

beforeEach(() => {
  calls.length = 0;
  webcamPending = 0;
  submit.mockClear();
  finish.mockClear();
  logIntegrity.mockClear();
  logIntegrityAsync.mockClear();
  flush.mockReset();
  flush.mockResolvedValue(0);
});

describe('exam submit guard', () => {
  it('uploads waiting recording segments before submitting, with a visible uploading state', async () => {
    const flushed = deferred<number>();
    flush.mockReturnValueOnce(flushed.promise);
    renderExam();

    fireEvent.click(await openSubmitDialog());
    expect(flush).toHaveBeenCalledWith(SUBMIT_FLUSH_TIMEOUT_MS);
    expect(await screen.findByText(/Uploading your recording/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Uploading recording/ })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();

    await act(async () => flushed.resolve(0));
    await screen.findByText('Assessment Completed');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['submit', 'finish']);
    expect(logIntegrityAsync).not.toHaveBeenCalled();
  });

  it('warns when segments are still waiting after the flush, and submits once a retry uploads them', async () => {
    flush.mockResolvedValueOnce(4);
    renderExam();

    fireEvent.click(await openSubmitDialog());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/recording is incomplete \(4 parts not saved\)/);
    expect(screen.getByRole('button', { name: /Submit anyway/ })).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await screen.findByText('Assessment Completed');
    expect(flush).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(logIntegrityAsync).not.toHaveBeenCalled();
  });

  it('warns about an unsaved spoken answer and can take the candidate to it', async () => {
    renderExam();
    await screen.findByText('Explain HTTP caching');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'record take' }));
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));

    fireEvent.click(await openSubmitDialog());
    expect(await screen.findByRole('alert')).toHaveTextContent(/spoken answer for question 2 hasn't been saved/);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Go to question 2/ }));
    await screen.findByText('Introduce yourself');
    expect(screen.queryByRole('alert')).toBeNull();

    // Saved: the next submit goes straight through.
    fireEvent.click(screen.getByRole('button', { name: 'save take' }));
    fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Submit Now/ }));
    await screen.findByText('Assessment Completed');
    expect(logIntegrityAsync).not.toHaveBeenCalled();
  });

  it('submit anyway notes the incomplete media for the reviewer, then submits', async () => {
    flush.mockResolvedValue(3);
    webcamPending = 3;
    renderExam();
    await screen.findByText('Explain HTTP caching');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'record take' }));

    fireEvent.click(await openSubmitDialogFromAnyQuestion());
    fireEvent.click(await screen.findByRole('button', { name: /Submit anyway/ }));
    await screen.findByText('Assessment Completed');

    expect(calls).toEqual(['log:media_incomplete_at_submit', 'submit', 'finish']);
    expect(logIntegrityAsync).toHaveBeenCalledWith({
      candidateAssessmentId: 'ca-1',
      accessToken: 'tok',
      event: expect.objectContaining({
        type: 'media_incomplete_at_submit',
        submitted_by: 'candidate',
        pending_segments: 3,
        unsaved_spoken_questions: [2],
      }),
    });
  });

  it('warns and notes segments that were given up, even with nothing left waiting', async () => {
    flush.mockResolvedValue(3);
    webcamPending = 0;
    renderExam();

    fireEvent.click(await openSubmitDialog());
    expect(await screen.findByRole('alert')).toHaveTextContent(/recording is incomplete \(3 parts not saved\)/);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Submit anyway/ }));
    await screen.findByText('Assessment Completed');
    expect(calls).toEqual(['log:media_incomplete_at_submit', 'submit', 'finish']);
    expect(logIntegrityAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ submitted_by: 'candidate', pending_segments: 3, unsaved_spoken_questions: [] }),
      }),
    );
  });

  it('cancelling while uploading does not submit', async () => {
    const flushed = deferred<number>();
    flush.mockReturnValueOnce(flushed.promise);
    renderExam();

    fireEvent.click(await openSubmitDialog());
    await screen.findByText(/Uploading your recording/);
    fireEvent.click(screen.getByRole('button', { name: /Continue Test/ }));
    await act(async () => flushed.resolve(0));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Explain HTTP caching')).toBeInTheDocument();
  });
});

async function openSubmitDialogFromAnyQuestion() {
  fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }));
  return screen.findByRole('button', { name: /Submit Now/ });
}

describe('timer auto-submit', () => {
  const nearlyOver = () =>
    attempt({ started_at: new Date(Date.now() - 30 * 60_000 + 1200).toISOString() });

  it('makes a bounded best-effort flush, then submits', async () => {
    renderExam(nearlyOver());
    await screen.findByText('Assessment Completed', undefined, { timeout: 4000 });
    expect(flush).toHaveBeenCalledWith(AUTO_SUBMIT_FLUSH_TIMEOUT_MS);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(logIntegrityAsync).not.toHaveBeenCalled();
  });

  it('still submits when segments are left after the flush, noting it for the reviewer', async () => {
    flush.mockResolvedValue(2);
    renderExam(nearlyOver());
    await screen.findByText('Assessment Completed', undefined, { timeout: 4000 });
    expect(calls).toEqual(['log:media_incomplete_at_submit', 'submit', 'finish']);
    expect(logIntegrityAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ submitted_by: 'timer', pending_segments: 2, unsaved_spoken_questions: [] }),
      }),
    );
  });

  it('notes segments that were given up when nothing is left waiting', async () => {
    flush.mockResolvedValue(5);
    webcamPending = 0;
    renderExam(nearlyOver());
    await screen.findByText('Assessment Completed', undefined, { timeout: 4000 });
    expect(calls).toEqual(['log:media_incomplete_at_submit', 'submit', 'finish']);
    expect(logIntegrityAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ submitted_by: 'timer', pending_segments: 5, unsaved_spoken_questions: [] }),
      }),
    );
  });

  it('shows that the recording is uploading while the timer submit waits', async () => {
    const flushed = deferred<number>();
    flush.mockReturnValueOnce(flushed.promise);
    renderExam(nearlyOver());
    expect(await screen.findByText(/Time is up\. Uploading your recording/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    await act(async () => flushed.resolve(0));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });
});
