import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { baseMime, extensionForMime, pickRecorderMime } from '@/lib/mediaMime';
import {
  classifyMediaError,
  detectBrowserFamily,
  mediaEnvironmentProblem,
} from '@/hooks/useMediaPermissions';
import { isCompactDevice, useMediaRecorder, webcamVideoConstraints } from '@/hooks/useMediaRecorder';
import { MediaError, assessmentMediaApi } from '@/hooks/useAssessmentMedia';
import { MediaPermissionGate } from '@/components/portal/MediaPermissionGate';
import { MediaConsentScreen } from '@/components/portal/MediaConsentScreen';

// ── Browser doubles ──────────────────────────────────────────────────────────

class FakeTrack extends EventTarget {
  stopped = false;
  constructor(readonly kind: 'audio' | 'video') {
    super();
  }
  stop() {
    this.stopped = true;
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

class FakeRecorder extends EventTarget {
  static instances: FakeRecorder[] = [];
  static supported = new Set(['video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm;codecs=opus']);
  static isTypeSupported(m: string) {
    return FakeRecorder.supported.has(m);
  }
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  timeslice: number | undefined;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, opts: { mimeType: string }) {
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
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
}

const getUserMedia = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  getUserMedia.mockReset();
  FakeRecorder.instances = [];
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const domError = (name: string) => Object.assign(new Error(name), { name });

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('recorder MIME selection', () => {
  it('prefers WebM and falls back to MP4 for Safari/iOS', () => {
    expect(pickRecorderMime('video', () => true)).toBe('video/webm;codecs=vp8,opus');
    expect(pickRecorderMime('video', (m) => m === 'video/webm')).toBe('video/webm');
    expect(pickRecorderMime('video', (m) => m === 'video/mp4')).toBe('video/mp4');
    expect(pickRecorderMime('audio', (m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMime('audio', (m) => m === 'audio/ogg')).toBe('audio/ogg');
    expect(pickRecorderMime('audio', () => false)).toBeNull();
  });

  it('uses MediaRecorder.isTypeSupported by default, and needs MediaRecorder', () => {
    expect(pickRecorderMime('video')).toBe('video/webm;codecs=vp8,opus');
    vi.stubGlobal('MediaRecorder', undefined);
    expect(pickRecorderMime('video')).toBeNull();
  });

  it('strips codecs and picks file extensions', () => {
    expect(baseMime('video/webm;codecs=vp8,opus')).toBe('video/webm');
    expect(extensionForMime('audio/mp4')).toBe('m4a');
    expect(extensionForMime('video/webm;codecs=vp8')).toBe('webm');
    expect(extensionForMime('text/plain')).toBe('bin');
  });
});

describe('permission problems', () => {
  it('classifies getUserMedia errors', () => {
    expect(classifyMediaError(domError('NotAllowedError'))).toBe('denied');
    expect(classifyMediaError(domError('SecurityError'))).toBe('denied');
    expect(classifyMediaError(domError('NotFoundError'))).toBe('no_device');
    expect(classifyMediaError(domError('OverconstrainedError'))).toBe('no_device');
    expect(classifyMediaError(domError('NotReadableError'))).toBe('in_use');
    expect(classifyMediaError(domError('TypeError'))).toBe('unknown');
    expect(classifyMediaError(null)).toBe('unknown');
  });

  it('detects insecure pages and missing APIs', () => {
    const nav = (mediaDevices: unknown) => ({ mediaDevices }) as Pick<Navigator, 'mediaDevices'>;
    expect(mediaEnvironmentProblem({ isSecureContext: false, navigator: nav({ getUserMedia }) })).toBe('insecure');
    expect(mediaEnvironmentProblem({ isSecureContext: true, navigator: nav(undefined) })).toBe('unsupported');
    expect(mediaEnvironmentProblem({ isSecureContext: true, navigator: nav({ getUserMedia }) })).toBeNull();
  });

  it('picks the right browser help', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
    const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
    const edge = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0';
    const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(detectBrowserFamily(iphone)).toBe('ios_safari');
    expect(detectBrowserFamily(ipad, 5)).toBe('ios_safari');
    expect(detectBrowserFamily(ipad, 0)).toBe('safari_mac');
    expect(detectBrowserFamily(android)).toBe('android_chrome');
    expect(detectBrowserFamily(edge)).toBe('chrome_edge');
    expect(detectBrowserFamily(firefox)).toBe('firefox');
  });

  it('uses a lower video profile on phones', () => {
    const win = (coarse: boolean, width: number) =>
      ({ innerWidth: width, matchMedia: () => ({ matches: coarse }) }) as unknown as Window;
    expect(isCompactDevice(win(true, 1200))).toBe(true);
    expect(isCompactDevice(win(false, 400))).toBe(true);
    expect(isCompactDevice(win(false, 1200))).toBe(false);
    expect(webcamVideoConstraints(true)).toMatchObject({ width: { ideal: 320 }, height: { ideal: 240 } });
    expect(webcamVideoConstraints(false)).toMatchObject({ width: { ideal: 640 }, height: { ideal: 360 } });
  });
});

// ── Components ───────────────────────────────────────────────────────────────

describe('MediaPermissionGate', () => {
  it('renders children with a preview once camera and microphone are granted', async () => {
    getUserMedia.mockResolvedValue(new FakeStream(['video', 'audio']));
    render(<MediaPermissionGate><p>exam content</p></MediaPermissionGate>);
    expect(await screen.findByText('exam content')).toBeInTheDocument();
    expect(screen.getByLabelText('Your camera preview')).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: true, video: expect.any(Object) }));
  });

  it('blocks with help and retries when access is denied', async () => {
    getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
    render(<MediaPermissionGate><p>exam content</p></MediaPermissionGate>);
    expect(await screen.findByText('Camera or microphone access is blocked')).toBeInTheDocument();
    expect(screen.queryByText('exam content')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);

    getUserMedia.mockResolvedValueOnce(new FakeStream(['video', 'audio']));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('exam content')).toBeInTheDocument();
  });

  it('explains a busy or missing device', async () => {
    getUserMedia.mockRejectedValueOnce(domError('NotReadableError'));
    const { unmount } = render(<MediaPermissionGate><p>exam content</p></MediaPermissionGate>);
    expect(await screen.findByText('Camera or microphone is busy')).toBeInTheDocument();
    unmount();
    getUserMedia.mockRejectedValueOnce(domError('NotFoundError'));
    render(<MediaPermissionGate><p>exam content</p></MediaPermissionGate>);
    expect(await screen.findByText('No camera or microphone found')).toBeInTheDocument();
  });

  it('has no retry on an insecure page', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    render(<MediaPermissionGate><p>exam content</p></MediaPermissionGate>);
    expect(await screen.findByText('Secure connection required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('stops the preview stream on unmount', async () => {
    const stream = new FakeStream(['video', 'audio']);
    getUserMedia.mockResolvedValue(stream);
    const { unmount } = render(<MediaPermissionGate><p>exam content</p></MediaPermissionGate>);
    await screen.findByText('exam content');
    unmount();
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });
});

describe('MediaConsentScreen', () => {
  const consent = {
    version: 'v-0123456789abcdef',
    company_name: 'Acme',
    privacy_email: 'privacy@acme.test',
    rendered_text:
      '## Before you start: this assessment is recorded\n\n**Who can watch**\n- The HR/admin team at Acme.\n- Write to **privacy@acme.test** <b>any time</b>.',
  };

  it('shows the configured text, no draft label, and requires the checkbox before accepting', () => {
    const onAccept = vi.fn();
    render(<MediaConsentScreen consent={consent} onAccept={onAccept} />);
    expect(screen.getByRole('heading', { name: 'Before you start: this assessment is recorded' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Who can watch' })).toBeInTheDocument();
    expect(screen.getByText('The HR/admin team at Acme.')).toBeInTheDocument();
    expect(screen.getByText('privacy@acme.test').tagName).toBe('STRONG');
    expect(screen.queryByText(/draft/i)).not.toBeInTheDocument();
    // Markup in the text stays text.
    expect(screen.getByTestId('consent-text').querySelector('b')).toBeNull();
    expect(screen.getByTestId('consent-text').textContent).toContain('<b>any time</b>');

    const button = screen.getByRole('button', { name: /i agree, start/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledWith('v-0123456789abcdef');
  });
});

// ── Recorder ─────────────────────────────────────────────────────────────────

describe('useMediaRecorder', () => {
  it('emits chunks with increasing seq from startSeq, and a final chunk on stop', async () => {
    const stream = new FakeStream(['video', 'audio']);
    getUserMedia.mockResolvedValue(stream);
    const onChunk = vi.fn();
    const { result } = renderHook(() =>
      useMediaRecorder({ kind: 'video', timesliceMs: 10_000, startSeq: 5, onChunk }),
    );

    await act(() => result.current.start());
    expect(result.current.status).toBe('recording');
    expect(result.current.mime).toBe('video/webm;codecs=vp8,opus');
    const rec = FakeRecorder.instances[0];
    expect(rec.timeslice).toBe(10_000);

    act(() => {
      rec.emit(10);
      rec.emit(0); // empty blobs are skipped
      rec.emit(20);
    });
    await act(() => result.current.stop());

    expect(onChunk.mock.calls.map(([blob, seq]) => [blob.size, seq])).toEqual([[10, 5], [20, 6], [3, 7]]);
    expect(result.current.status).toBe('stopped');
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('reports an interruption when a track ends', async () => {
    const stream = new FakeStream(['video', 'audio']);
    getUserMedia.mockResolvedValue(stream);
    const onInterrupted = vi.fn();
    const onChunk = vi.fn();
    const { result } = renderHook(() =>
      useMediaRecorder({ kind: 'video', timesliceMs: 10_000, onChunk, onInterrupted }),
    );
    await act(() => result.current.start());
    act(() => {
      stream.tracks[0].dispatchEvent(new Event('ended'));
    });
    expect(onInterrupted).toHaveBeenCalledWith('track_ended');
    expect(onChunk).toHaveBeenCalledTimes(1); // the recorder flushed what it had
    expect(result.current.status).toBe('stopped');
  });

  it('records audio only for spoken answers', async () => {
    getUserMedia.mockResolvedValue(new FakeStream(['audio']));
    const { result } = renderHook(() => useMediaRecorder({ kind: 'audio', onChunk: vi.fn() }));
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.mime).toBe('audio/webm;codecs=opus');
  });

  it('reports denied permission and unsupported browsers without recording', async () => {
    getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
    const { result } = renderHook(() => useMediaRecorder({ kind: 'video', onChunk: vi.fn() }));
    await act(() => result.current.start());
    expect(result.current.status).toBe('error');
    expect(result.current.problem).toBe('denied');

    FakeRecorder.supported = new Set();
    const other = renderHook(() => useMediaRecorder({ kind: 'audio', onChunk: vi.fn() }));
    await act(() => other.result.current.start());
    expect(other.result.current.problem).toBe('unsupported');
    FakeRecorder.supported = new Set(['video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm;codecs=opus']);
  });

  it('reports unsupported and releases the device when the recorder cannot be created', async () => {
    const stream = new FakeStream(['audio']);
    getUserMedia.mockResolvedValue(stream);
    vi.stubGlobal(
      'MediaRecorder',
      Object.assign(
        function Throwing() {
          throw domError('NotSupportedError');
        },
        { isTypeSupported: () => true },
      ),
    );
    const { result } = renderHook(() => useMediaRecorder({ kind: 'audio', onChunk: vi.fn() }));
    await act(() => result.current.start());
    expect(result.current.status).toBe('error');
    expect(result.current.problem).toBe('unsupported');
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('does not touch the camera until start is called', () => {
    renderHook(() => useMediaRecorder({ kind: 'video', onChunk: vi.fn() }));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it('stops recording and releases the camera on unmount', async () => {
    const stream = new FakeStream(['video', 'audio']);
    getUserMedia.mockResolvedValue(stream);
    const { result, unmount } = renderHook(() => useMediaRecorder({ kind: 'video', onChunk: vi.fn() }));
    await act(() => result.current.start());
    unmount();
    expect(FakeRecorder.instances[0].state).toBe('inactive');
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });
});

// ── Client API ───────────────────────────────────────────────────────────────

describe('assessment-media client', () => {
  it('sends the magic-link token, or the attempt id for signed-in applicants', async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { consented_at: 'x' } }, error: null });
    await assessmentMediaApi.recordConsent({ accessToken: 'tok', candidateAssessmentId: 'ca1' }, 'v1');
    await assessmentMediaApi.recordConsent({ accessToken: 'session', candidateAssessmentId: 'ca1' }, 'v1');
    expect(invoke.mock.calls[0]).toEqual([
      'assessment-media',
      { body: { action: 'record-consent', access_token: 'tok', data: { consent_version: 'v1' } } },
    ]);
    expect(invoke.mock.calls[1][1].body).toEqual({
      action: 'record-consent',
      candidate_assessment_id: 'ca1',
      data: { consent_version: 'v1' },
    });
  });

  it('surfaces server error codes', async () => {
    const context = new Response(JSON.stringify({ error: 'Consent first', code: 'consent_required' }), { status: 409 });
    invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context } });
    const err = await assessmentMediaApi
      .startRecording({ accessToken: 'tok', candidateAssessmentId: 'ca1' }, 'video/webm')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MediaError);
    expect(err).toMatchObject({ message: 'Consent first', code: 'consent_required' });
  });

  it('asks staff playback without any candidate credentials', async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { urls: [] } }, error: null });
    await assessmentMediaApi.playbackUrls('rec1');
    expect(invoke).toHaveBeenCalledWith('assessment-media', {
      body: { action: 'playback-urls', data: { recording_id: 'rec1' } },
    });
  });
});
