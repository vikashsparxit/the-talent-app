import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { RESUME_BUCKET, resolveResumeStoragePath, resumePathMatches } from "./resumePath.ts";

const MAX_RESUME_TEXT_CHARS = 6000;

const FULL_ACCESS_ROLES = ["admin", "hr", "recruiter"];

function allowedResumeOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const raw of [
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_PUBLIC_URL"),
    Deno.env.get("SUPABASE_INTERNAL_URL"),
  ]) {
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // ignore
    }
  }
  return origins;
}

/** Validated object path inside the resumes bucket, or null if the input must be rejected. */
export function resolveResumePath(resumeUrl: unknown): string | null {
  return resolveResumeStoragePath(resumeUrl, allowedResumeOrigins());
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Mirrors candidates RLS for interviewers: assigned to the candidate, or to the candidate's job. */
async function interviewerAssignedToResume(
  supabase: SupabaseClient,
  userId: string,
  path: string,
): Promise<boolean> {
  // resume_url is stored as a bare path, a "resumes/"-prefixed path, or a full storage URL
  const encodedPath = encodeURI(path);
  const urlSuffixes = encodedPath === path ? [path] : [path, encodedPath];
  const results = await Promise.all([
    supabase.from("candidates").select("id, job_id, resume_url").eq("resume_url", path),
    supabase.from("candidates").select("id, job_id, resume_url").eq("resume_url", `${RESUME_BUCKET}/${path}`),
    ...urlSuffixes.map((suffix) =>
      supabase.from("candidates").select("id, job_id, resume_url")
        .like("resume_url", `%/${RESUME_BUCKET}/${escapeLikePattern(suffix)}`)
    ),
  ]);

  const candidates = new Map<string, string | null>();
  for (const { data } of results) {
    for (const c of (data || []) as { id: string; job_id: string | null; resume_url: string | null }[]) {
      if (resumePathMatches(c.resume_url, path)) candidates.set(c.id, c.job_id);
    }
  }

  for (const [candidateId, jobId] of candidates) {
    const { data: forCandidate } = await supabase.rpc("is_interviewer_for_candidate", {
      _user_id: userId,
      _candidate_id: candidateId,
    });
    if (forCandidate === true) return true;

    if (jobId) {
      const { data: forJob } = await supabase.rpc("is_interviewer_for_job", {
        _user_id: userId,
        _job_id: jobId,
      });
      if (forJob === true) return true;
    }
  }
  return false;
}

/** `path` must come from resolveResumePath. */
export async function userCanAccessResume(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
  path: string,
): Promise<boolean> {
  if (!path) return false;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roles = (userRoles || []).map((r: { role: string }) => r.role);
  if (roles.some((role: string) => FULL_ACCESS_ROLES.includes(role))) {
    return true;
  }

  if (roles.includes("interviewer") && (await interviewerAssignedToResume(supabase, userId, path))) {
    return true;
  }

  if (email) {
    const { data: candidates } = await supabase
      .from("candidates")
      .select("resume_url")
      .eq("email", email);

    if ((candidates || []).some((c: { resume_url: string | null }) => resumePathMatches(c.resume_url, path))) {
      return true;
    }
  }

  const { data: profile } = await supabase
    .from("applicant_profiles")
    .select("resume_url")
    .eq("user_id", userId)
    .maybeSingle();

  return resumePathMatches(profile?.resume_url, path);
}

/** Full-access staff, assigned interviewer, stored-resume owner, or a just-uploaded path prefixed with the caller's user id. `path` must come from resolveResumePath. */
export async function userCanParseResume(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
  path: string,
): Promise<boolean> {
  if (await userCanAccessResume(supabase, userId, email, path)) return true;
  return !!userId && path.startsWith(`${userId}-`);
}

export async function downloadResumeBytes(
  supabase: SupabaseClient,
  resumeUrl: string,
): Promise<{ bytes: Uint8Array; lowerUrl: string }> {
  const path = resolveResumePath(resumeUrl);
  if (!path) {
    throw new Error("Invalid resume path");
  }

  const lowerUrl = resumeUrl.toLowerCase();

  let fileData: Blob | null = null;
  let error: { message?: string } | null = null;
  ({ data: fileData, error } = await supabase.storage.from(RESUME_BUCKET).download(path));

  const internalBase = Deno.env.get("SUPABASE_INTERNAL_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if ((!fileData || error) && internalBase && serviceKey) {
    const internal = createClient(internalBase, serviceKey);
    ({ data: fileData, error } = await internal.storage.from(RESUME_BUCKET).download(path));
  }

  if (error || !fileData) {
    throw new Error(`Failed to download resume: ${error?.message ?? "not found"}`);
  }

  const buffer = await fileData.arrayBuffer();
  return { bytes: new Uint8Array(buffer), lowerUrl };
}

function extractDocxText(buffer: Uint8Array): string {
  const unzipped = unzipSync(buffer);
  const docXml = unzipped["word/document.xml"];
  if (!docXml) return "";
  const xml = new TextDecoder().decode(docXml);
  return xml
    .replace(/<w:br[^/]*/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDocText(bytes: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const raw = decoder.decode(bytes);
  return (raw.match(/[\x20-\x7E]{4,}/g) || []).join(" ").replace(/\s+/g, " ").trim();
}

function truncateResumeText(text: string): string {
  if (text.length <= MAX_RESUME_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_RESUME_TEXT_CHARS)}\n…[truncated]`;
}

/** Best-effort plain text from stored resume (DOCX/DOC). PDF returns null — use structured profile fields. */
export async function extractResumePlainText(
  supabase: SupabaseClient,
  resumeUrl: string | null | undefined,
): Promise<string | null> {
  if (!resumeUrl?.trim()) return null;

  try {
    const { bytes, lowerUrl } = await downloadResumeBytes(supabase, resumeUrl);
    const isDocx = lowerUrl.includes(".docx");
    const isDoc = lowerUrl.includes(".doc") && !isDocx;
    if (isDocx) {
      const text = extractDocxText(bytes);
      return text.length >= 50 ? truncateResumeText(text) : null;
    }
    if (isDoc) {
      const text = extractDocText(bytes);
      return text.length >= 50 ? truncateResumeText(text) : null;
    }
    return null;
  } catch {
    return null;
  }
}
