import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { SpokenAnswer } from '@/components/portal/SpokenAnswer';
import { computeIntegrityStats, getIntegrityEventLabel, normalizeIntegrityLog } from '@/lib/integrity';

const CA = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';

// ── Browser doubles ──────────────────────────────────────────────────────────

class FakeTrack extends EventTarget {
  stopped = false;
  readonly kind = 'audio';
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

class FakeRecorder extends EventTarget {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(m: string) {
    return m === 'audio/webm;codecs=opus';
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, opts: { mimeType: string }) {
    super();
    this.mimeType = opts.mimeType;
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(3)]) });
    this.dispatchEvent(new Event('stop'));
  }
}

const getUserMedia = vi.fn();
const fetchMock = vi.fn();

type Body = { action: string; data?: Record<string, unknown>; access_token?: string };
let consented = true;
let uploadFailures = 0;

function route(_fn: string, { body }: { body: Body }) {
  const ok = (data: unknown = {}) => Promise.resolve({ data: { success: true, data }, error: null });
  switch (body.action) {
    case 'consent-status':
      return ok({
        consented,
        consent_version_on_file: consented ? 'v1' : null,
        current: { version: 'v1', company_name: 'Acme', privacy_email: 'p@acme.test', rendered_text: 'Recorded for Acme.' },
      });
    case 'record-consent':
      consented = true;
      return ok({ consented_at: 'now', consent_version: 'v1' });
    case 'spoken-upload-url': {
      const attempt = body.data?.attempt as number;
      return ok({
        recording_id: 'rec-1',
        url: `https://r2.example/put/${attempt}`,
        key: `spoken/${CA}/${Q}/${attempt}.webm`,
        content_type: 'audio/webm',
        seq: attempt,
      });
    }
    case 'chunk-done':
    case 'recording-finish':
    case 'save-response':
      return ok();
    default:
      return Promise.resolve({ data: { success: false, error: 'unexpected' }, error: null });
  }
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(route);
  getUserMedia.mockReset();
  getUserMedia.mockImplementation(() => Promise.resolve(new FakeStream()));
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(uploadFailures-- > 0 ? new Response('', { status: 500 }) : new Response('', { status: 200 })),
  );
  consented = true;
  uploadFailures = 0;
  FakeRecorder.instances = [];
  sessionStorage.clear();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:take');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(
  props: {
    spoken_config?: { max_seconds: number; prep_seconds: number; max_attempts: number };
    response?: unknown;
  } = {},
) {
  const onSaved = vi.fn();
  const onIntegrityEvent = vi.fn();
  const onUnsavedChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <SpokenAnswer
      question={{ id: Q, spoken_config: props.spoken_config ?? { max_seconds: 60, prep_seconds: 0, max_attempts: 1 } }}
      candidateAssessmentId={CA}
      accessToken="link-token"
      response={props.response as never}
      onSaved={onSaved}
      onIntegrityEvent={onIntegrityEvent}
      retryDelaysMs={[0, 0]}
      onUnsavedChange={onUnsavedChange}
    />,
    { wrapper },
  );
  return { onSaved, onIntegrityEvent, onUnsavedChange };
}

const actions = () => invoke.mock.calls.map((c) => (c[1] as { body: Body }).body.action);

async function recordTake() {
  fireEvent.click(await screen.findByRole('button', { name: /start recording|record again/i }));
  await screen.findByText('Recording');
  fireEvent.click(screen.getByRole('button', { name: /stop recording/i }));
  await screen.findByLabelText('Your recording');
}

describe('SpokenAnswer', () => {
  it('records audio, uploads it to the presigned URL and saves the audio response shape', async () => {
    const { onSaved } = setup();
    await recordTake();
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true });
    expect(FakeRecorder.instances[0].mimeType).toBe('audio/webm;codecs=opus');

    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/put/1', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'audio/webm' },
    }));
    expect(actions()).toEqual(['consent-status', 'spoken-upload-url', 'chunk-done', 'recording-finish', 'save-response']);
    const save = invoke.mock.calls.find((c) => c[1].body.action === 'save-response')!;
    expect(save[0]).toBe('candidate-portal');
    expect(save[1].body.access_token).toBe('link-token');
    const response = save[1].body.data.response;
    expect(response).toEqual({
      mode: 'audio',
      file: { key: `spoken/${CA}/${Q}/1.webm`, mime: 'audio/webm', size: 3, duration_seconds: expect.any(Number) },
      attempt: 1,
      transcript_status: 'pending',
    });
    expect(onSaved).toHaveBeenCalledWith(response);
    expect(screen.queryByRole('textbox')).toBeNull(); // no text box
  });

  it('stops by itself at max_seconds', async () => {
    setup({ spoken_config: { max_seconds: 15, prep_seconds: 0, max_attempts: 1 } });
    fireEvent.click(await screen.findByRole('button', { name: /start recording/i }));
    await screen.findByText('Recording');
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start + 16_000);
    await screen.findByLabelText('Your recording', undefined, { timeout: 2000 });
    expect(FakeRecorder.instances[0].state).toBe('inactive');
    expect(screen.getByText(/Your recording \(0:15\)/)).toBeTruthy();
  });

  it('counts down the prep time before recording', async () => {
    setup({ spoken_config: { max_seconds: 60, prep_seconds: 5, max_attempts: 1 } });
    fireEvent.click(await screen.findByRole('button', { name: /start recording/i }));
    expect(screen.getByText('Get ready. Recording starts in')).toBeTruthy();
    expect(FakeRecorder.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /start now/i }));
    await screen.findByText('Recording');
  });

  it('allows re-recording only while attempts remain', async () => {
    setup({ spoken_config: { max_seconds: 60, prep_seconds: 0, max_attempts: 2 } });
    await recordTake();
    expect(screen.getByRole('button', { name: /record again \(1 left\)/i })).toBeTruthy();
    await recordTake();
    expect(screen.queryByRole('button', { name: /record again/i })).toBeNull();

    // The second take is uploaded as attempt 2.
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(actions()).toContain('save-response'));
    const upload = invoke.mock.calls.find((c) => c[1].body.action === 'spoken-upload-url')!;
    expect(upload[1].body.data.attempt).toBe(2);
  });

  it('shows no record button once the saved answer used every attempt', async () => {
    setup({
      response: {
        mode: 'audio',
        file: { key: `spoken/${CA}/${Q}/1.webm`, mime: 'audio/webm', size: 10, duration_seconds: 42 },
        attempt: 1,
        transcript_status: 'pending',
      },
    });
    expect(await screen.findByText(/Answer saved \(0:42, attempt 1 of 1\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /record/i })).toBeNull();
  });

  it('keeps the attempt count when the question is left and reopened', async () => {
    sessionStorage.setItem(`spoken-takes:${CA}:${Q}`, '1');
    setup();
    await screen.findByTestId('spoken-answer');
    expect(screen.queryByRole('button', { name: /start recording/i })).toBeNull();
    expect(screen.getByText('No attempts are left for this question.')).toBeTruthy();
  });

  it('blocks with the microphone help and logs mic_denied when access is denied', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const { onIntegrityEvent } = setup();
    expect(await screen.findByText('Microphone access is blocked')).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start recording/i })).toBeNull();
    expect(onIntegrityEvent).toHaveBeenCalledWith('mic_denied');
    expect(FakeRecorder.instances).toHaveLength(0);

    getUserMedia.mockImplementation(() => Promise.resolve(new FakeStream()));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('button', { name: /start recording/i })).toBeTruthy();
  });

  it('retries a failed upload and then saves', async () => {
    uploadFailures = 1;
    const { onSaved, onIntegrityEvent } = setup();
    await recordTake();
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(actions().filter((a) => a === 'spoken-upload-url')).toHaveLength(2);
    expect(onIntegrityEvent).not.toHaveBeenCalled();
  });

  it('logs recording_upload_failed and offers a retry when every upload try fails', async () => {
    uploadFailures = 3;
    const { onSaved, onIntegrityEvent } = setup();
    await recordTake();
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    expect(await screen.findByText(/Your answer was not saved/)).toBeTruthy();
    expect(onIntegrityEvent).toHaveBeenCalledWith('recording_upload_failed');
    expect(onSaved).not.toHaveBeenCalled();
    expect(actions()).not.toContain('save-response');

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('reports a take as unsaved until it is saved, including after a failed save', async () => {
    uploadFailures = 3;
    const { onSaved, onUnsavedChange } = setup();
    await screen.findByRole('button', { name: /start recording/i });
    expect(onUnsavedChange).not.toHaveBeenCalled(); // nothing reported on mount

    await recordTake();
    expect(onUnsavedChange.mock.calls).toEqual([[true]]);

    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await screen.findByText(/Your answer was not saved/);
    expect(onUnsavedChange.mock.calls).toEqual([[true]]);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onUnsavedChange.mock.calls).toEqual([[true], [false]]);
  });

  it('asks for recording consent first when none is on file', async () => {
    consented = false;
    setup();
    expect(await screen.findByText('Camera and microphone recording')).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
    });
    expect(actions()).toContain('record-consent');
    expect(await screen.findByRole('button', { name: /start recording/i })).toBeTruthy();
  });
});

describe('media integrity signals', () => {
  it('are labelled as such and never counted as tab switches', () => {
    const log = normalizeIntegrityLog([
      { type: 'mic_denied', timestamp: 't1', question_index: 2 },
      { type: 'recording_upload_failed', timestamp: 't2' },
      { type: 'tab_switch', timestamp: 't3' },
    ]);
    expect(log.map((e) => e.type)).toEqual(['mic_denied', 'recording_upload_failed', 'tab_switch']);
    expect(computeIntegrityStats(log)).toEqual({ tabSwitchCount: 1, totalSecondsAway: 0, eventCount: 3, pasteAttempts: 0 });
    expect(getIntegrityEventLabel('mic_denied')).toBe('Microphone blocked');
    expect(getIntegrityEventLabel('camera_denied')).toBe('Camera blocked');
    expect(getIntegrityEventLabel('recording_interrupted')).toBe('Recording interrupted');
    expect(getIntegrityEventLabel('recording_upload_failed')).toBe('Recording upload failed');
  });

  it('keep a submit with incomplete media as its own signal, with its details', () => {
    const [event] = normalizeIntegrityLog([
      {
        type: 'media_incomplete_at_submit',
        timestamp: 't1',
        submitted_by: 'candidate',
        pending_segments: 3,
        unsaved_spoken_questions: [2, 'x', 4],
      },
    ]);
    expect(event).toMatchObject({
      type: 'media_incomplete_at_submit',
      submitted_by: 'candidate',
      pending_segments: 3,
      unsaved_spoken_questions: [2, 4],
    });
    expect(computeIntegrityStats([event]).tabSwitchCount).toBe(0);
    expect(getIntegrityEventLabel('media_incomplete_at_submit')).toBe('Submitted before recording finished uploading');
  });
});
