import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invoke = vi.fn();
let recordingRows: unknown[] = [];
const from = vi.fn((_table: string) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: async () => ({ data: recordingRows, error: null }),
  };
  return chain;
});
let retentionEnabled = false;
const rpc = vi.fn(async (_fn: string) => ({ data: retentionEnabled, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: (t: string) => from(t),
    rpc: (fn: string) => rpc(fn),
  },
}));

import { RecordingReview } from '@/components/evaluations/RecordingReview';
import { buildPlaylist, formatOffset, locateInPlaylist } from '@/lib/recordingPlaylist';
import type { IntegrityEvent } from '@/types/database';

const T0 = Date.parse('2026-11-14T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('recording playlist', () => {
  const sources = [
    { seq: 2, url: 'u2', bytes: 1, captured_at: iso(T0 + 40_000), duration_ms: 10_000 }, // after a 20 s gap
    { seq: 0, url: 'u0', bytes: 1, captured_at: iso(T0), duration_ms: 10_000 },
    { seq: 1, url: 'u1', bytes: 1, captured_at: iso(T0 + 10_000), duration_ms: 10_000 },
  ];

  it('orders segments by seq and places them on one timeline', () => {
    const p = buildPlaylist(sources, iso(T0 - 2000));
    expect(p.map((s) => s.url)).toEqual(['u0', 'u1', 'u2']);
    expect(p.map((s) => s.offsetSeconds)).toEqual([0, 10, 40]);
  });

  it('estimates times for segments without browser timing', () => {
    const p = buildPlaylist(
      [
        { seq: 1, url: 'b', bytes: 1 },
        { seq: 0, url: 'a', bytes: 1 },
      ],
      iso(T0),
    );
    expect(p.map((s) => [s.url, s.offsetSeconds, s.durationSeconds])).toEqual([
      ['a', 0, 10],
      ['b', 10, 10],
    ]);
  });

  it('finds the segment and position of a moment, gaps and outside times', () => {
    const p = buildPlaylist(sources, iso(T0));
    expect(locateInPlaylist(p, iso(T0 + 12_500))).toEqual({ index: 1, seekSeconds: 2.5, inGap: false });
    expect(locateInPlaylist(p, iso(T0 + 30_000))).toEqual({ index: 2, seekSeconds: 0, inGap: true });
    expect(locateInPlaylist(p, iso(T0 - 60_000))).toBeNull();
    expect(locateInPlaylist(p, iso(T0 + 120_000))).toBeNull();
    expect(locateInPlaylist(p, 'garbage')).toBeNull();
    expect(locateInPlaylist([], iso(T0))).toBeNull();
  });

  it('formats offsets', () => {
    expect(formatOffset(75)).toBe('1:15');
    expect(formatOffset(3725)).toBe('1:02:05');
    expect(formatOffset(-3)).toBe('0:00');
  });
});

// ── Component ────────────────────────────────────────────────────────────────

const recording = {
  id: 'rec-1',
  status: 'completed',
  mime: 'video/webm',
  chunk_count: 3,
  bytes: 3 * 1024 * 1024,
  duration_seconds: 30,
  started_at: iso(T0),
  ended_at: iso(T0 + 30_000),
  retention_until: null,
  deleted_at: null,
};

function renderReview(events: IntegrityEvent[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<RecordingReview candidateAssessmentId="ca-1" integrityEvents={events} />, { wrapper });
}

function playbackOk() {
  invoke.mockResolvedValue({
    data: {
      success: true,
      data: {
        recording: { ...recording, kind: 'webcam', question_id: null },
        urls: [
          { seq: 1, bytes: 1, url: 'https://r2.example/1', captured_at: iso(T0 + 10_000), duration_ms: 10_000 },
          { seq: 0, bytes: 1, url: 'https://r2.example/0', captured_at: iso(T0), duration_ms: 10_000 },
          { seq: 2, bytes: 1, url: 'https://r2.example/2', captured_at: iso(T0 + 20_000), duration_ms: 10_000 },
        ],
        expires_in: 600,
      },
    },
    error: null,
  });
}

function playbackFails(status: number, body: Record<string, unknown>) {
  invoke.mockResolvedValue({
    data: null,
    error: { message: 'non-2xx', context: new Response(JSON.stringify(body), { status }) },
  });
}

beforeEach(() => {
  invoke.mockReset();
  from.mockClear();
  rpc.mockClear();
  recordingRows = [recording];
  retentionEnabled = false;
});

describe('RecordingReview', () => {
  it('labels the recording as evidence for human review and shows its status', async () => {
    renderReview();
    await screen.findByText('Completed');
    expect(screen.getByText(/Evidence for human review only/)).toBeTruthy();
    expect(screen.getByText('3 segments')).toBeTruthy();
    expect(from).toHaveBeenCalledWith('assessment_recordings');
    // URLs are only asked for on demand.
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shows Not recorded when there is no recording', async () => {
    recordingRows = [];
    renderReview();
    await screen.findByText('Not recorded');
  });

  it('plays segments in seq order, moving on when one ends', async () => {
    playbackOk();
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Load recording/ }));
    const video = (await screen.findByLabelText('Assessment recording')) as HTMLVideoElement;
    expect(invoke).toHaveBeenCalledWith('assessment-media', {
      body: { action: 'playback-urls', data: { recording_id: 'rec-1' } },
    });
    expect(video.getAttribute('src')).toBe('https://r2.example/0');

    fireEvent.ended(video);
    expect((screen.getByLabelText('Assessment recording') as HTMLVideoElement).getAttribute('src')).toBe(
      'https://r2.example/1',
    );
    fireEvent.ended(screen.getByLabelText('Assessment recording'));
    expect(screen.getByLabelText('Assessment recording').getAttribute('src')).toBe('https://r2.example/2');
    expect(screen.getByText(/Segment 3 of 3/)).toBeTruthy();
  });

  it('jumps to the segment of an integrity event', async () => {
    playbackOk();
    renderReview([
      { type: 'tab_switch', timestamp: iso(T0 + 21_000), question_index: 2 },
      { type: 'focus_lost', timestamp: iso(T0 + 600_000) },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: /Load recording/ }));
    await screen.findByLabelText('Assessment recording');
    expect(screen.getByText('not recorded')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '0:21' }));
    const video = screen.getByLabelText('Assessment recording') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('https://r2.example/2');
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(1);
  });

  it('explains a refused viewer (403) without a player', async () => {
    playbackFails(403, { error: 'You do not have access to this recording' });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Load recording/ }));
    await screen.findByText('You do not have access to this recording');
    expect(screen.queryByLabelText('Assessment recording')).toBeNull();
  });

  it('explains missing storage configuration (503)', async () => {
    playbackFails(503, { error: 'recording storage not configured', code: 'storage_not_configured' });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Load recording/ }));
    await screen.findByText(/Recording storage is not configured/);
  });

  it('does not offer playback of a deleted recording', async () => {
    recordingRows = [{ ...recording, status: 'deleted', deleted_at: iso(T0 + 91 * 86_400_000) }];
    renderReview();
    await screen.findByText(/deleted under the retention policy/);
    expect(screen.queryByRole('button', { name: /Load recording/ })).toBeNull();
  });

  it('shows the keep-until date only while automatic deletion is on', async () => {
    recordingRows = [{ ...recording, retention_until: '2027-02-12T10:00:00.000Z' }];
    retentionEnabled = true;
    const { unmount } = renderReview();
    await screen.findByText(/Kept until Feb 12, 2027/);
    expect(rpc).toHaveBeenCalledWith('assessment_recording_retention_enabled');
    unmount();

    retentionEnabled = false;
    renderReview();
    await screen.findByText('Completed');
    expect(screen.queryByText(/Kept until/)).toBeNull();
  });
});
