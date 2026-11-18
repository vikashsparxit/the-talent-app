// Pure rules for the assessment-media edge function: request parsing, MIME
// normalisation, size and sequence limits, upload windows and the playback
// access decision. No Deno or network APIs, so the vitest suite
// (src/test/assessmentMedia.test.ts) can import it directly.

import { type AttemptStatus, gateAnswerWrite, type WriteGate } from "./assessmentPortal.ts";
import { isUuid } from "./r2.ts";

export const CANDIDATE_MEDIA_ACTIONS = [
  "consent-status",
  "record-consent",
  "recording-start",
  "chunk-url",
  "chunk-done",
  "recording-finish",
  "spoken-upload-url",
] as const;
export const STAFF_MEDIA_ACTIONS = ["playback-urls"] as const;

export type CandidateMediaAction = (typeof CANDIDATE_MEDIA_ACTIONS)[number];
export type StaffMediaAction = (typeof STAFF_MEDIA_ACTIONS)[number];
export type MediaAction = CandidateMediaAction | StaffMediaAction;

export function isCandidateMediaAction(a: unknown): a is CandidateMediaAction {
  return (CANDIDATE_MEDIA_ACTIONS as readonly unknown[]).includes(a);
}
export function isStaffMediaAction(a: unknown): a is StaffMediaAction {
  return (STAFF_MEDIA_ACTIONS as readonly unknown[]).includes(a);
}

export const CHUNK_MAX_BYTES = 8 * 1024 * 1024;
export const SPOKEN_MAX_BYTES = 15 * 1024 * 1024;
/** 0..2000 at a 10 s timeslice is about 5.5 hours of webcam video. */
export const MAX_CHUNK_SEQ = 2000;
export const MAX_SPOKEN_ATTEMPTS = 3;
export const MAX_DURATION_SECONDS = 6 * 60 * 60;
/** Final chunks may still land this long after the attempt is submitted or times out. */
export const MEDIA_TAIL_GRACE_MS = 5 * 60_000;

export type RecordingKind = "webcam" | "spoken_answer";
export type RecordingStatus = "recording" | "completed" | "interrupted" | "failed" | "deleted";

const VIDEO_MIMES = new Set(["video/webm", "video/mp4"]);
const AUDIO_MIMES = new Set(["audio/webm", "audio/mp4", "audio/ogg"]);

/**
 * Base MIME type without codec parameters, lower-cased, or null when it is not
 * an allowed recording type. The presigned PUT signs this exact value, so the
 * client must send it as Content-Type (not the codecs-qualified recorder type).
 */
export function normalizeRecordingMime(raw: unknown, kind?: "video" | "audio"): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(";")[0].trim().toLowerCase();
  if (kind === "video") return VIDEO_MIMES.has(base) ? base : null;
  if (kind === "audio") return AUDIO_MIMES.has(base) ? base : null;
  return VIDEO_MIMES.has(base) || AUDIO_MIMES.has(base) ? base : null;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "video/webm":
    case "audio/webm":
      return "webm";
    case "video/mp4":
      return "mp4";
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    default:
      throw new Error("Unsupported recording MIME type");
  }
}

export interface SpokenConfig {
  max_seconds: number;
  prep_seconds: number;
  max_attempts: number;
}

export const DEFAULT_SPOKEN_CONFIG: SpokenConfig = { max_seconds: 120, prep_seconds: 0, max_attempts: 1 };

/** Allowed ranges for questions.spoken_config, shared with the question builder. */
export const SPOKEN_CONFIG_LIMITS = {
  max_seconds: { min: 15, max: 600 },
  prep_seconds: { min: 0, max: 120 },
  max_attempts: { min: 1, max: MAX_SPOKEN_ATTEMPTS },
} as const;

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Reads questions.spoken_config, falling back to defaults for missing or out-of-range values. */
export function parseSpokenConfig(raw: unknown): SpokenConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SPOKEN_CONFIG };
  const o = raw as Record<string, unknown>;
  return {
    max_seconds: intInRange(
      o.max_seconds,
      SPOKEN_CONFIG_LIMITS.max_seconds.min,
      SPOKEN_CONFIG_LIMITS.max_seconds.max,
      DEFAULT_SPOKEN_CONFIG.max_seconds,
    ),
    prep_seconds: intInRange(
      o.prep_seconds,
      SPOKEN_CONFIG_LIMITS.prep_seconds.min,
      SPOKEN_CONFIG_LIMITS.prep_seconds.max,
      DEFAULT_SPOKEN_CONFIG.prep_seconds,
    ),
    max_attempts: intInRange(
      o.max_attempts,
      SPOKEN_CONFIG_LIMITS.max_attempts.min,
      SPOKEN_CONFIG_LIMITS.max_attempts.max,
      DEFAULT_SPOKEN_CONFIG.max_attempts,
    ),
  };
}

// ── Request parsing ──────────────────────────────────────────────────────────

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
type Failure = { ok: false; error: string };

function failed<T>(p: Parsed<T>): p is Failure {
  return !p.ok;
}

type Data = Record<string, unknown>;

function asData(raw: unknown): Data {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Data) : {};
}

function nonNegInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function bytesWithin(value: unknown, max: number, label: string): Parsed<number> {
  const n = nonNegInt(value);
  if (n === null || n === 0) return { ok: false, error: "bytes must be a positive integer" };
  if (n > max) return { ok: false, error: `${label} exceeds the ${Math.round(max / 1024 / 1024)} MB limit` };
  return { ok: true, value: n };
}

function seqWithin(value: unknown): Parsed<number> {
  const n = nonNegInt(value);
  if (n === null || n > MAX_CHUNK_SEQ) return { ok: false, error: `seq must be an integer from 0 to ${MAX_CHUNK_SEQ}` };
  return { ok: true, value: n };
}

function recordingIdOf(d: Data): Parsed<string> {
  return isUuid(d.recording_id) ? { ok: true, value: d.recording_id.toLowerCase() } : { ok: false, error: "recording_id is required" };
}

const CONSENT_VERSION = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The version of the text the candidate read, if sent. It is only compared
 * with the server's current version; the server's version is what is stored.
 */
export function parseRecordConsent(raw: unknown): Parsed<{ consentVersion: string | null }> {
  const d = asData(raw);
  if (d.consent_version === undefined || d.consent_version === null) return { ok: true, value: { consentVersion: null } };
  if (typeof d.consent_version !== "string" || !CONSENT_VERSION.test(d.consent_version)) {
    return { ok: false, error: "consent_version is invalid" };
  }
  return { ok: true, value: { consentVersion: d.consent_version } };
}

export function parseRecordingStart(raw: unknown): Parsed<{ kind: "webcam"; mime: string }> {
  const d = asData(raw);
  if (d.kind !== "webcam") return { ok: false, error: "kind must be 'webcam'" };
  const mime = normalizeRecordingMime(d.mime, "video");
  if (!mime) return { ok: false, error: "Unsupported video type" };
  return { ok: true, value: { kind: "webcam", mime } };
}

export function parseChunkUrl(raw: unknown): Parsed<{ recordingId: string; seq: number; bytes: number; mime: string }> {
  const d = asData(raw);
  const id = recordingIdOf(d);
  if (failed(id)) return id;
  const seq = seqWithin(d.seq);
  if (failed(seq)) return seq;
  const bytes = bytesWithin(d.bytes, CHUNK_MAX_BYTES, "Chunk");
  if (failed(bytes)) return bytes;
  const mime = normalizeRecordingMime(d.mime);
  if (!mime) return { ok: false, error: "Unsupported recording type" };
  return { ok: true, value: { recordingId: id.value, seq: seq.value, bytes: bytes.value, mime } };
}

/** Longest webcam segment the browser may report (the exam records ~10 s segments). */
export const SEGMENT_MAX_MS = 600_000;
/** Browser-reported capture times further than this from server time are ignored. */
export const CAPTURED_AT_MAX_SKEW_MS = 24 * 60 * 60_000;

export interface ChunkDone {
  recordingId: string;
  seq: number;
  bytes: number;
  /** Browser time the segment started (reviewer timeline only); null when absent or unreadable. */
  capturedAt: Date | null;
  durationMs: number | null;
}

export function parseChunkDone(raw: unknown): Parsed<ChunkDone> {
  const d = asData(raw);
  const id = recordingIdOf(d);
  if (failed(id)) return id;
  const seq = seqWithin(d.seq);
  if (failed(seq)) return seq;
  const bytes = bytesWithin(d.bytes, SPOKEN_MAX_BYTES, "Upload");
  if (failed(bytes)) return bytes;
  // Timing is optional and only places segments on the timeline: drop bad values instead of refusing the chunk.
  const captured = typeof d.captured_at === "string" ? new Date(d.captured_at) : null;
  const durationMs = nonNegInt(d.duration_ms);
  return {
    ok: true,
    value: {
      recordingId: id.value,
      seq: seq.value,
      bytes: bytes.value,
      capturedAt: captured && Number.isFinite(captured.getTime()) ? captured : null,
      durationMs: durationMs !== null && durationMs <= SEGMENT_MAX_MS ? durationMs : null,
    },
  };
}

/** The browser's capture time when it is within a day of server time, else null. */
export function plausibleCapturedAt(capturedAt: Date | null, now: Date): string | null {
  if (!capturedAt) return null;
  return Math.abs(capturedAt.getTime() - now.getTime()) <= CAPTURED_AT_MAX_SKEW_MS ? capturedAt.toISOString() : null;
}

export function parseRecordingFinish(
  raw: unknown,
): Parsed<{ recordingId: string; status: "completed" | "interrupted"; durationSeconds: number | null }> {
  const d = asData(raw);
  const id = recordingIdOf(d);
  if (failed(id)) return id;
  if (d.status !== "completed" && d.status !== "interrupted") {
    return { ok: false, error: "status must be 'completed' or 'interrupted'" };
  }
  let durationSeconds: number | null = null;
  if (d.duration_seconds !== undefined && d.duration_seconds !== null) {
    const n = d.duration_seconds;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_DURATION_SECONDS) {
      return { ok: false, error: "duration_seconds is out of range" };
    }
    durationSeconds = Math.round(n * 10) / 10;
  }
  return { ok: true, value: { recordingId: id.value, status: d.status, durationSeconds } };
}

export function parseSpokenUpload(
  raw: unknown,
): Parsed<{ questionId: string; attempt: number; mime: string; bytes: number }> {
  const d = asData(raw);
  if (!isUuid(d.question_id)) return { ok: false, error: "question_id is required" };
  const attempt = d.attempt;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1 || attempt > MAX_SPOKEN_ATTEMPTS) {
    return { ok: false, error: `attempt must be an integer from 1 to ${MAX_SPOKEN_ATTEMPTS}` };
  }
  const mime = normalizeRecordingMime(d.mime, "audio");
  if (!mime) return { ok: false, error: "Unsupported audio type" };
  const bytes = bytesWithin(d.bytes, SPOKEN_MAX_BYTES, "Spoken answer");
  if (failed(bytes)) return bytes;
  return { ok: true, value: { questionId: d.question_id.toLowerCase(), attempt, mime, bytes: bytes.value } };
}

export type PlaybackRequest =
  | { recordingId: string }
  /** A spoken answer, found by attempt + question (attempt picks the saved take). */
  | { candidateAssessmentId: string; questionId: string; attempt: number | null };

export function parsePlaybackRequest(raw: unknown): Parsed<PlaybackRequest> {
  const d = asData(raw);
  if (d.recording_id === undefined && (d.candidate_assessment_id !== undefined || d.question_id !== undefined)) {
    if (!isUuid(d.candidate_assessment_id) || !isUuid(d.question_id)) {
      return { ok: false, error: "candidate_assessment_id and question_id are required" };
    }
    const a = d.attempt;
    const attempt = typeof a === "number" && Number.isInteger(a) && a >= 1 && a <= MAX_SPOKEN_ATTEMPTS ? a : null;
    return {
      ok: true,
      value: {
        candidateAssessmentId: d.candidate_assessment_id.toLowerCase(),
        questionId: d.question_id.toLowerCase(),
        attempt,
      },
    };
  }
  const id = recordingIdOf(d);
  return failed(id) ? id : { ok: true, value: { recordingId: id.value } };
}

/** Next chunk sequence after a reconnect: one past the highest uploaded chunk. */
export function nextChunkSeq(maxSeq: number | null | undefined): number {
  return typeof maxSeq === "number" && maxSeq >= 0 ? maxSeq + 1 : 0;
}

/**
 * Attempt number for a spoken upload: the one requested, but never one that
 * was already uploaded, so an exhausted question cannot be re-recorded by
 * re-sending an old attempt number. Retrying the presign for the same attempt
 * before chunk-done stays possible (it is not uploaded yet).
 */
export function assignSpokenAttempt(requested: number, lastUploaded: number | null | undefined): number {
  return typeof lastUploaded === "number" && lastUploaded >= requested ? lastUploaded + 1 : requested;
}

/** spoken/<candidate_assessment_id>/<question_id>/ */
export function spokenPrefix(candidateAssessmentId: string, questionId: string): string {
  if (!isUuid(candidateAssessmentId) || !isUuid(questionId)) throw new Error("Invalid id in object key");
  return `spoken/${candidateAssessmentId.toLowerCase()}/${questionId.toLowerCase()}/`;
}

// ── Upload windows ───────────────────────────────────────────────────────────

/**
 * Whether a candidate media write may proceed. Consent may also be recorded
 * before the attempt starts (invited, deadline not passed), so the consent and
 * camera checks do not eat into the timed attempt. Opening a recording or a
 * spoken upload follows the same rule as saving an answer. Finishing an
 * already-open recording (chunk-url, chunk-done, recording-finish) also gets a
 * short tail after submit or time-out so the last chunk is not lost. Nothing
 * here changes the attempt: media never submits, scores or advances it.
 */
export function gateMediaWrite(
  action: CandidateMediaAction,
  params: { status: AttemptStatus; timeLimit: Date | null; completedAt: string | null; deadline: string | null; now: Date },
): WriteGate {
  // Read-only: whether consent is already on file.
  if (action === "consent-status") return { allowed: true };
  if (action === "record-consent" && params.status === "invited") {
    const deadline = params.deadline ? new Date(params.deadline).getTime() : NaN;
    if (!(deadline < params.now.getTime())) return { allowed: true };
  }
  const gate = gateAnswerWrite(params.status, params.timeLimit, params.now);
  if (!("code" in gate)) return gate;
  if (action !== "chunk-url" && action !== "chunk-done" && action !== "recording-finish") return gate;
  if (gate.code === "not_started") return gate;

  const endedAt = gate.code === "already_submitted" && params.completedAt
    ? new Date(params.completedAt).getTime()
    : params.timeLimit?.getTime() ?? NaN;
  if (Number.isFinite(endedAt) && params.now.getTime() - endedAt <= MEDIA_TAIL_GRACE_MS) {
    return { allowed: true };
  }
  return gate;
}

// ── Playback access ──────────────────────────────────────────────────────────

export type PlaybackDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 404 | 410; error: string; code?: "recording_deleted" };

/**
 * Staff playback: admin/HR, a recruiter assigned to the attempt's job, or an
 * interviewer who may view the attempt (same rule as the RLS helper
 * can_view_assessment_media). Unknown recordings or attempts get the same 403
 * as forbidden ones so ids cannot be probed. Only a permitted viewer of a
 * known attempt learns that a spoken answer has no recording (404). Deleted
 * recordings never play.
 */
export function decidePlaybackAccess(input: {
  recordingFound: boolean;
  /** Lookup by attempt + question: the attempt exists. Defaults to recordingFound (lookup by recording id). */
  attemptFound?: boolean;
  isAdminOrHr: boolean;
  isRecruiterForJob: boolean;
  isInterviewerForAttempt: boolean;
  status: string | null;
  deletedAt: string | null;
}): PlaybackDecision {
  const viewer = input.isAdminOrHr || input.isRecruiterForJob || input.isInterviewerForAttempt;
  if (!(input.attemptFound ?? input.recordingFound) || !viewer) {
    return { allowed: false, status: 403, error: "You do not have access to this recording" };
  }
  if (!input.recordingFound) {
    return { allowed: false, status: 404, error: "No recording was found for this answer" };
  }
  if (input.status === "deleted" || input.deletedAt) {
    return { allowed: false, status: 410, error: "This recording has been deleted", code: "recording_deleted" };
  }
  return { allowed: true };
}

/**
 * Which uploaded objects to play: every webcam chunk in order, or one spoken
 * take (the requested attempt when it was uploaded, else the latest).
 */
export function playbackChunks<T extends { seq: number }>(kind: string, chunks: readonly T[], attempt?: number | null): T[] {
  const ordered = [...chunks].sort((a, b) => a.seq - b.seq);
  if (kind === "spoken_answer") {
    const wanted = attempt ? ordered.find((c) => c.seq === attempt) : undefined;
    return wanted ? [wanted] : ordered.length ? [ordered[ordered.length - 1]] : [];
  }
  return ordered;
}
