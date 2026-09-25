import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const MAX_RESUME_TEXT_CHARS = 6000;

const STAFF_ROLES = ["admin", "hr", "recruiter", "interviewer"] as const;

export function extractResumeStoragePath(resumeUrl: string): string {
  if (!resumeUrl.startsWith("http")) {
    return resumeUrl.replace(/^resumes\//, "").replace(/^\//, "");
  }
  try {
    const u = new URL(resumeUrl);
    const marker = "/resumes/";
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(u.pathname.slice(idx + marker.length));
    }
  } catch {
    // ignore
  }
  return resumeUrl.replace(/^resumes\//, "").replace(/^\//, "");
}

export function isSafeResumeStoragePath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || path.includes("://")) return false;
  return true;
}

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

export function isAllowedResumeStorageUrl(resumeUrl: string): boolean {
  try {
    const u = new URL(resumeUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (!allowedResumeOrigins().has(u.origin)) return false;
    return u.pathname.includes("/resumes/");
  } catch {
    return false;
  }
}

export function resumePathMatches(
  storedUrl: string | null | undefined,
  path: string,
): boolean {
  if (!storedUrl || !path) return false;
  return extractResumeStoragePath(storedUrl) === path || storedUrl === path;
}

export async function userCanAccessResume(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
  resumeUrl: string,
): Promise<boolean> {
  const path = extractResumeStoragePath(resumeUrl);
  if (!path) return false;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if ((userRoles || []).some((r: { role: string }) => STAFF_ROLES.includes(r.role as typeof STAFF_ROLES[number]))) {
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

/** Staff, stored-resume owner, or a just-uploaded path prefixed with the caller's user id. */
export async function userCanParseResume(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
  resumeUrl: string,
): Promise<boolean> {
  if (await userCanAccessResume(supabase, userId, email, resumeUrl)) return true;
  const path = extractResumeStoragePath(resumeUrl);
  return !!userId && path.startsWith(`${userId}-`);
}

export async function downloadResumeBytes(
  supabase: SupabaseClient,
  resumeUrl: string,
): Promise<{ bytes: Uint8Array; lowerUrl: string }> {
  if (resumeUrl.startsWith("http") && !isAllowedResumeStorageUrl(resumeUrl)) {
    throw new Error("Invalid resume URL");
  }

  const path = extractResumeStoragePath(resumeUrl);
  if (!isSafeResumeStoragePath(path)) {
    throw new Error("Invalid resume path");
  }

  const lowerUrl = resumeUrl.toLowerCase();

  let fileData: Blob | null = null;
  let error: { message?: string } | null = null;
  ({ data: fileData, error } = await supabase.storage.from("resumes").download(path));

  const internalBase = Deno.env.get("SUPABASE_INTERNAL_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if ((!fileData || error) && internalBase && serviceKey) {
    const internal = createClient(internalBase, serviceKey);
    ({ data: fileData, error } = await internal.storage.from("resumes").download(path));
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
