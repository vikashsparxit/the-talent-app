// Spoken-answer questions: builder settings and the response stored in
// candidate_responses.response. Limits and defaults come from the shared rules
// the edge functions enforce, so the builder and the server cannot drift.
import {
  DEFAULT_SPOKEN_CONFIG,
  parseSpokenConfig,
  SPOKEN_CONFIG_LIMITS,
} from '../../supabase/functions/_shared/assessmentMedia.ts';
import type { QuestionSpokenConfig } from '@/types/database';

export { DEFAULT_SPOKEN_CONFIG, parseSpokenConfig, SPOKEN_CONFIG_LIMITS };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Builder input to a valid config: out-of-range values move to the nearest limit. */
export function clampSpokenConfig(raw: Partial<Record<keyof QuestionSpokenConfig, unknown>>): QuestionSpokenConfig {
  const L = SPOKEN_CONFIG_LIMITS;
  return {
    max_seconds: clampInt(raw.max_seconds, L.max_seconds.min, L.max_seconds.max, DEFAULT_SPOKEN_CONFIG.max_seconds),
    prep_seconds: clampInt(raw.prep_seconds, L.prep_seconds.min, L.prep_seconds.max, DEFAULT_SPOKEN_CONFIG.prep_seconds),
    max_attempts: clampInt(raw.max_attempts, L.max_attempts.min, L.max_attempts.max, DEFAULT_SPOKEN_CONFIG.max_attempts),
  };
}

export type TranscriptStatus = 'pending' | 'done' | 'failed';

/** Stored in candidate_responses.response for spoken questions. transcript* is written by grading only. */
export interface SpokenAnswerResponse {
  mode: 'audio';
  file: { key: string; mime: string; size: number; duration_seconds: number };
  attempt: number;
  transcript_status: TranscriptStatus;
  transcript?: string;
  transcript_error?: string;
}

export function buildSpokenAnswerResponse(p: {
  key: string;
  mime: string;
  size: number;
  durationSeconds: number;
  attempt: number;
}): SpokenAnswerResponse {
  return {
    mode: 'audio',
    file: { key: p.key, mime: p.mime, size: p.size, duration_seconds: Math.round(p.durationSeconds * 10) / 10 },
    attempt: p.attempt,
    transcript_status: 'pending',
  };
}

export function parseSpokenAnswerResponse(raw: unknown): SpokenAnswerResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.mode !== 'audio' || !o.file || typeof o.file !== 'object' || Array.isArray(o.file)) return null;
  const f = o.file as Record<string, unknown>;
  if (typeof f.key !== 'string' || !f.key) return null;
  const status: TranscriptStatus =
    o.transcript_status === 'done' || o.transcript_status === 'failed' ? o.transcript_status : 'pending';
  return {
    mode: 'audio',
    file: {
      key: f.key,
      mime: typeof f.mime === 'string' ? f.mime : '',
      size: typeof f.size === 'number' ? f.size : 0,
      duration_seconds: typeof f.duration_seconds === 'number' ? f.duration_seconds : 0,
    },
    attempt: typeof o.attempt === 'number' ? o.attempt : 1,
    transcript_status: status,
    ...(typeof o.transcript === 'string' ? { transcript: o.transcript } : {}),
    ...(typeof o.transcript_error === 'string' ? { transcript_error: o.transcript_error } : {}),
  };
}

/** A spoken question counts as answered once a recording has been uploaded and saved. */
export function isSpokenAnswered(raw: unknown): boolean {
  return parseSpokenAnswerResponse(raw) !== null;
}

/** 0:07, 2:00, 10:00 */
export function formatSpokenSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
