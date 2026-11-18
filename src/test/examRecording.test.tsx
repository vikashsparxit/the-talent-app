import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const calls: string[] = [];
const startAssessment = vi.fn(async () => {
  calls.push('start');
  return {};
});
const logIntegrity = vi.fn();
vi.mock('@/hooks/useCandidatePortal', () => ({
  useStartAssessment: () => ({ mutateAsync: startAssessment, isPending: false }),
  useSaveResponse: () => ({ mutateAsync: vi.fn(async () => ({})) }),
  useSubmitAssessment: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useCandidateResponses: () => ({ data: [] }),
  useLogIntegrityEvent: () => ({ mutate: logIntegrity, mutateAsync: vi.fn(async () => undefined) }),
  useCreateAssessmentFileUpload: () => ({ mutateAsync: vi.fn() }),
  resolvePortalAccessToken: vi.fn(async () => 'tok'),
}));
vi.mock('@/components/CompanyLogo', () => ({ AssessmentPortalHeader: () => null }));
vi.mock('@/components/portal/CodeEditor', () => ({ CodeEditor: () => null }));

import ExamInterface from '@/components/portal/ExamInterface';
import type { CandidateAssessmentInfo } from '@/hooks/useCandidatePortal';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
import { useWebcamRecording } from '@/hooks/useWebcamRecording';

// ── Browser doubles ──────────────────────────────────────────────────────────

class FakeTrack extends EventTarget {
  stopped = false;
  readyState: 'live' | 'ended' = 'live';
  constructor(readonly kind: 'audio' | 'video') {
    super();
  }
  stop() {
    this.stopped = true;
    this.readyState = 'ended';
  }
  clone() {
    return new FakeTrack(this.kind);
  }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(kinds: ('audio' | 'video')[]) {
    this.tracks = kinds.map((k) => new FakeTrack(k));
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class FakeMediaStream {
  constructor(readonly tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class FakeRecorder extends EventTarget {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(m: string) {
    return m === 'video/webm;codecs=vp8,opus' || m === 'audio/webm;codecs=opus';
  }
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  timeslice: number | undefined;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly stream: FakeMediaStream, opts: { mimeType: string }) {
    super();
    this.mimeType = opts.mimeType;
    FakeRecorder.instances.push(this);
  }
  start(timeslice?: number) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }
  emit(size: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) });
  }
  stop() {
    this.state = 'inactive';
    this.emit(3);
    this.dispatchEvent(new Event('stop'));
  }
}

function stubRecorder() {
  FakeRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('MediaStream', FakeMediaStream);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
}

const getUserMedia = vi.fn();
const domError = (name: string) => Object.assign(new Error(name), { name });

type MediaHandler = (data: Record<string, unknown> | undefined) => unknown;
let mediaHandlers: Record<string, MediaHandler>;

function ok(data: unknown) {
  return { data: { success: true, data }, error: null };
}

const CURRENT_CONSENT = {
  version: 'v-1111111111111111',
  company_name: 'Acme',
  privacy_email: 'privacy@acme.test',
  rendered_text: '## Before you start: this assessment is recorded\n\n- Only the hiring team at Acme can watch.',
};

/** consent-status as the server returns it, for the version on file (null: none). */
function consentStatus(onFile: string | null, current = CURRENT_CONSENT) {
  return { consented: onFile === current.version, consent_version_on_file: onFile, current };
}

beforeEach(() => {
  calls.length = 0;
  invoke.mockReset();
  getUserMedia.mockReset();
  startAssessment.mockClear();
  logIntegrity.mockClear();
  mediaHandlers = {
    'consent-status': () => consentStatus(null),
    'record-consent': () => ({ consented_at: '2026-11-14T10:00:00Z', consent_version: CURRENT_CONSENT.version }),
  };
  invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string; data?: Record<string, unknown> } }) => {
    calls.push(body.action);
    const handler = mediaHandlers[body.action];
    return handler ? ok(handler(body.data)) : ok({});
  });
  getUserMedia.mockImplementation(async () => {
    calls.push('getUserMedia');
    return new FakeStream(['video', 'audio']);
  });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function attempt(overrides: Partial<CandidateAssessmentInfo> = {}): CandidateAssessmentInfo {
  return {
    id: 'ca-1',
    status: 'invited',
    started_at: null,
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
          questions: [
            {
              id: 'q-1',
              question_text: 'Explain HTTP caching',
              type: 'subjective',
              marks: 5,
              order_index: 0,
              options: null,
              coding_language: null,
              coding_starter_code: null,
              coding_test_cases: null,
              subjective_max_words: null,
              section_id: 's-1',
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

function renderExam(info: CandidateAssessmentInfo) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ExamInterface assessmentInfo={info} accessToken="tok" />, { wrapper });
}

// ── Start gate ───────────────────────────────────────────────────────────────

describe('exam start gate', () => {
  it('asks for consent, then camera and microphone, and only then lets the attempt start', async () => {
    renderExam(attempt());

    await screen.findByText(/Camera and microphone recording/);
    expect(screen.getByText('Only the hiring team at Acme can watch.')).toBeInTheDocument();
    expect(screen.queryByText(/draft/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Begin Assessment/ })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /I agree, start/ }));

    const begin = await screen.findByRole('button', { name: /Begin Assessment/ });
    expect(getUserMedia).toHaveBeenCalledWith({ video: expect.any(Object), audio: true });
    expect(invoke).toHaveBeenCalledWith('assessment-media', {
      body: { action: 'record-consent', access_token: 'tok', data: { consent_version: CURRENT_CONSENT.version } },
    });
    expect(startAssessment).not.toHaveBeenCalled();

    fireEvent.click(begin);
    await waitFor(() => expect(startAssessment).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c !== 'consent-status').slice(0, 3)).toEqual(['record-consent', 'getUserMedia', 'start']);
    await screen.findByText('Explain HTTP caching');
  });

  it('skips the consent screen when consent for the current version is on file', async () => {
    mediaHandlers['consent-status'] = () => consentStatus(CURRENT_CONSENT.version);
    renderExam(attempt());
    await screen.findByRole('button', { name: /Begin Assessment/ });
    expect(screen.queryByText(/Camera and microphone recording/)).toBeNull();
    expect(calls).not.toContain('record-consent');
  });

  it('asks again when the consent on file is for an older text', async () => {
    mediaHandlers['consent-status'] = () => consentStatus('v-0000000000000000');
    renderExam(attempt());
    await screen.findByText(/Camera and microphone recording/);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('shows the new text when it changed while the candidate was reading', async () => {
    const updated = { ...CURRENT_CONSENT, version: 'v-2222222222222222', rendered_text: 'Updated wording for Acme candidates.' };
    let current = CURRENT_CONSENT;
    mediaHandlers['consent-status'] = () => consentStatus(null, current);
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (fn: string, opts: { body: { action: string; data?: Record<string, unknown> } }) => {
      if (opts.body.action !== 'record-consent' || opts.body.data?.consent_version === updated.version) return base(fn, opts);
      calls.push('record-consent');
      current = updated;
      const context = new Response(JSON.stringify({ error: 'changed', code: 'consent_text_changed' }), { status: 409 });
      return { data: null, error: { message: 'non-2xx', context } };
    });
    mediaHandlers['record-consent'] = () => ({ consented_at: 'now', consent_version: updated.version });
    renderExam(attempt());

    await screen.findByText('Only the hiring team at Acme can watch.');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /I agree, start/ }));

    await screen.findByText('Updated wording for Acme candidates.');
    expect(screen.getByRole('alert')).toHaveTextContent(/consent text has been updated/);
    // The checkbox resets for the new text.
    expect(screen.getByRole('button', { name: /I agree, start/ })).toBeDisabled();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /I agree, start/ }));
    await screen.findByRole('button', { name: /Begin Assessment/ });
  });

  it('blocks the start when camera or microphone access is denied, with a retry', async () => {
    mediaHandlers['consent-status'] = () => consentStatus(CURRENT_CONSENT.version);
    getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
    renderExam(attempt());

    await screen.findByText('Camera or microphone access is blocked');
    expect(screen.queryByRole('button', { name: /Begin Assessment/ })).toBeNull();
    expect(startAssessment).not.toHaveBeenCalled();
    // Not started yet: a denial before the attempt is not an integrity signal.
    expect(logIntegrity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await screen.findByRole('button', { name: /Begin Assessment/ });
  });

  it('blocks a resumed attempt until the camera is back, and logs a stopped camera as a signal only', async () => {
    mediaHandlers['consent-status'] = () => consentStatus(CURRENT_CONSENT.version);
    const stream = new FakeStream(['video', 'audio']);
    getUserMedia.mockResolvedValueOnce(stream);
    renderExam(attempt({ status: 'in_progress', started_at: new Date().toISOString() }));

    await screen.findByText('Explain HTTP caching');
    expect(startAssessment).not.toHaveBeenCalled(); // resume: the server clock is already running

    act(() => {
      stream.tracks[0].dispatchEvent(new Event('ended'));
    });
    await screen.findByText('Your camera or microphone stopped');
    expect(screen.queryByText('Explain HTTP caching')).toBeNull();
    expect(logIntegrity).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ type: 'camera_stopped' }) }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await screen.findByText('Explain HTTP caching');
  });

  it('does not let the attempt start when recording storage is not configured', async () => {
    invoke.mockImplementation(async () => ({
      data: null,
      error: {
        message: 'non-2xx',
        context: new Response(
          JSON.stringify({ error: 'recording storage not configured', code: 'storage_not_configured' }),
          { status: 503 },
        ),
      },
    }));
    renderExam(attempt());
    await screen.findByText('Recording is not available right now');
    expect(screen.queryByRole('button', { name: /Begin Assessment/ })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

// ── Recorder segments ────────────────────────────────────────────────────────

describe('useMediaRecorder segments', () => {
  beforeEach(stubRecorder);
  afterEach(() => vi.useRealTimers());

  it('records separately playable segments from the given stream without opening the devices', async () => {
    vi.useFakeTimers();
    const source = new FakeStream(['video', 'audio']);
    const onChunk = vi.fn();
    const { result } = renderHook(() =>
      useMediaRecorder({ kind: 'video', segmentMs: 10_000, stream: source as unknown as MediaStream, onChunk }),
    );
    await act(() => result.current.start({ startSeq: 4 }));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(FakeRecorder.instances[0].timeslice).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    await act(() => result.current.stop());

    expect(FakeRecorder.instances).toHaveLength(3); // one recorder (one file) per segment
    expect(onChunk.mock.calls.map(([, seq]) => seq)).toEqual([4, 5, 6]);
    expect(onChunk.mock.calls[0][2]).toEqual({ startedAt: expect.any(Number), endedAt: expect.any(Number) });
    expect(onChunk.mock.calls[0][2].endedAt - onChunk.mock.calls[0][2].startedAt).toBe(10_000);
    // Recording used clones: the exam's own stream keeps running.
    expect(source.tracks.some((t) => t.stopped)).toBe(false);
  });

  it('records only the audio of a shared stream for spoken answers', async () => {
    const source = new FakeStream(['video', 'audio']);
    const { result } = renderHook(() =>
      useMediaRecorder({ kind: 'audio', stream: source as unknown as MediaStream, onChunk: vi.fn() }),
    );
    expect(await act(() => result.current.start())).toBe(true);
    expect(FakeRecorder.instances[0].stream.tracks.map((t) => t.kind)).toEqual(['audio']);
    await act(() => result.current.stop());
    expect(source.tracks.some((t) => t.stopped)).toBe(false);
  });

  it('refuses to record from a stream whose camera has ended', async () => {
    const source = new FakeStream(['video', 'audio']);
    source.tracks[0].stop();
    const { result } = renderHook(() =>
      useMediaRecorder({ kind: 'video', segmentMs: 10_000, stream: source as unknown as MediaStream, onChunk: vi.fn() }),
    );
    expect(await act(() => result.current.start())).toBe(false);
    expect(result.current.problem).toBe('stopped');
  });
});

// ── Webcam recording (upload + resume + finish) ──────────────────────────────

function chunkDoneSeqs() {
  return invoke.mock.calls
    .map(([, { body }]) => body)
    .filter((b: { action: string }) => b.action === 'chunk-done')
    .map((b: { data: { seq: number } }) => b.data.seq);
}

describe('useWebcamRecording', () => {
  beforeEach(() => {
    stubRecorder();
    let nextSeq = 7;
    mediaHandlers['recording-start'] = () => ({ recording_id: 'rec-1', mime: 'video/webm', next_seq: nextSeq, resumed: true });
    mediaHandlers['chunk-url'] = (d) => ({ url: 'https://r2.example/put', key: 'k', content_type: 'video/webm', seq: d?.seq });
    mediaHandlers['chunk-done'] = (d) => {
      nextSeq = Math.max(nextSeq, Number(d?.seq) + 1);
      return { chunk_count: 1 };
    };
    mediaHandlers['recording-finish'] = (d) => ({ status: d?.status });
  });

  const auth = { accessToken: 'tok', candidateAssessmentId: 'ca-1' };

  it('continues the server numbering after a reload, pauses, resumes and finishes', async () => {
    const stream = new FakeStream(['video', 'audio']) as unknown as MediaStream;
    const onSignal = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }) => useWebcamRecording({ auth, stream, active, onSignal, uploadRetryDelaysMs: [0] }),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    expect(invoke).toHaveBeenCalledWith('assessment-media', {
      body: { action: 'recording-start', access_token: 'tok', data: { kind: 'webcam', mime: 'video/webm' } },
    });

    act(() => FakeRecorder.instances[0].emit(5));
    await waitFor(() => expect(chunkDoneSeqs()).toEqual([7]));
    const done = invoke.mock.calls.map(([, { body }]) => body).find((b: { action: string }) => b.action === 'chunk-done');
    expect(done.data).toMatchObject({ recording_id: 'rec-1', bytes: 5, captured_at: expect.any(String), duration_ms: expect.any(Number) });
    expect(fetch).toHaveBeenCalledWith('https://r2.example/put', expect.objectContaining({ method: 'PUT' }));

    // Paused (e.g. the camera gate is up): the last segment is still uploaded.
    rerender({ active: false });
    await waitFor(() => expect(chunkDoneSeqs()).toEqual([7, 8]));
    expect(result.current.phase).toBe('paused');

    // Back: the same recording, numbering carries on.
    rerender({ active: true });
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    act(() => FakeRecorder.instances[FakeRecorder.instances.length - 1].emit(4));
    await waitFor(() => expect(chunkDoneSeqs()).toEqual([7, 8, 9]));

    await act(() => result.current.finish());
    expect(chunkDoneSeqs()).toEqual([7, 8, 9, 10]);
    expect(invoke).toHaveBeenLastCalledWith('assessment-media', {
      body: {
        action: 'recording-finish',
        access_token: 'tok',
        data: { recording_id: 'rec-1', status: 'completed', duration_seconds: expect.any(Number) },
      },
    });
    expect(result.current.phase).toBe('finished');
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('never reuses a seq still queued locally when the server is behind', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const stream = new FakeStream(['video', 'audio']) as unknown as MediaStream;
    const { result, rerender } = renderHook(
      ({ active }) => useWebcamRecording({ auth, stream, active, onSignal: vi.fn(), uploadRetryDelaysMs: [60_000] }),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    act(() => FakeRecorder.instances[0].emit(5)); // seq 7, upload failing
    rerender({ active: false }); // seq 8 queued
    rerender({ active: true });
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    // The server still says next_seq 7; the recorder must continue at 9.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    act(() => FakeRecorder.instances[FakeRecorder.instances.length - 1].emit(6));
    expect(result.current.pending).toBe(3);
    await act(() => result.current.finish());
    expect(chunkDoneSeqs()).toEqual([7, 8, 9, 10]);
  });

  it('flush before submit retries waiting segments and reports how many are still waiting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const stream = new FakeStream(['video', 'audio']) as unknown as MediaStream;
    const { result } = renderHook(() =>
      useWebcamRecording({ auth, stream, active: true, onSignal: vi.fn(), uploadRetryDelaysMs: [60_000] }),
    );
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    act(() => FakeRecorder.instances[0].emit(5));
    act(() => FakeRecorder.instances[0].emit(6));
    await waitFor(() => expect(result.current.pending).toBe(2));

    // Still failing: the flush gives up after its timeout, recording carries on.
    expect(await act(() => result.current.flush(20))).toBe(2);
    expect(result.current.phase).toBe('recording');

    // Connection back: the flush wakes the queue (no 60 s wait) and drains it.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    expect(await act(() => result.current.flush(5000))).toBe(0);
    expect(chunkDoneSeqs()).toEqual([7, 8]);
    expect(invoke.mock.calls.map(([, { body }]) => body.action)).not.toContain('recording-finish');
  });

  it('logs an upload failure signal when a segment is refused', async () => {
    mediaHandlers['chunk-url'] = () => {
      throw new Error('unused');
    };
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string; data?: Record<string, unknown> } }) => {
      if (body.action === 'chunk-url') {
        return {
          data: null,
          error: { message: 'x', context: new Response(JSON.stringify({ error: 'closed', code: 'recording_closed' }), { status: 409 }) },
        };
      }
      return ok(mediaHandlers[body.action]?.(body.data) ?? {});
    });
    const onSignal = vi.fn();
    const stream = new FakeStream(['video', 'audio']) as unknown as MediaStream;
    const { result } = renderHook(() => useWebcamRecording({ auth, stream, active: true, onSignal, uploadRetryDelaysMs: [0] }));
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    act(() => FakeRecorder.instances[0].emit(5));
    await waitFor(() => expect(onSignal).toHaveBeenCalledWith('recording_upload_failed'));
  });

  it('flush before submit counts segments that were given up, not only those still waiting', async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string; data?: Record<string, unknown> } }) => {
      if (body.action === 'chunk-url') {
        return {
          data: null,
          error: { message: 'x', context: new Response(JSON.stringify({ error: 'closed', code: 'recording_closed' }), { status: 409 }) },
        };
      }
      return ok(mediaHandlers[body.action]?.(body.data) ?? {});
    });
    const onSignal = vi.fn();
    const stream = new FakeStream(['video', 'audio']) as unknown as MediaStream;
    const { result } = renderHook(() => useWebcamRecording({ auth, stream, active: true, onSignal, uploadRetryDelaysMs: [0] }));
    await waitFor(() => expect(result.current.phase).toBe('recording'));
    act(() => FakeRecorder.instances[0].emit(5));
    act(() => FakeRecorder.instances[0].emit(6));
    await waitFor(() => expect(onSignal).toHaveBeenCalledWith('recording_upload_failed'));
    await waitFor(() => expect(result.current.pending).toBe(0));

    // Nothing left waiting, but both segments were refused: the recording is incomplete.
    expect(await act(() => result.current.flush(5000))).toBe(2);
  });
});

// ── Exam: recording follows the attempt ──────────────────────────────────────

describe('exam recording', () => {
  beforeEach(() => {
    stubRecorder();
    mediaHandlers['consent-status'] = () => consentStatus(CURRENT_CONSENT.version);
    mediaHandlers['recording-start'] = () => ({ recording_id: 'rec-1', mime: 'video/webm', next_seq: 0, resumed: false });
    mediaHandlers['chunk-url'] = (d) => ({ url: 'https://r2.example/put', key: 'k', content_type: 'video/webm', seq: d?.seq });
    mediaHandlers['chunk-done'] = () => ({ chunk_count: 1 });
    mediaHandlers['recording-finish'] = (d) => ({ status: d?.status });
  });

  it('starts recording only after the attempt starts, and finishes it on submit', async () => {
    renderExam(attempt());
    fireEvent.click(await screen.findByRole('button', { name: /Begin Assessment/ }));
    await screen.findByText('Recording');
    expect(calls.indexOf('start')).toBeLessThan(calls.indexOf('recording-start'));

    fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Submit Now/ }));
    await screen.findByText('Assessment Completed');
    await waitFor(() => expect(calls).toContain('recording-finish'));
    // The final segment was uploaded before the recording was closed.
    expect(calls.indexOf('chunk-done')).toBeLessThan(calls.indexOf('recording-finish'));
  });

  it('finishes the recording when time runs out', async () => {
    const duration = 30 * 60_000;
    renderExam(
      attempt({ status: 'in_progress', started_at: new Date(Date.now() - duration + 1200).toISOString() }),
    );
    await screen.findByText('Recording');
    await screen.findByText('Assessment Completed', undefined, { timeout: 4000 });
    await waitFor(() => expect(calls).toContain('recording-finish'));
  });
});
