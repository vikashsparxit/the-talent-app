// Pure helpers for the candidate assessment portal. No Deno or network APIs,
// so the same rules run in the edge function and in unit tests.

export const ASSESSMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const ASSESSMENT_FILE_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

/** Question types that need AI (or human) grading after submit. MCQ is scored by a DB trigger. */
export const GRADEABLE_QUESTION_TYPES: ReadonlySet<string> = new Set(["subjective", "coding", "file_upload"]);

/** Fields a candidate must never be able to set on a response. */
const CLIENT_SCORE_FIELDS = ["execution_result", "auto_score", "final_score", "manual_score"] as const;

export interface FileConfig {
  allow_file: boolean;
  allow_link: boolean;
  allowed_mime_types: string[];
  max_file_bytes: number;
}

export interface LinkPolicy {
  /** Link lifetime when the assignment has no deadline. */
  expiry_days_without_deadline: number;
  /** How long a link stays usable after the deadline. */
  expiry_grace_hours_after_deadline: number;
  /** Allowance for clock skew and the final save before the time limit is enforced. */
  time_limit_grace_seconds: number;
}

export const DEFAULT_LINK_POLICY: LinkPolicy = {
  expiry_days_without_deadline: 14,
  expiry_grace_hours_after_deadline: 24,
  time_limit_grace_seconds: 120,
};

function positiveNumber(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
}

/** Reads system_config.assessment_link_policy, falling back to defaults for missing or bad values. */
export function parseLinkPolicy(raw: unknown): LinkPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_LINK_POLICY };
  const o = raw as Record<string, unknown>;
  return {
    expiry_days_without_deadline: positiveNumber(
      o.expiry_days_without_deadline,
      DEFAULT_LINK_POLICY.expiry_days_without_deadline,
      365,
    ),
    expiry_grace_hours_after_deadline: positiveNumber(
      o.expiry_grace_hours_after_deadline,
      DEFAULT_LINK_POLICY.expiry_grace_hours_after_deadline,
      24 * 30,
    ),
    time_limit_grace_seconds: positiveNumber(
      o.time_limit_grace_seconds,
      DEFAULT_LINK_POLICY.time_limit_grace_seconds,
      3600,
    ),
  };
}

/** A null expiry never expires (rows created before expiry was enforced). */
export function isTokenExpired(tokenExpiresAt: string | null | undefined, now: Date): boolean {
  if (!tokenExpiresAt) return false;
  const t = new Date(tokenExpiresAt).getTime();
  return !Number.isNaN(t) && t <= now.getTime();
}

/**
 * The moment after which an in-progress attempt may no longer save or submit
 * answers: the earlier of started_at + duration and the deadline, plus grace.
 * Returns null when neither bound applies.
 */
export function attemptTimeLimit(
  params: { startedAt: string | null | undefined; durationMinutes: number | null | undefined; deadline: string | null | undefined },
  graceSeconds: number = DEFAULT_LINK_POLICY.time_limit_grace_seconds,
): Date | null {
  const bounds: number[] = [];
  if (params.startedAt && typeof params.durationMinutes === "number" && params.durationMinutes > 0) {
    const s = new Date(params.startedAt).getTime();
    if (!Number.isNaN(s)) bounds.push(s + params.durationMinutes * 60_000);
  }
  if (params.deadline) {
    const d = new Date(params.deadline).getTime();
    if (!Number.isNaN(d)) bounds.push(d);
  }
  if (!bounds.length) return null;
  return new Date(Math.min(...bounds) + Math.max(0, graceSeconds) * 1000);
}

export function isPastTimeLimit(limit: Date | null, now: Date): boolean {
  return limit !== null && now.getTime() > limit.getTime();
}

export function isAllowedGoogleDriveLink(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "drive.google.com") return true;
  if (host === "docs.google.com") {
    return ["/file/", "/document/", "/spreadsheets/", "/presentation/", "/forms/"].some((p) =>
      url.pathname.startsWith(p)
    );
  }
  return false;
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
  return base || "upload";
}

export function parseFileConfig(raw: unknown): FileConfig {
  const defaults: FileConfig = {
    allow_file: true,
    allow_link: true,
    allowed_mime_types: [...ASSESSMENT_FILE_MIMES],
    max_file_bytes: ASSESSMENT_FILE_MAX_BYTES,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const o = raw as Record<string, unknown>;
  let allow_file = o.allow_file !== false;
  let allow_link = o.allow_link !== false;
  if (!allow_file && !allow_link) {
    allow_file = true;
    allow_link = true;
  }
  const allowed = Array.isArray(o.allowed_mime_types)
    ? o.allowed_mime_types.filter((m): m is string => typeof m === "string")
    : defaults.allowed_mime_types;
  const max =
    typeof o.max_file_bytes === "number" && o.max_file_bytes > 0
      ? Math.min(o.max_file_bytes, ASSESSMENT_FILE_MAX_BYTES)
      : ASSESSMENT_FILE_MAX_BYTES;
  return { allow_file, allow_link, allowed_mime_types: allowed, max_file_bytes: max };
}

export function stripClientScoreFields(response: unknown): unknown {
  if (!response || typeof response !== "object" || Array.isArray(response)) return response;
  const clone = { ...(response as Record<string, unknown>) };
  for (const field of CLIENT_SCORE_FIELDS) delete clone[field];
  return clone;
}

export function getSectionAssessmentId(section: unknown): string | null {
  if (!section) return null;
  if (Array.isArray(section)) {
    const first = section[0] as { assessment_id?: string } | undefined;
    return first?.assessment_id ?? null;
  }
  if (typeof section === "object" && "assessment_id" in section) {
    return (section as { assessment_id: string }).assessment_id;
  }
  return null;
}

/** The question row shape the portal loads: questions(id, type, file_config, section:assessment_sections(assessment_id)). */
export interface PortalQuestionRow {
  id: string;
  type: string;
  file_config?: unknown;
  section?: unknown;
}

export type SanitizeResult =
  | { ok: true; response: unknown }
  | { ok: false; error: string };

/**
 * Validates one candidate answer against its question and returns the value to
 * store. Used by save-response and auto-complete so both apply the same rules:
 * the question must belong to the attempt's assessment, client score fields are
 * dropped, and file/link answers must match the question's file config.
 */
export function sanitizeResponseForQuestion(
  question: PortalQuestionRow | null | undefined,
  ctx: { candidateAssessmentId: string; assessmentId: string; questionId: string },
  response: unknown,
): SanitizeResult {
  if (!question || question.id !== ctx.questionId) {
    return { ok: false, error: "Invalid question for this assessment" };
  }
  if (getSectionAssessmentId(question.section) !== ctx.assessmentId) {
    return { ok: false, error: "Invalid question for this assessment" };
  }

  if (question.type !== "file_upload") {
    return { ok: true, response: stripClientScoreFields(response) };
  }

  const cfg = parseFileConfig(question.file_config);
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { ok: false, error: "Invalid file upload response" };
  }
  const resp = response as Record<string, unknown>;
  const file = resp.file && typeof resp.file === "object" && !Array.isArray(resp.file)
    ? (resp.file as Record<string, unknown>)
    : null;
  const link = resp.link && typeof resp.link === "object" && !Array.isArray(resp.link)
    ? (resp.link as Record<string, unknown>)
    : null;

  if (file) {
    if (!cfg.allow_file) return { ok: false, error: "File upload is not allowed for this question" };
    const path = typeof file.path === "string" ? file.path : "";
    const expectedPrefix = `${ctx.candidateAssessmentId}/${ctx.questionId}/`;
    if (!path.startsWith(expectedPrefix) || path.includes("..")) {
      return { ok: false, error: "Invalid uploaded file path" };
    }
    if (typeof file.mime === "string" && !cfg.allowed_mime_types.includes(file.mime)) {
      return { ok: false, error: "File type not allowed" };
    }
    if (typeof file.size === "number" && file.size > cfg.max_file_bytes) {
      return { ok: false, error: "File exceeds the 10 MB limit. Please use a Google Drive link instead." };
    }
  }

  if (link) {
    if (!cfg.allow_link) return { ok: false, error: "Drive links are not allowed for this question" };
    if (!isAllowedGoogleDriveLink(link.url)) {
      return { ok: false, error: "Only Google Drive / Docs share links are allowed" };
    }
  }

  if (!file && !link) return { ok: false, error: "Provide a file upload or a Google Drive link" };

  const mode = file && link ? "both" : file ? "file" : "link";
  return {
    ok: true,
    response: {
      mode,
      ...(file ? { file: { path: file.path, name: file.name, mime: file.mime, size: file.size } } : {}),
      ...(link
        ? {
            link: {
              url: String(link.url).trim(),
              ...(typeof link.label === "string" ? { label: link.label } : {}),
            },
          }
        : {}),
    },
  };
}

export type AttemptStatus = "invited" | "in_progress" | "completed" | "evaluated" | "expired" | string;

export type WriteGate =
  | { allowed: true }
  | { allowed: false; status: number; code: "already_submitted" | "not_started" | "time_limit_exceeded"; error: string };

/** Whether a save/upload may proceed for an attempt in this state at this time. */
export function gateAnswerWrite(status: AttemptStatus, limit: Date | null, now: Date): WriteGate {
  if (status === "completed" || status === "evaluated") {
    return { allowed: false, status: 409, code: "already_submitted", error: "This assessment has already been submitted" };
  }
  if (status !== "in_progress") {
    return { allowed: false, status: 400, code: "not_started", error: "Assessment not in progress" };
  }
  if (isPastTimeLimit(limit, now)) {
    return {
      allowed: false,
      status: 409,
      code: "time_limit_exceeded",
      error: "The time limit for this assessment has passed. Your saved answers have been submitted.",
    };
  }
  return { allowed: true };
}

/** Grading state stored on candidate_assessments.grading_status. */
export type GradingStatus = "queued" | "grading" | "graded" | "failed" | "not_required" | null;

export function needsAiGrading(questionTypes: Iterable<string>): boolean {
  for (const t of questionTypes) if (GRADEABLE_QUESTION_TYPES.has(t)) return true;
  return false;
}

/** A queued request older than this is treated as lost and may be re-sent. */
export const GRADING_REQUEUE_AFTER_MS = 10 * 60_000;
/** A grading run older than this is treated as crashed and may be claimed again. */
export const GRADING_STALE_AFTER_MS = 15 * 60_000;

/** Whether a repeat notify/submit should re-send the grading request. */
export function shouldRequeueGrading(
  status: GradingStatus,
  requestedAt: string | null | undefined,
  now: Date,
): boolean {
  if (status === null) return true;
  if (status !== "queued") return false;
  if (!requestedAt) return true;
  const t = new Date(requestedAt).getTime();
  return Number.isNaN(t) || now.getTime() - t >= GRADING_REQUEUE_AFTER_MS;
}

/**
 * PostgREST `or` filter for claiming a grading run atomically: the row is free
 * unless another run is in progress and still fresh.
 */
export function gradingClaimFilter(now: Date): string {
  const staleBefore = new Date(now.getTime() - GRADING_STALE_AFTER_MS).toISOString();
  return `grading_status.is.null,grading_status.neq.grading,grading_started_at.is.null,grading_started_at.lt.${staleBefore}`;
}
