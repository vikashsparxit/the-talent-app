import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { SpokenAnswerReview } from '@/components/evaluations/SpokenAnswerReview';

const CA = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';
const answer = (over: Record<string, unknown> = {}) => ({
  mode: 'audio',
  file: { key: `spoken/${CA}/${Q}/2.webm`, mime: 'audio/webm', size: 10, duration_seconds: 65 },
  attempt: 2,
  transcript_status: 'pending',
  ...over,
});

function renderReview(responseData: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SpokenAnswerReview candidateAssessmentId={CA} questionId={Q} responseData={responseData} />, { wrapper });
}

const httpError = (status: number, body: Record<string, unknown>) => ({
  data: null,
  error: { message: 'non-2xx', context: new Response(JSON.stringify(body), { status }) },
});

beforeEach(() => invoke.mockReset());

describe('SpokenAnswerReview', () => {
  it('fetches the playback URL only on demand, by attempt + question, and plays it', async () => {
    invoke.mockResolvedValue({
      data: { success: true, data: { recording: {}, urls: [{ seq: 2, bytes: 10, url: 'https://r2.example/get/2' }], expires_in: 600 } },
      error: null,
    });
    renderReview(answer());
    expect(screen.getByText(/Spoken answer · 1:05 · attempt 2/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /load recording/i }));
    const audio = await screen.findByLabelText("Candidate's spoken answer");
    expect(audio.getAttribute('src')).toBe('https://r2.example/get/2');
    expect(invoke).toHaveBeenCalledWith('assessment-media', {
      body: { action: 'playback-urls', data: { candidate_assessment_id: CA, question_id: Q, attempt: 2 } },
    });
  });

  it('shows the server refusal when the viewer has no access (403)', async () => {
    invoke.mockResolvedValue(httpError(403, { error: 'You do not have access to this recording' }));
    renderReview(answer());
    fireEvent.click(screen.getByRole('button', { name: /load recording/i }));
    expect(await screen.findByText('You do not have access to this recording')).toBeTruthy();
    expect(screen.queryByLabelText("Candidate's spoken answer")).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('explains when recording storage is not configured (503)', async () => {
    invoke.mockResolvedValue(httpError(503, { error: 'recording storage not configured', code: 'storage_not_configured' }));
    renderReview(answer());
    fireEvent.click(screen.getByRole('button', { name: /load recording/i }));
    expect(await screen.findByText(/Recording storage is not configured/)).toBeTruthy();
  });

  it('shows a deleted recording as Deleted, not as a load error (410)', async () => {
    invoke.mockResolvedValue(httpError(410, { error: 'This recording has been deleted', code: 'recording_deleted' }));
    renderReview(answer());
    fireEvent.click(screen.getByRole('button', { name: /load recording/i }));
    expect(await screen.findByText(/deleted under the retention policy/)).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(screen.queryByLabelText("Candidate's spoken answer")).toBeNull();
  });

  it('recognises the 410 of a function deployed before the error code was added', async () => {
    invoke.mockResolvedValue(httpError(410, { error: 'This recording has been deleted' }));
    renderReview(answer());
    fireEvent.click(screen.getByRole('button', { name: /load recording/i }));
    expect(await screen.findByText(/deleted under the retention policy/)).toBeTruthy();
  });

  it('shows the transcript, or its pending / failed state', () => {
    const { unmount } = renderReview(answer({ transcript_status: 'done', transcript: 'I would tell the client early.' }));
    expect(screen.getByText('I would tell the client early.')).toBeTruthy();
    expect(screen.getByText('Transcript (AI-generated)')).toBeTruthy();
    unmount();

    const pending = renderReview(answer());
    expect(screen.getByText('Transcription pending.')).toBeTruthy();
    pending.unmount();

    renderReview(answer({ transcript_status: 'failed', transcript_error: 'audio_too_large' }));
    expect(screen.getByText(/Transcription failed: the recording is too large for AI transcription/)).toBeTruthy();
  });

  it('handles a response without a recording', () => {
    renderReview('typed text');
    expect(screen.getByText('No recording submitted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /load recording/i })).toBeNull();
  });
});

describe('EvaluationDetail labels the AI score on spoken answers as advisory', () => {
  const page = readFileSync(path.resolve(__dirname, '../pages/EvaluationDetail.tsx'), 'utf8');

  it('labels the score and feedback and keeps the manual override', () => {
    expect(page).toContain("question.type === 'spoken' ? 'AI suggestion (advisory)' : 'Auto'");
    expect(page).toContain("'AI feedback (advisory)'");
    expect(page).toContain('<SpokenAnswerReview');
    expect(page).toMatch(/gradeableTypes = new Set\(\[[^\]]*'spoken'/);
  });
});
