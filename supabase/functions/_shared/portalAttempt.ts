// Loads the candidate's own assessment attempt for portal-style functions.
// Two ways in, as in the exam portal: the magic-link access_token, or a
// signed-in applicant's JWT plus the attempt id (ownership is the same rule
// as the "Applicants can view own assessments" RLS policy: an
// applicant_profiles row for this user with the candidate's email).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mfaRequiredResponse } from "./auth.ts";
import { attemptTimeLimit, isTokenExpired, type LinkPolicy, parseLinkPolicy } from "./assessmentPortal.ts";

export async function loadLinkPolicy(supabaseAdmin: SupabaseClient): Promise<LinkPolicy> {
  const { data } = await supabaseAdmin
    .from("system_config")
    .select("config_value")
    .eq("config_key", "assessment_link_policy")
    .maybeSingle();
  return parseLinkPolicy(data?.config_value);
}

export interface PortalAttempt {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  assessment_id: string;
  candidate_id: string;
  job_id: string | null;
  timeLimit: Date | null;
}

export type AttemptResult =
  | { ok: true; attempt: PortalAttempt }
  | { ok: false; status: number; error: string; code?: string; response?: Response };

const ATTEMPT_SELECT =
  "id, status, started_at, completed_at, deadline, token_expires_at, assessment_id, candidate_id, job_id, " +
  "candidate:candidates(email), assessment:assessments(duration_minutes)";

type AttemptRow = {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  token_expires_at: string | null;
  assessment_id: string;
  candidate_id: string;
  job_id: string | null;
  candidate: { email: string | null } | { email: string | null }[] | null;
  assessment: { duration_minutes: number | null } | { duration_minutes: number | null }[] | null;
};

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function resolvePortalAttempt(
  supabaseAdmin: SupabaseClient,
  req: Request,
  input: { accessToken?: unknown; candidateAssessmentId?: unknown },
  corsHeaders: Record<string, string>,
): Promise<AttemptResult> {
  let row: AttemptRow | null = null;

  if (typeof input.accessToken === "string" && input.accessToken) {
    const { data, error } = await supabaseAdmin
      .from("candidate_assessments")
      .select(ATTEMPT_SELECT)
      .eq("access_token", input.accessToken)
      .maybeSingle();
    if (error) throw error;
    row = data as AttemptRow | null;
    if (!row) return { ok: false, status: 401, error: "Invalid or expired access token" };
  } else if (typeof input.candidateAssessmentId === "string" && input.candidateAssessmentId) {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const { data: auth } = jwt ? await supabaseAdmin.auth.getUser(jwt) : { data: null };
    const user = auth?.user;
    if (!user) return { ok: false, status: 401, error: "Sign in to continue" };
    const mfa = mfaRequiredResponse(jwt, user.factors, corsHeaders);
    if (mfa) return { ok: false, status: 403, error: "MFA required", response: mfa };

    const { data, error } = await supabaseAdmin
      .from("candidate_assessments")
      .select(ATTEMPT_SELECT)
      .eq("id", input.candidateAssessmentId)
      .maybeSingle();
    if (error) throw error;
    row = data as AttemptRow | null;
    const email = row ? one(row.candidate)?.email ?? null : null;
    let owns = false;
    if (email) {
      const { data: profile } = await supabaseAdmin
        .from("applicant_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("email", email)
        .maybeSingle();
      owns = !!profile;
    }
    // Same answer whether the attempt is unknown or someone else's.
    if (!row || !owns) return { ok: false, status: 404, error: "Assessment not found" };
  } else {
    return { ok: false, status: 401, error: "Access token is required" };
  }

  if (isTokenExpired(row.token_expires_at, new Date())) {
    return { ok: false, status: 401, error: "This assessment link has expired", code: "link_expired" };
  }

  const policy = await loadLinkPolicy(supabaseAdmin);
  return {
    ok: true,
    attempt: {
      id: row.id,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      deadline: row.deadline,
      assessment_id: row.assessment_id,
      candidate_id: row.candidate_id,
      job_id: row.job_id,
      timeLimit: attemptTimeLimit(
        { startedAt: row.started_at, durationMinutes: one(row.assessment)?.duration_minutes, deadline: row.deadline },
        policy.time_limit_grace_seconds,
      ),
    },
  };
}
