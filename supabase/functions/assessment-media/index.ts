// Assessment media: consent, webcam recording chunks and spoken-answer uploads
// to a private Cloudflare R2 bucket (presigned URLs), and staff playback.
//
// Candidate actions authorise like candidate-portal (magic-link access_token,
// or a signed-in applicant JWT that owns candidate_assessment_id) and only run
// while the attempt is in progress (consent-status is read-only). Staff playback requires a staff JWT and
// re-checks the viewer rule server-side. Recordings never change the attempt:
// no submit, stage change, score or rejection happens here.

import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSectionAssessmentId } from "../_shared/assessmentPortal.ts";
import { type PortalAttempt, resolvePortalAttempt } from "../_shared/portalAttempt.ts";
import {
  loadR2Config,
  presignGet,
  presignPut,
  type R2Config,
  recordingChunkKey,
  recordingPrefix,
  spokenAnswerKey,
} from "../_shared/r2.ts";
import {
  CHUNK_MAX_BYTES,
  MAX_SPOKEN_ATTEMPTS,
  assignSpokenAttempt,
  type CandidateMediaAction,
  decidePlaybackAccess,
  extensionForMime,
  gateMediaWrite,
  isCandidateMediaAction,
  isStaffMediaAction,
  nextChunkSeq,
  parseChunkDone,
  parseChunkUrl,
  parsePlaybackRequest,
  parseRecordConsent,
  parseRecordingFinish,
  parseRecordingStart,
  parseSpokenConfig,
  parseSpokenUpload,
  plausibleCapturedAt,
  playbackChunks,
  spokenPrefix,
} from "../_shared/assessmentMedia.ts";
import { retentionUntil } from "../_shared/recordingRetention.ts";
import {
  decideConsentRecord,
  MEDIA_CONSENT_CONFIG_KEY,
  type MediaConsentCurrent,
  resolveMediaConsent,
} from "../_shared/mediaConsent.ts";

type AdminClient = SupabaseClient;

interface RecordingRow {
  id: string;
  candidate_assessment_id: string;
  kind: string;
  question_id: string | null;
  status: string;
  mime: string;
  storage_prefix: string;
  chunk_count: number;
  bytes: number;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  deleted_at: string | null;
}

const RECORDING_SELECT =
  "id, candidate_assessment_id, kind, question_id, status, mime, storage_prefix, chunk_count, bytes, duration_seconds, started_at, ended_at, deleted_at";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function objectKeyFor(rec: RecordingRow, seq: number): string {
  const ext = extensionForMime(rec.mime);
  if (rec.kind === "spoken_answer" && rec.question_id) {
    return spokenAnswerKey(rec.candidate_assessment_id, rec.question_id, seq, ext);
  }
  return recordingChunkKey(rec.candidate_assessment_id, rec.id, seq, ext);
}

async function loadOwnRecording(admin: AdminClient, attemptId: string, recordingId: string): Promise<RecordingRow | null> {
  const { data, error } = await admin
    .from("assessment_recordings")
    .select(RECORDING_SELECT)
    .eq("id", recordingId)
    .eq("candidate_assessment_id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data as RecordingRow | null;
}

async function loadConsent(admin: AdminClient, attemptId: string) {
  const { data, error } = await admin
    .from("assessment_media_consents")
    .select("consent_version, consented_at")
    .eq("candidate_assessment_id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data as { consent_version: string; consented_at: string } | null;
}

/** The consent text candidates must agree to now; the version is recomputed from the stored fields. */
async function loadCurrentConsent(admin: AdminClient): Promise<MediaConsentCurrent> {
  const { data, error } = await admin
    .from("system_config")
    .select("config_value")
    .eq("config_key", MEDIA_CONSENT_CONFIG_KEY)
    .maybeSingle();
  if (error) throw error;
  return await resolveMediaConsent((data as { config_value: unknown } | null)?.config_value);
}

async function maxChunkSeq(admin: AdminClient, recordingId: string): Promise<number | null> {
  const { data, error } = await admin
    .from("assessment_recording_chunks")
    .select("seq")
    .eq("recording_id", recordingId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { seq: number } | null)?.seq ?? null;
}

async function handleCandidate(
  admin: AdminClient,
  r2: R2Config,
  action: CandidateMediaAction,
  attempt: PortalAttempt,
  data: unknown,
): Promise<Response> {
  const now = new Date();
  const gate = gateMediaWrite(action, {
    status: attempt.status,
    timeLimit: attempt.timeLimit,
    completedAt: attempt.completed_at,
    deadline: attempt.deadline,
    now,
  });
  if (!gate.allowed) return json({ error: gate.error, code: gate.code }, gate.status);

  switch (action) {
    case "consent-status": {
      // Consent counts only for the current text: after an edit the candidate is asked again.
      const [consent, current] = await Promise.all([loadConsent(admin, attempt.id), loadCurrentConsent(admin)]);
      return json({
        success: true,
        data: {
          consented: consent?.consent_version === current.version,
          consent_version_on_file: consent?.consent_version ?? null,
          current,
        },
      });
    }

    case "record-consent": {
      const parsed = parseRecordConsent(data);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const current = await loadCurrentConsent(admin);
      const decision = decideConsentRecord(parsed.value.consentVersion, current.version);
      if (!decision.ok) return json({ error: decision.error, code: decision.code }, decision.status);
      const consentedAt = now.toISOString();
      const { error } = await admin.from("assessment_media_consents").upsert(
        { candidate_assessment_id: attempt.id, consent_version: decision.consentVersion, consented_at: consentedAt },
        { onConflict: "candidate_assessment_id" },
      );
      if (error) throw error;
      return json({ success: true, data: { consented_at: consentedAt, consent_version: decision.consentVersion } });
    }

    case "recording-start": {
      const parsed = parseRecordingStart(data);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const consent = await loadConsent(admin, attempt.id);
      if (!consent) return json({ error: "Consent to recording is required first", code: "consent_required" }, 409);

      const { data: active, error: activeError } = await admin
        .from("assessment_recordings")
        .select(RECORDING_SELECT)
        .eq("candidate_assessment_id", attempt.id)
        .eq("kind", "webcam")
        .eq("status", "recording")
        .order("started_at", { ascending: false });
      if (activeError) throw activeError;

      // Resume after a reconnect when the browser records the same format.
      const activeRows = (active ?? []) as RecordingRow[];
      const resumable = activeRows.find((r) => r.mime === parsed.value.mime);
      for (const r of activeRows) {
        if (r === resumable) continue;
        await admin
          .from("assessment_recordings")
          .update({ status: "interrupted", ended_at: now.toISOString() })
          .eq("id", r.id)
          .eq("status", "recording");
      }
      if (resumable) {
        return json({
          success: true,
          data: {
            recording_id: resumable.id,
            mime: resumable.mime,
            next_seq: nextChunkSeq(await maxChunkSeq(admin, resumable.id)),
            resumed: true,
          },
        });
      }

      const id = crypto.randomUUID();
      const { error } = await admin.from("assessment_recordings").insert({
        id,
        candidate_assessment_id: attempt.id,
        kind: "webcam",
        status: "recording",
        mime: parsed.value.mime,
        storage_provider: "r2",
        storage_prefix: recordingPrefix(attempt.id, id),
        consent_at: consent.consented_at,
        consent_version: consent.consent_version,
        started_at: now.toISOString(),
      });
      if (error) throw error;
      return json({ success: true, data: { recording_id: id, mime: parsed.value.mime, next_seq: 0, resumed: false } });
    }

    case "chunk-url": {
      const parsed = parseChunkUrl(data);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const rec = await loadOwnRecording(admin, attempt.id, parsed.value.recordingId);
      if (!rec || rec.kind !== "webcam") return json({ error: "Recording not found" }, 404);
      if (rec.status !== "recording") return json({ error: "Recording is not active", code: "recording_closed" }, 409);
      if (parsed.value.mime !== rec.mime) return json({ error: "Chunk type does not match the recording" }, 400);

      const key = objectKeyFor(rec, parsed.value.seq);
      const url = await presignPut(r2, { key, contentType: rec.mime });
      return json({ success: true, data: { url, key, content_type: rec.mime, seq: parsed.value.seq } });
    }

    case "chunk-done": {
      const parsed = parseChunkDone(data);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const rec = await loadOwnRecording(admin, attempt.id, parsed.value.recordingId);
      if (!rec) return json({ error: "Recording not found" }, 404);
      if (rec.status === "deleted") return json({ error: "Recording is not active", code: "recording_closed" }, 409);
      if (rec.kind === "webcam" && parsed.value.bytes > CHUNK_MAX_BYTES) {
        return json({ error: "Chunk exceeds the 8 MB limit" }, 400);
      }
      if (rec.kind === "spoken_answer" && (parsed.value.seq < 1 || parsed.value.seq > MAX_SPOKEN_ATTEMPTS)) {
        return json({ error: "seq must be the spoken attempt number" }, 400);
      }

      const uploadedAt = now.toISOString();
      const { error: upsertError } = await admin.from("assessment_recording_chunks").upsert(
        {
          recording_id: rec.id,
          seq: parsed.value.seq,
          object_key: objectKeyFor(rec, parsed.value.seq),
          bytes: parsed.value.bytes,
          uploaded_at: uploadedAt,
          captured_at: plausibleCapturedAt(parsed.value.capturedAt, now),
          duration_ms: parsed.value.durationMs,
        },
        { onConflict: "recording_id,seq" },
      );
      if (upsertError) throw upsertError;

      // Recount instead of incrementing so retried calls stay correct.
      const { data: chunks, error: countError } = await admin
        .from("assessment_recording_chunks")
        .select("bytes")
        .eq("recording_id", rec.id);
      if (countError) throw countError;
      const rows = (chunks ?? []) as { bytes: number }[];
      const { error } = await admin
        .from("assessment_recordings")
        .update({
          chunk_count: rows.length,
          bytes: rows.reduce((sum, c) => sum + Number(c.bytes || 0), 0),
          last_chunk_at: uploadedAt,
        })
        .eq("id", rec.id);
      if (error) throw error;
      return json({ success: true, data: { chunk_count: rows.length } });
    }

    case "recording-finish": {
      const parsed = parseRecordingFinish(data);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const rec = await loadOwnRecording(admin, attempt.id, parsed.value.recordingId);
      if (!rec) return json({ error: "Recording not found" }, 404);
      if (rec.status !== "recording") return json({ success: true, data: { status: rec.status } });

      const { error } = await admin
        .from("assessment_recordings")
        .update({
          status: parsed.value.status,
          ended_at: now.toISOString(),
          // For display, counted from completion (or now, if not submitted yet). cleanup-recordings
          // decides from the attempt itself and skips hired candidates.
          retention_until: retentionUntil({
            completed_at: attempt.completed_at ?? now.toISOString(),
            started_at: attempt.started_at,
          })?.toISOString() ?? null,
          ...(parsed.value.durationSeconds !== null ? { duration_seconds: parsed.value.durationSeconds } : {}),
        })
        .eq("id", rec.id)
        .eq("status", "recording");
      if (error) throw error;
      return json({ success: true, data: { status: parsed.value.status } });
    }

    case "spoken-upload-url": {
      const parsed = parseSpokenUpload(data);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const consent = await loadConsent(admin, attempt.id);
      if (!consent) return json({ error: "Consent to recording is required first", code: "consent_required" }, 409);

      const { data: question, error: qError } = await admin
        .from("questions")
        .select("id, type, spoken_config, section:assessment_sections!inner(assessment_id)")
        .eq("id", parsed.value.questionId)
        .maybeSingle();
      if (qError || !question || question.type !== "spoken" ||
        getSectionAssessmentId(question.section) !== attempt.assessment_id) {
        return json({ error: "Invalid spoken question for this assessment" }, 400);
      }
      const { data: existing, error: exError } = await admin
        .from("assessment_recordings")
        .select(RECORDING_SELECT)
        .eq("candidate_assessment_id", attempt.id)
        .eq("kind", "spoken_answer")
        .eq("question_id", parsed.value.questionId)
        .maybeSingle();
      if (exError) throw exError;

      const cfg = parseSpokenConfig(question.spoken_config);
      const attemptNo = assignSpokenAttempt(
        parsed.value.attempt,
        existing ? await maxChunkSeq(admin, existing.id) : null,
      );
      if (attemptNo > cfg.max_attempts) {
        return json({ error: "No attempts left for this question", code: "attempts_exhausted" }, 409);
      }

      const fields = {
        status: "recording",
        mime: parsed.value.mime,
        consent_at: consent.consented_at,
        consent_version: consent.consent_version,
        started_at: now.toISOString(),
        ended_at: null,
      };
      let rec: RecordingRow;
      if (existing) {
        const { data: updated, error } = await admin
          .from("assessment_recordings")
          .update(fields)
          .eq("id", existing.id)
          .select(RECORDING_SELECT)
          .single();
        if (error) throw error;
        rec = updated as RecordingRow;
      } else {
        const { data: inserted, error } = await admin
          .from("assessment_recordings")
          .insert({
            ...fields,
            candidate_assessment_id: attempt.id,
            kind: "spoken_answer",
            question_id: parsed.value.questionId,
            storage_provider: "r2",
            storage_prefix: spokenPrefix(attempt.id, parsed.value.questionId),
          })
          .select(RECORDING_SELECT)
          .single();
        if (error) throw error;
        rec = inserted as RecordingRow;
      }

      const key = objectKeyFor(rec, attemptNo);
      const url = await presignPut(r2, { key, contentType: rec.mime });
      return json({
        success: true,
        data: { recording_id: rec.id, url, key, content_type: rec.mime, seq: attemptNo },
      });
    }
  }
}

async function handlePlayback(admin: AdminClient, r2: R2Config, req: Request, data: unknown): Promise<Response> {
  const auth = await requireAuth(req, admin, corsHeaders);
  if (!auth.ok) return auth.response;
  if (!auth.userId) return json({ error: "Unauthorized" }, 401);
  const userId = auth.userId;

  const parsed = parsePlaybackRequest(data);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const request = parsed.value;

  type AttemptRef = { candidate_id: string; job_id: string | null; candidate: unknown };
  const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  let rec: RecordingRow | null;
  let attempt: AttemptRef | null;

  if ("recordingId" in request) {
    const { data: recData, error: recError } = await admin
      .from("assessment_recordings")
      .select(`${RECORDING_SELECT}, attempt:candidate_assessments(candidate_id, job_id, candidate:candidates(job_id))`)
      .eq("id", request.recordingId)
      .maybeSingle();
    if (recError) throw recError;
    const row = recData as (RecordingRow & { attempt: unknown }) | null;
    rec = row;
    attempt = one(row?.attempt as AttemptRef | null);
  } else {
    // Spoken answer by attempt + question: authorise on the attempt first.
    const { data: caData, error: caError } = await admin
      .from("candidate_assessments")
      .select("candidate_id, job_id, candidate:candidates(job_id)")
      .eq("id", request.candidateAssessmentId)
      .maybeSingle();
    if (caError) throw caError;
    attempt = caData as AttemptRef | null;
    const { data: recData, error: recError } = attempt
      ? await admin
        .from("assessment_recordings")
        .select(RECORDING_SELECT)
        .eq("candidate_assessment_id", request.candidateAssessmentId)
        .eq("kind", "spoken_answer")
        .eq("question_id", request.questionId)
        .maybeSingle()
      : { data: null, error: null };
    if (recError) throw recError;
    rec = recData as RecordingRow | null;
  }
  const jobId = attempt ? attempt.job_id ?? one(attempt.candidate as { job_id: string | null } | null)?.job_id ?? null : null;

  // Same rule as the RLS helper can_view_assessment_media, evaluated for the verified caller.
  const check = async (fn: string, args: Record<string, unknown>): Promise<boolean> => {
    const { data: ok, error } = await admin.rpc(fn, args);
    if (error) throw error;
    return ok === true;
  };
  const [isAdminOrHr, isRecruiterForJob, isInterviewerForAttempt] = attempt
    ? await Promise.all([
      check("is_admin_or_hr", { _user_id: userId }),
      jobId ? check("is_recruiter_for_job", { _user_id: userId, _job_id: jobId }) : Promise.resolve(false),
      check("can_interviewer_view_candidate_assessment", {
        _user_id: userId,
        _candidate_id: attempt.candidate_id,
        _job_id: attempt.job_id,
      }),
    ])
    : [false, false, false];

  const decision = decidePlaybackAccess({
    recordingFound: !!rec && !!attempt,
    attemptFound: !!attempt,
    isAdminOrHr,
    isRecruiterForJob,
    isInterviewerForAttempt,
    status: rec?.status ?? null,
    deletedAt: rec?.deleted_at ?? null,
  });
  if (!decision.allowed) return json({ error: decision.error, code: decision.code }, decision.status);
  if (!rec) return json({ error: "You do not have access to this recording" }, 403);

  const { data: chunkRows, error: chunkError } = await admin
    .from("assessment_recording_chunks")
    .select("seq, object_key, bytes, captured_at, duration_ms")
    .eq("recording_id", rec.id)
    .order("seq");
  if (chunkError) throw chunkError;

  const expiresIn = r2.defaultExpiresIn;
  const chunks = playbackChunks(
    rec.kind,
    (chunkRows ?? []) as {
      seq: number;
      object_key: string;
      bytes: number;
      captured_at: string | null;
      duration_ms: number | null;
    }[],
    "attempt" in request ? request.attempt : null,
  );
  const urls = await Promise.all(
    chunks.map(async (c) => ({
      seq: c.seq,
      bytes: c.bytes,
      captured_at: c.captured_at,
      duration_ms: c.duration_ms,
      url: await presignGet(r2, { key: c.object_key, expiresIn, responseContentType: rec.mime }),
    })),
  );

  return json({
    success: true,
    data: {
      recording: {
        id: rec.id,
        kind: rec.kind,
        question_id: rec.question_id,
        status: rec.status,
        mime: rec.mime,
        chunk_count: rec.chunk_count,
        bytes: rec.bytes,
        duration_seconds: rec.duration_seconds,
        started_at: rec.started_at,
        ended_at: rec.ended_at,
      },
      urls,
      expires_in: expiresIn,
    },
  });
}

serveWithCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const r2 = loadR2Config((name) => Deno.env.get(name));
    if (!r2) {
      return json({ error: "recording storage not configured", code: "storage_not_configured" }, 503);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => null) as
      | { action?: unknown; access_token?: unknown; candidate_assessment_id?: unknown; data?: unknown }
      | null;
    const action = body?.action;

    if (isStaffMediaAction(action)) {
      return await handlePlayback(admin, r2, req, body?.data);
    }
    if (!isCandidateMediaAction(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    const resolved = await resolvePortalAttempt(
      admin,
      req,
      { accessToken: body?.access_token, candidateAssessmentId: body?.candidate_assessment_id },
      corsHeaders,
    );
    if (!resolved.ok) {
      return resolved.response ?? json({ error: resolved.error, code: resolved.code }, resolved.status);
    }

    return await handleCandidate(admin, r2, action, resolved.attempt, body?.data);
  } catch (error) {
    return errorResponse("assessment-media", error, corsHeaders);
  }
});
