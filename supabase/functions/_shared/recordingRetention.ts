// Retention for assessment recordings (webcam and spoken answers). Pure
// rules and the cleanup run with injected storage/database calls, so the
// vitest suite (src/test/recordingRetention.test.ts) covers them without Deno
// or network. The cleanup-recordings edge function wires in Supabase and R2.
//
// Rule: a recording's files are deleted 90 days after its attempt was
// completed (or started, if it was never completed), unless the candidate is
// hired (candidates.hired_at is set). The row is kept with status 'deleted'
// and deleted_at, so reviewers see that a recording existed. There is no
// end-of-employment field yet: a hired candidate's recordings are kept until
// hired_at is cleared, then the 90 days count from the attempt as usual.
//
// Deletion only happens while an admin has turned on
// system_config.assessment_recording_retention (Settings -> Assessments ->
// Recording consent). When it is on, everything past the rule is deleted,
// including recordings that expired before it was turned on.

export const RECORDING_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RECORDING_RETENTION_CONFIG_KEY = "assessment_recording_retention";

/** Stored in system_config.assessment_recording_retention. */
export interface RecordingRetentionSetting {
  enabled: boolean;
  enabled_at: string | null;
  enabled_by: string | null;
  updated_at: string | null;
}

/** Missing or malformed values read as off. */
export function parseRecordingRetentionSetting(raw: unknown): RecordingRetentionSetting {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    enabled: c.enabled === true,
    enabled_at: text(c.enabled_at),
    enabled_by: text(c.enabled_by),
    updated_at: text(c.updated_at),
  };
}

export interface RetentionRecording {
  status: string;
  deleted_at: string | null;
}

export interface RetentionAttempt {
  completed_at: string | null;
  started_at: string | null;
}

export interface HiredInfo {
  /** candidates.hired_at; set while the candidate is hired. */
  hiredAt: string | null;
}

export type RetentionDecision =
  | { expired: true; reason: "expired" }
  | { expired: false; reason: "already_deleted" | "hired" | "not_expired" | "no_attempt_date" };

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** When the retention period starts: completion, else the start of an attempt that was never completed. */
export function retentionStart(attempt: RetentionAttempt): Date | null {
  const t = time(attempt.completed_at) ?? time(attempt.started_at);
  return t === null ? null : new Date(t);
}

/** completed (or started) + 90 days, for display; null without either date. */
export function retentionUntil(attempt: RetentionAttempt, days: number = RECORDING_RETENTION_DAYS): Date | null {
  const start = retentionStart(attempt);
  return start ? new Date(start.getTime() + days * DAY_MS) : null;
}

export function isRecordingExpired(
  recording: RetentionRecording,
  attempt: RetentionAttempt,
  hired: HiredInfo,
  now: Date,
  days: number = RECORDING_RETENTION_DAYS,
): RetentionDecision {
  if (recording.status === "deleted" || recording.deleted_at) return { expired: false, reason: "already_deleted" };
  if (hired.hiredAt) return { expired: false, reason: "hired" };
  const until = retentionUntil(attempt, days);
  if (!until) return { expired: false, reason: "no_attempt_date" };
  return now.getTime() >= until.getTime() ? { expired: true, reason: "expired" } : { expired: false, reason: "not_expired" };
}

// ── Cleanup run ─────────────────────────────────────────────────────────────

export const CLEANUP_DEFAULT_LIMIT = 100;
export const CLEANUP_MAX_LIMIT = 500;

export interface CleanupOptions {
  dryRun: boolean;
  /** Most recordings to delete in one run. */
  limit: number;
}

/** Body {dry_run?, limit?}. Dry run unless dry_run is exactly false. */
export function parseCleanupRequest(raw: unknown): CleanupOptions {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const limit = typeof d.limit === "number" && Number.isInteger(d.limit) && d.limit > 0
    ? Math.min(d.limit, CLEANUP_MAX_LIMIT)
    : CLEANUP_DEFAULT_LIMIT;
  return { dryRun: d.dry_run !== false, limit };
}

export interface CleanupCandidate {
  id: string;
  created_at: string;
  candidate_assessment_id: string;
  kind: string;
  status: string;
  deleted_at: string | null;
  bytes: number;
  attempt: RetentionAttempt | null;
  hiredAt: string | null;
}

export interface CleanupDeps {
  /**
   * Not-deleted recordings created before `before`, ordered by (created_at, id),
   * starting after `after` (keyset paging, so rows marked deleted meanwhile do not shift pages).
   */
  listRecordings(page: {
    before: Date;
    after: { created_at: string; id: string } | null;
    size: number;
  }): Promise<CleanupCandidate[]>;
  listObjectKeys(recordingId: string): Promise<{ key: string; bytes: number }[]>;
  /** Deletes one object from storage (a missing object counts as deleted). */
  deleteObject(key: string): Promise<void>;
  markDeleted(recordingId: string, at: Date): Promise<void>;
}

export interface CleanupReport {
  dry_run: boolean;
  /** The admin setting; while false nothing is deleted. */
  retention_enabled: boolean;
  retention_days: number;
  cutoff: string;
  scanned: number;
  /** Deleted, or that would be deleted in a dry run. Always 0 while retention is off. */
  deleted: number;
  deleted_ids: string[];
  /** Dry run with retention off: what would be deleted if it were on. */
  would_delete: number;
  would_delete_ids: string[];
  objects: number;
  bytes: number;
  skipped_hired: number;
  skipped_hired_ids: string[];
  not_expired: number;
  failed: { id: string; error: string }[];
}

const PAGE_SIZE = 200;
const MAX_SCANNED = 2000;

/**
 * Finds expired recordings and, unless dryRun, deletes their objects and
 * marks the rows deleted. A recording is only marked deleted when every one
 * of its objects was removed; otherwise it is reported as failed and tried
 * again on the next run. A recording is created after its attempt starts, so
 * only rows older than the retention period can have expired.
 *
 * With retention off nothing is deleted: a real run returns at once, and a
 * dry run reports what would be deleted in would_delete / would_delete_ids.
 */
export async function runRecordingCleanup(
  deps: CleanupDeps,
  options: CleanupOptions,
  retentionEnabled: boolean,
  now: Date,
  days: number = RECORDING_RETENTION_DAYS,
): Promise<CleanupReport> {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const report: CleanupReport = {
    dry_run: options.dryRun,
    retention_enabled: retentionEnabled,
    retention_days: days,
    cutoff: cutoff.toISOString(),
    scanned: 0,
    deleted: 0,
    deleted_ids: [],
    would_delete: 0,
    would_delete_ids: [],
    objects: 0,
    bytes: 0,
    skipped_hired: 0,
    skipped_hired_ids: [],
    not_expired: 0,
    failed: [],
  };
  if (!retentionEnabled && !options.dryRun) return report;

  let matched = 0;
  let after: { created_at: string; id: string } | null = null;
  while (matched < options.limit && report.scanned < MAX_SCANNED) {
    const page = await deps.listRecordings({ before: cutoff, after, size: PAGE_SIZE });
    for (const rec of page) {
      if (matched >= options.limit) break;
      report.scanned++;
      const decision = rec.attempt
        ? isRecordingExpired(rec, rec.attempt, { hiredAt: rec.hiredAt }, now, days)
        : ({ expired: false, reason: "no_attempt_date" } as const);
      if (!decision.expired) {
        if (decision.reason === "hired") {
          report.skipped_hired++;
          report.skipped_hired_ids.push(rec.id);
        } else if (decision.reason !== "already_deleted") {
          report.not_expired++;
        }
        continue;
      }
      try {
        const objects = await deps.listObjectKeys(rec.id);
        if (retentionEnabled && !options.dryRun) {
          for (const o of objects) await deps.deleteObject(o.key);
          await deps.markDeleted(rec.id, now);
        }
        matched++;
        if (retentionEnabled) {
          report.deleted++;
          report.deleted_ids.push(rec.id);
        } else {
          report.would_delete++;
          report.would_delete_ids.push(rec.id);
        }
        report.objects += objects.length;
        report.bytes += objects.reduce((sum, o) => sum + (Number(o.bytes) || 0), 0);
      } catch (error) {
        report.failed.push({ id: rec.id, error: error instanceof Error ? error.message : "cleanup failed" });
      }
    }
    const last = page[page.length - 1];
    if (page.length < PAGE_SIZE || !last) break;
    after = { created_at: last.created_at, id: last.id };
  }
  return report;
}
