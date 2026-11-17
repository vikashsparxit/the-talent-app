// Retention cleanup for assessment recordings (webcam and spoken answers).
//
// Service role only (pg_cron via public.invoke_edge_function, or an operator
// with the service role key). Body {dry_run?: boolean, limit?: number}; this
// is a dry run unless dry_run is exactly false. Deletes the R2 objects of
// recordings whose attempt was completed (or started, if never completed)
// more than 90 days ago, except while the candidate is hired
// (candidates.hired_at), then marks the rows status 'deleted' with
// deleted_at and keeps their metadata. Returns a JSON report. The rules live
// in _shared/recordingRetention.ts. Never touches attempts, scores or stages.
//
// Deletes nothing unless an admin has turned on
// system_config.assessment_recording_retention.enabled (Settings ->
// Assessments -> Recording consent); a missing or malformed row counts as
// off. While it is off, a dry run still reports what would be deleted. When
// it is on, recordings that expired before it was turned on are deleted too
// (hired candidates excepted). The daily pg_cron job
// (20261114000004_cleanup_recordings_cron.sql) stays disabled until this
// version of the function is deployed.

import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { requireServiceRole } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadR2Config, presignDelete } from "../_shared/r2.ts";
import {
  type CleanupCandidate,
  parseCleanupRequest,
  parseRecordingRetentionSetting,
  RECORDING_RETENTION_CONFIG_KEY,
  runRecordingCleanup,
} from "../_shared/recordingRetention.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type One<T> = T | T[] | null;
const one = <T>(v: One<T> | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

interface RecordingRow {
  id: string;
  created_at: string;
  candidate_assessment_id: string;
  kind: string;
  status: string;
  deleted_at: string | null;
  bytes: number;
  attempt: One<{
    completed_at: string | null;
    started_at: string | null;
    candidate: One<{ hired_at: string | null }>;
  }>;
}

serveWithCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireServiceRole(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const options = parseCleanupRequest(await req.json().catch(() => null));

    const r2 = loadR2Config((name) => Deno.env.get(name));
    if (!r2) {
      return json({ error: "recording storage not configured", code: "storage_not_configured" }, 503);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: setting, error: settingError } = await admin
      .from("system_config")
      .select("config_value")
      .eq("config_key", RECORDING_RETENTION_CONFIG_KEY)
      .maybeSingle();
    if (settingError) throw settingError;
    const retentionEnabled = parseRecordingRetentionSetting(setting?.config_value).enabled;

    const report = await runRecordingCleanup(
      {
        async listRecordings({ before, after, size }) {
          let query = admin
            .from("assessment_recordings")
            .select(
              "id, created_at, candidate_assessment_id, kind, status, deleted_at, bytes, attempt:candidate_assessments(completed_at, started_at, candidate:candidates(hired_at))",
            )
            .is("deleted_at", null)
            .neq("status", "deleted")
            .lt("created_at", before.toISOString())
            .order("created_at")
            .order("id")
            .limit(size);
          if (after) {
            query = query.or(
              `created_at.gt."${after.created_at}",and(created_at.eq."${after.created_at}",id.gt.${after.id})`,
            );
          }
          const { data, error } = await query;
          if (error) throw error;
          return ((data ?? []) as RecordingRow[]).map((r): CleanupCandidate => {
            const attempt = one(r.attempt);
            return {
              id: r.id,
              created_at: r.created_at,
              candidate_assessment_id: r.candidate_assessment_id,
              kind: r.kind,
              status: r.status,
              deleted_at: r.deleted_at,
              bytes: Number(r.bytes) || 0,
              attempt: attempt ? { completed_at: attempt.completed_at, started_at: attempt.started_at } : null,
              hiredAt: one(attempt?.candidate)?.hired_at ?? null,
            };
          });
        },

        async listObjectKeys(recordingId) {
          const { data, error } = await admin
            .from("assessment_recording_chunks")
            .select("object_key, bytes")
            .eq("recording_id", recordingId);
          if (error) throw error;
          return ((data ?? []) as { object_key: string; bytes: number }[]).map((c) => ({
            key: c.object_key,
            bytes: Number(c.bytes) || 0,
          }));
        },

        async deleteObject(key) {
          const res = await fetch(await presignDelete(r2, { key }), { method: "DELETE" });
          // S3 DELETE is idempotent (204 even when the object is gone); 404 also means gone.
          if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`);
          await res.body?.cancel();
        },

        async markDeleted(recordingId, at) {
          const { error } = await admin
            .from("assessment_recordings")
            .update({ status: "deleted", deleted_at: at.toISOString() })
            .eq("id", recordingId)
            .is("deleted_at", null);
          if (error) throw error;
        },
      },
      options,
      retentionEnabled,
      new Date(),
    );

    console.log(
      `cleanup-recordings: dry_run=${report.dry_run} retention_enabled=${report.retention_enabled} scanned=${report.scanned} deleted=${report.deleted} objects=${report.objects} would_delete=${report.would_delete} skipped_hired=${report.skipped_hired} failed=${report.failed.length}`,
    );
    return json({ success: true, data: report });
  } catch (error) {
    return errorResponse("cleanup-recordings", error, corsHeaders);
  }
});
