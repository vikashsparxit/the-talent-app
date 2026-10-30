/**
 * Grading state helpers for candidate assessments.
 *
 * After submit, MCQ answers are scored by a database trigger straight away but
 * subjective, coding and file answers wait for AI grading. Until that finishes
 * the stored percentage is partial (often 0%) and `passed` is false, so screens
 * must show "grading" instead of a score or a fail.
 */

export type GradingStatus = 'queued' | 'grading' | 'graded' | 'failed' | 'not_required';

export interface GradingStateRow {
  status?: string | null;
  grading_status?: string | null;
}

/** True while AI grading is queued or running for a submitted attempt. */
export function isGradingPending(row: GradingStateRow | null | undefined): boolean {
  if (!row) return false;
  return row.grading_status === 'queued' || row.grading_status === 'grading';
}

/** Score text for lists: "Grading…" while pending, "-" with no score, else "72.5%". */
export function formatAssessmentScore(
  row: (GradingStateRow & { percentage?: number | null }) | null | undefined,
  digits = 1,
): string {
  if (!row) return '-';
  if (isGradingPending(row)) return 'Grading…';
  if (row.percentage === null || row.percentage === undefined) return '-';
  return `${row.percentage.toFixed(digits)}%`;
}

/** Error codes the candidate portal returns for writes that can no longer happen. */
export type PortalErrorCode =
  | 'already_submitted'
  | 'time_limit_exceeded'
  | 'not_started'
  | 'link_expired'
  | 'expired'
  | 'invalid_question'
  | 'invalid_transition';

/** Database trigger messages (signed-in dashboard path) mapped to portal codes. */
const DB_ERROR_CODES: Record<string, PortalErrorCode> = {
  assessment_already_submitted: 'already_submitted',
  assessment_time_limit_exceeded: 'time_limit_exceeded',
  assessment_not_in_progress: 'not_started',
  assessment_link_expired: 'link_expired',
  assessment_expired: 'expired',
  invalid_question_for_assessment: 'invalid_question',
  invalid_assessment_status_transition: 'invalid_transition',
};

const CODE_MESSAGES: Record<PortalErrorCode, string> = {
  already_submitted: 'This assessment has already been submitted',
  time_limit_exceeded: 'The time limit for this assessment has passed. Your saved answers have been submitted.',
  not_started: 'Assessment not in progress',
  link_expired: 'This assessment link has expired',
  expired: 'The deadline for this assessment has passed',
  invalid_question: 'Invalid question for this assessment',
  invalid_transition: 'This assessment can no longer be changed',
};

export class PortalError extends Error {
  readonly code: PortalErrorCode | null;
  constructor(message: string, code: PortalErrorCode | null = null) {
    super(message);
    this.name = 'PortalError';
    this.code = code;
  }
}

/** Converts a PostgREST error raised by the assessment triggers into a PortalError. */
export function portalErrorFromDb(error: { message?: string } | null | undefined): PortalError | null {
  const raw = error?.message?.trim() ?? '';
  const code = DB_ERROR_CODES[raw];
  return code ? new PortalError(CODE_MESSAGES[code], code) : null;
}

/** Builds a PortalError from a candidate-portal JSON error body ({ error, code }). */
export function portalErrorFromBody(body: unknown, fallback: string): PortalError {
  if (body && typeof body === 'object') {
    const b = body as { error?: unknown; code?: unknown };
    const code = typeof b.code === 'string' && b.code in CODE_MESSAGES ? (b.code as PortalErrorCode) : null;
    const message = typeof b.error === 'string' && b.error ? b.error : code ? CODE_MESSAGES[code] : fallback;
    return new PortalError(message, code);
  }
  return new PortalError(fallback);
}

/**
 * A save that failed because the attempt is already over. The answers saved
 * before that point stand, so submit should continue rather than fail.
 */
export function isAttemptOverError(error: unknown): boolean {
  return error instanceof PortalError && (error.code === 'already_submitted' || error.code === 'time_limit_exceeded');
}

/**
 * When the exam ends on the candidate's clock: the earlier of started_at +
 * duration and the deadline. The server adds a short grace on top of this.
 */
export function examEndsAt(
  startedAt: string | null | undefined,
  durationMinutes: number | null | undefined,
  deadline: string | null | undefined,
): number | null {
  const bounds: number[] = [];
  if (startedAt && typeof durationMinutes === 'number' && durationMinutes > 0) {
    const s = new Date(startedAt).getTime();
    if (!Number.isNaN(s)) bounds.push(s + durationMinutes * 60_000);
  }
  if (deadline) {
    const d = new Date(deadline).getTime();
    if (!Number.isNaN(d)) bounds.push(d);
  }
  return bounds.length ? Math.min(...bounds) : null;
}
