import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CHUNK_MAX_BYTES,
  DEFAULT_SPOKEN_CONFIG,
  MAX_CHUNK_SEQ,
  MEDIA_TAIL_GRACE_MS,
  SPOKEN_MAX_BYTES,
  decidePlaybackAccess,
  extensionForMime,
  gateMediaWrite,
  isCandidateMediaAction,
  isStaffMediaAction,
  nextChunkSeq,
  normalizeRecordingMime,
  parseChunkDone,
  plausibleCapturedAt,
  SEGMENT_MAX_MS,
  parseChunkUrl,
  parsePlaybackRequest,
  parseRecordConsent,
  parseRecordingFinish,
  parseRecordingStart,
  parseSpokenConfig,
  assignSpokenAttempt,
  parseSpokenUpload,
  playbackChunks,
  spokenPrefix,
} from '../../supabase/functions/_shared/assessmentMedia.ts';

const REC = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CA = '11111111-2222-4333-8444-555555555555';

describe('MIME normalisation', () => {
  it('strips codec parameters and lower-cases', () => {
    expect(normalizeRecordingMime('video/webm;codecs=vp8,opus')).toBe('video/webm');
    expect(normalizeRecordingMime(' Video/MP4 ; codecs="avc1"')).toBe('video/mp4');
    expect(normalizeRecordingMime('audio/webm;codecs=opus', 'audio')).toBe('audio/webm');
    expect(normalizeRecordingMime('audio/ogg', 'audio')).toBe('audio/ogg');
  });

  it('rejects other types and the wrong kind', () => {
    expect(normalizeRecordingMime('video/quicktime')).toBeNull();
    expect(normalizeRecordingMime('application/pdf')).toBeNull();
    expect(normalizeRecordingMime('audio/webm', 'video')).toBeNull();
    expect(normalizeRecordingMime('video/webm', 'audio')).toBeNull();
    expect(normalizeRecordingMime(undefined)).toBeNull();
  });

  it('maps types to file extensions', () => {
    expect(extensionForMime('video/webm')).toBe('webm');
    expect(extensionForMime('audio/webm')).toBe('webm');
    expect(extensionForMime('video/mp4')).toBe('mp4');
    expect(extensionForMime('audio/mp4')).toBe('m4a');
    expect(extensionForMime('audio/ogg')).toBe('ogg');
    expect(() => extensionForMime('text/plain')).toThrow();
  });
});

describe('request parsing', () => {
  it('validates consent versions', () => {
    expect(parseRecordConsent({ consent_version: 'v-0123456789abcdef' })).toEqual({
      ok: true,
      value: { consentVersion: 'v-0123456789abcdef' },
    });
    expect(parseRecordConsent({ consent_version: 'bad version!' }).ok).toBe(false);
    // The version is optional: the server stores its own current version.
    expect(parseRecordConsent(null)).toEqual({ ok: true, value: { consentVersion: null } });
  });

  it('starts webcam recordings only with a video type', () => {
    expect(parseRecordingStart({ kind: 'webcam', mime: 'video/webm;codecs=vp8,opus' })).toEqual({
      ok: true,
      value: { kind: 'webcam', mime: 'video/webm' },
    });
    expect(parseRecordingStart({ kind: 'webcam', mime: 'audio/webm' }).ok).toBe(false);
    expect(parseRecordingStart({ kind: 'screen', mime: 'video/webm' }).ok).toBe(false);
  });

  it('enforces chunk sequence, size and type', () => {
    const base = { recording_id: REC, seq: 0, bytes: 1000, mime: 'video/webm;codecs=vp8' };
    expect(parseChunkUrl(base)).toEqual({ ok: true, value: { recordingId: REC, seq: 0, bytes: 1000, mime: 'video/webm' } });
    expect(parseChunkUrl({ ...base, seq: MAX_CHUNK_SEQ }).ok).toBe(true);
    expect(parseChunkUrl({ ...base, seq: MAX_CHUNK_SEQ + 1 }).ok).toBe(false);
    expect(parseChunkUrl({ ...base, seq: -1 }).ok).toBe(false);
    expect(parseChunkUrl({ ...base, seq: 1.5 }).ok).toBe(false);
    expect(parseChunkUrl({ ...base, bytes: CHUNK_MAX_BYTES }).ok).toBe(true);
    expect(parseChunkUrl({ ...base, bytes: CHUNK_MAX_BYTES + 1 }).ok).toBe(false);
    expect(parseChunkUrl({ ...base, bytes: 0 }).ok).toBe(false);
    expect(parseChunkUrl({ ...base, mime: 'image/png' }).ok).toBe(false);
    expect(parseChunkUrl({ ...base, recording_id: '../x' }).ok).toBe(false);
    expect(parseChunkDone({ recording_id: REC, seq: 3, bytes: 10 })).toEqual({
      ok: true,
      value: { recordingId: REC, seq: 3, bytes: 10, capturedAt: null, durationMs: null },
    });
  });

  it('keeps segment timing only when it is readable and plausible', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    const done = parseChunkDone({
      recording_id: REC,
      seq: 4,
      bytes: 10,
      captured_at: '2026-11-14T09:59:50.000Z',
      duration_ms: 10_000,
    });
    expect(done).toMatchObject({ ok: true, value: { durationMs: 10_000 } });
    const value = done.ok ? done.value : null;
    expect(plausibleCapturedAt(value!.capturedAt, now)).toBe('2026-11-14T09:59:50.000Z');
    // Bad timing never refuses the chunk; it is just not stored.
    const bad = parseChunkDone({ recording_id: REC, seq: 4, bytes: 10, captured_at: 'yesterday', duration_ms: SEGMENT_MAX_MS + 1 });
    expect(bad).toMatchObject({ ok: true, value: { capturedAt: null, durationMs: null } });
    expect(plausibleCapturedAt(new Date('2026-11-16T10:00:00Z'), now)).toBeNull();
    expect(plausibleCapturedAt(null, now)).toBeNull();
  });

  it('accepts only completed/interrupted finishes with a sane duration', () => {
    expect(parseRecordingFinish({ recording_id: REC, status: 'completed', duration_seconds: 61.26 })).toEqual({
      ok: true,
      value: { recordingId: REC, status: 'completed', durationSeconds: 61.3 },
    });
    expect(parseRecordingFinish({ recording_id: REC, status: 'interrupted' }).ok).toBe(true);
    expect(parseRecordingFinish({ recording_id: REC, status: 'deleted' }).ok).toBe(false);
    expect(parseRecordingFinish({ recording_id: REC, status: 'completed', duration_seconds: -1 }).ok).toBe(false);
  });

  it('limits spoken uploads to audio, 15 MB and a valid attempt', () => {
    const base = { question_id: REC, attempt: 1, mime: 'audio/mp4', bytes: 500 };
    expect(parseSpokenUpload(base)).toEqual({
      ok: true,
      value: { questionId: REC, attempt: 1, mime: 'audio/mp4', bytes: 500 },
    });
    expect(parseSpokenUpload({ ...base, bytes: SPOKEN_MAX_BYTES + 1 }).ok).toBe(false);
    expect(parseSpokenUpload({ ...base, attempt: 0 }).ok).toBe(false);
    expect(parseSpokenUpload({ ...base, mime: 'video/webm' }).ok).toBe(false);
    expect(parsePlaybackRequest({ recording_id: REC.toUpperCase() })).toEqual({ ok: true, value: { recordingId: REC } });
  });

  it('classifies candidate and staff actions', () => {
    expect(isCandidateMediaAction('chunk-url')).toBe(true);
    expect(isCandidateMediaAction('playback-urls')).toBe(false);
    expect(isStaffMediaAction('playback-urls')).toBe(true);
    expect(isStaffMediaAction('delete')).toBe(false);
  });
});

describe('spoken config and helpers', () => {
  it('defaults and clamps spoken settings', () => {
    expect(parseSpokenConfig(null)).toEqual(DEFAULT_SPOKEN_CONFIG);
    expect(parseSpokenConfig({ max_seconds: 60, prep_seconds: 30, max_attempts: 2 })).toEqual({
      max_seconds: 60,
      prep_seconds: 30,
      max_attempts: 2,
    });
    expect(parseSpokenConfig({ max_seconds: 9999, max_attempts: 0 })).toEqual(DEFAULT_SPOKEN_CONFIG);
    // Same ranges as the question builder: 15-600 s, 0-120 s prep, 1-3 attempts.
    expect(parseSpokenConfig({ max_seconds: 10, prep_seconds: 121, max_attempts: 4 })).toEqual(DEFAULT_SPOKEN_CONFIG);
    expect(parseSpokenConfig({ max_seconds: 15, prep_seconds: 120, max_attempts: 3 })).toEqual({
      max_seconds: 15,
      prep_seconds: 120,
      max_attempts: 3,
    });
  });

  it('never reuses an uploaded spoken attempt number', () => {
    expect(assignSpokenAttempt(1, null)).toBe(1);
    expect(assignSpokenAttempt(2, 1)).toBe(2);
    // Re-sending attempt 1 after it was uploaded becomes attempt 2 (and then hits max_attempts).
    expect(assignSpokenAttempt(1, 1)).toBe(2);
    expect(assignSpokenAttempt(1, 2)).toBe(3);
  });

  it('resumes after the highest uploaded chunk', () => {
    expect(nextChunkSeq(null)).toBe(0);
    expect(nextChunkSeq(0)).toBe(1);
    expect(nextChunkSeq(41)).toBe(42);
  });

  it('builds the spoken prefix from ids only', () => {
    expect(spokenPrefix(CA, REC)).toBe(`spoken/${CA}/${REC}/`);
    expect(() => spokenPrefix('x', REC)).toThrow();
  });

  it('plays every webcam chunk in order but only the latest spoken attempt', () => {
    const chunks = [{ seq: 2 }, { seq: 0 }, { seq: 1 }];
    expect(playbackChunks('webcam', chunks).map((c) => c.seq)).toEqual([0, 1, 2]);
    expect(playbackChunks('spoken_answer', chunks).map((c) => c.seq)).toEqual([2]);
    expect(playbackChunks('spoken_answer', [])).toEqual([]);
    // The saved attempt when it was uploaded, else the latest.
    expect(playbackChunks('spoken_answer', chunks, 1).map((c) => c.seq)).toEqual([1]);
    expect(playbackChunks('spoken_answer', chunks, 3).map((c) => c.seq)).toEqual([2]);
  });

  it('looks up a spoken answer by attempt + question for playback', () => {
    expect(parsePlaybackRequest({ candidate_assessment_id: CA.toUpperCase(), question_id: REC, attempt: 2 })).toEqual({
      ok: true,
      value: { candidateAssessmentId: CA, questionId: REC, attempt: 2 },
    });
    expect(parsePlaybackRequest({ candidate_assessment_id: CA, question_id: REC, attempt: 'x' })).toEqual({
      ok: true,
      value: { candidateAssessmentId: CA, questionId: REC, attempt: null },
    });
    expect(parsePlaybackRequest({ candidate_assessment_id: CA }).ok).toBe(false);
    expect(parsePlaybackRequest({ candidate_assessment_id: 'nope', question_id: REC }).ok).toBe(false);
    expect(parsePlaybackRequest({}).ok).toBe(false);
  });
});

describe('upload windows', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  const future = new Date('2026-11-14T11:00:00Z');
  const gate = (action: Parameters<typeof gateMediaWrite>[0], over: Partial<Parameters<typeof gateMediaWrite>[1]>) =>
    gateMediaWrite(action, { status: 'in_progress', timeLimit: future, completedAt: null, deadline: null, now, ...over });

  it('allows writes while the attempt is in progress', () => {
    expect(gate('chunk-url', {}).allowed).toBe(true);
    expect(gate('spoken-upload-url', {}).allowed).toBe(true);
  });

  it('lets consent be recorded before the attempt starts, unless the deadline passed', () => {
    expect(gate('record-consent', { status: 'invited' }).allowed).toBe(true);
    expect(gate('record-consent', { status: 'invited', deadline: '2026-11-14T09:00:00Z' }).allowed).toBe(false);
    expect(gate('recording-start', { status: 'invited' }).allowed).toBe(false);
  });

  it('gives finishing actions a short tail after submit, but not new recordings', () => {
    const justDone = new Date(now.getTime() - 60_000).toISOString();
    const longAgo = new Date(now.getTime() - MEDIA_TAIL_GRACE_MS - 1000).toISOString();
    expect(gate('chunk-done', { status: 'completed', completedAt: justDone }).allowed).toBe(true);
    expect(gate('recording-finish', { status: 'completed', completedAt: justDone }).allowed).toBe(true);
    expect(gate('chunk-url', { status: 'completed', completedAt: longAgo }).allowed).toBe(false);
    expect(gate('recording-start', { status: 'completed', completedAt: justDone }).allowed).toBe(false);
    expect(gate('spoken-upload-url', { status: 'completed', completedAt: justDone }).allowed).toBe(false);
  });

  it('applies the tail after the time limit too', () => {
    const limit = new Date(now.getTime() - 60_000);
    expect(gate('chunk-done', { timeLimit: limit }).allowed).toBe(true);
    expect(gate('chunk-url', { timeLimit: new Date(now.getTime() - MEDIA_TAIL_GRACE_MS - 1) }).allowed).toBe(false);
    expect(gate('recording-start', { timeLimit: limit }).allowed).toBe(false);
  });
});

describe('playback access', () => {
  const base = {
    recordingFound: true,
    isAdminOrHr: false,
    isRecruiterForJob: false,
    isInterviewerForAttempt: false,
    status: 'completed',
    deletedAt: null,
  };

  it('allows admin/HR, the job recruiter or an assigned interviewer', () => {
    expect(decidePlaybackAccess({ ...base, isAdminOrHr: true }).allowed).toBe(true);
    expect(decidePlaybackAccess({ ...base, isRecruiterForJob: true }).allowed).toBe(true);
    expect(decidePlaybackAccess({ ...base, isInterviewerForAttempt: true }).allowed).toBe(true);
  });

  it('denies everyone else, and unknown recordings look the same', () => {
    expect(decidePlaybackAccess(base)).toMatchObject({ allowed: false, status: 403 });
    expect(decidePlaybackAccess({ ...base, recordingFound: false, isAdminOrHr: true })).toMatchObject({
      allowed: false,
      status: 403,
    });
  });

  it('tells only a permitted viewer of a known attempt that a spoken answer has no recording', () => {
    expect(decidePlaybackAccess({ ...base, recordingFound: false, attemptFound: true, isAdminOrHr: true })).toMatchObject({
      allowed: false,
      status: 404,
    });
    expect(decidePlaybackAccess({ ...base, recordingFound: false, attemptFound: true })).toMatchObject({ status: 403 });
    expect(decidePlaybackAccess({ ...base, recordingFound: false, attemptFound: false, isAdminOrHr: true })).toMatchObject({
      status: 403,
    });
  });

  it('never plays deleted recordings', () => {
    expect(decidePlaybackAccess({ ...base, isAdminOrHr: true, status: 'deleted' })).toMatchObject({ status: 410 });
    expect(decidePlaybackAccess({ ...base, isAdminOrHr: true, deletedAt: '2026-11-01T00:00:00Z' })).toMatchObject({
      status: 410,
    });
  });
});

// The edge function runs on Deno and is not executed by vitest; pin its wiring.
describe('assessment-media wiring', () => {
  const root = path.resolve(__dirname, '../..');
  const fn = readFileSync(path.join(root, 'supabase/functions/assessment-media/index.ts'), 'utf8');
  const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  const migration = readFileSync(path.join(root, 'supabase/migrations/20261114000002_assessment_media.sql'), 'utf8');

  it('answers 503 before anything else when R2 is not configured', () => {
    const check = fn.indexOf('"recording storage not configured"');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(fn.indexOf('resolvePortalAttempt(\n'));
    expect(check).toBeLessThan(fn.indexOf('await handlePlayback('));
  });

  it('gates every candidate action on the attempt window and checks staff server-side', () => {
    expect(fn.indexOf('gateMediaWrite(')).toBeLessThan(fn.indexOf('switch (action)'));
    expect(fn).toContain('requireAuth(req, admin, corsHeaders)');
    expect(fn).toContain('decidePlaybackAccess(');
    for (const rpc of ['is_admin_or_hr', 'is_recruiter_for_job', 'can_interviewer_view_candidate_assessment']) {
      expect(fn).toContain(`"${rpc}"`);
    }
  });

  it('never touches attempt status, scores or stages', () => {
    expect(fn).not.toMatch(/from\("candidate_assessments"\)\s*\.update/);
    expect(fn).not.toMatch(/candidate_responses|pipeline|advance_candidate_stage/);
  });

  it('is configured without gateway JWT verification, like candidate-portal', () => {
    expect(config).toMatch(/\[functions\.assessment-media\]\nverify_jwt = false/);
  });

  it('gives anon/authenticated no write policies on media tables', () => {
    expect(migration).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(3);
    expect(migration).toContain('Run manually after review. Not applied automatically.');
  });
});
