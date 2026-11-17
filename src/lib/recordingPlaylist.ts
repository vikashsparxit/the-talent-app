// Reviewer playback of a webcam recording: the segments (separate ~10 s
// files) in seq order on one timeline, and where an integrity event falls on
// it. Segment times come from the candidate's browser, like integrity event
// timestamps, so the two line up even when that clock is off.

/** Assumed segment length when the browser did not report one. */
export const DEFAULT_SEGMENT_SECONDS = 10;

export interface PlaylistSource {
  seq: number;
  url: string;
  bytes: number;
  captured_at?: string | null;
  duration_ms?: number | null;
}

export interface PlaylistSegment {
  seq: number;
  url: string;
  bytes: number;
  /** Browser time the segment started (ms since epoch), estimated when not reported. */
  startMs: number;
  durationSeconds: number;
  /** Seconds from the start of the first segment. */
  offsetSeconds: number;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Orders segments by seq and gives each a start time and length. A segment
 * without a reported time starts where the previous one ended (or at the
 * recording start).
 */
export function buildPlaylist(sources: readonly PlaylistSource[], recordingStartedAt: string): PlaylistSegment[] {
  const ordered = [...sources].sort((a, b) => a.seq - b.seq);
  const segments: PlaylistSegment[] = [];
  let cursor = parseTime(recordingStartedAt) ?? 0;
  for (const s of ordered) {
    const durationSeconds =
      typeof s.duration_ms === 'number' && s.duration_ms > 0 ? s.duration_ms / 1000 : DEFAULT_SEGMENT_SECONDS;
    const startMs = parseTime(s.captured_at) ?? cursor;
    segments.push({ seq: s.seq, url: s.url, bytes: s.bytes, startMs, durationSeconds, offsetSeconds: 0 });
    cursor = startMs + durationSeconds * 1000;
  }
  const origin = segments[0]?.startMs ?? 0;
  for (const s of segments) s.offsetSeconds = Math.max(0, (s.startMs - origin) / 1000);
  return segments;
}

export interface PlaylistPosition {
  index: number;
  /** Seconds into that segment. */
  seekSeconds: number;
  /** The moment fell in a gap (nothing recorded); this is the next recorded segment. */
  inGap: boolean;
}

/** Tolerance for clock jitter at segment edges. */
const EDGE_MS = 1000;

/** Which segment covers a moment (e.g. an integrity event), or null if it is outside the recording. */
export function locateInPlaylist(segments: readonly PlaylistSegment[], timestamp: string): PlaylistPosition | null {
  const t = parseTime(timestamp);
  if (t === null || segments.length === 0) return null;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const end = s.startMs + s.durationSeconds * 1000;
    if (t >= s.startMs - EDGE_MS && t < end + (i === segments.length - 1 ? EDGE_MS : 0)) {
      return { index: i, seekSeconds: Math.min(s.durationSeconds, Math.max(0, (t - s.startMs) / 1000)), inGap: false };
    }
    const next = segments[i + 1];
    if (next && t >= end && t < next.startMs - EDGE_MS) return { index: i + 1, seekSeconds: 0, inGap: true };
  }
  return null;
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatOffset(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
