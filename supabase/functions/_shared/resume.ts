import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
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

export async function downloadResumeBytes(
  supabase: SupabaseClient,
  resumeUrl: string,
): Promise<{ bytes: Uint8Array; lowerUrl: string }> {
  const path = extractResumeStoragePath(resumeUrl);
  const lowerUrl = resumeUrl.toLowerCase();

  const { data: fileData, error } = await supabase.storage.from("resumes").download(path);
  if (!error && fileData) {
    const buffer = await fileData.arrayBuffer();
    return { bytes: new Uint8Array(buffer), lowerUrl };
  }

  let fetchUrl = resumeUrl;
  const internalBase = Deno.env.get("SUPABASE_INTERNAL_URL");
  if (internalBase && resumeUrl.startsWith("http")) {
    try {
      const u = new URL(resumeUrl);
      const base = internalBase.replace(/\/$/, "");
      fetchUrl = `${base}${u.pathname}${u.search}`;
    } catch {
      // use original
    }
  }

  const fileResponse = await fetch(fetchUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download resume: ${fileResponse.status}`);
  }

  const fileBuffer = await fileResponse.arrayBuffer();
  return { bytes: new Uint8Array(fileBuffer), lowerUrl };
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
