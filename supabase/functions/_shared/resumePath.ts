// Pure path handling for the resumes bucket. No Deno APIs or remote imports here,
// so the vitest suite (src/test/resumePath.test.ts) can import it directly.

export const RESUME_BUCKET = "resumes";

const MAX_RESUME_REF_CHARS = 1024;
const MAX_RESUME_PATH_CHARS = 512;

// Encoded '.', '/', '\', '%' (double-encoding) and NUL — storage decodes the path server-side.
const ENCODED_TRAVERSAL = /%(?:2e|2f|5c|25|00)/i;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:[/?#]|$)/;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const STORAGE_OBJECT_PATH = /^\/storage\/v1\/object\/(?:(?:public|sign|authenticated)\/)?resumes\/(.+)$/;

/** Lenient extraction for comparing values already stored in the DB. Never use the result to address storage. */
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

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isSafeResumeStoragePath(path: string): boolean {
  if (!path || path.length > MAX_RESUME_PATH_CHARS) return false;
  if (path.includes("\\") || path.includes("://") || hasControlChar(path)) return false;
  if (path.includes("?") || path.includes("#")) return false;
  if (ENCODED_TRAVERSAL.test(path)) return false;
  return path.split("/").every((segment) => {
    const trimmed = segment.trim();
    return trimmed !== "" && trimmed !== "." && trimmed !== "..";
  });
}

/**
 * Resolve caller-supplied input to an object path inside the resumes bucket.
 * Returns null for anything that is not unambiguously a resumes-bucket object:
 * traversal (raw or encoded), backslashes, other buckets, other hosts.
 */
export function resolveResumeStoragePath(
  resumeUrl: unknown,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  if (typeof resumeUrl !== "string") return null;
  const raw = resumeUrl.trim();
  if (!raw || raw.length > MAX_RESUME_REF_CHARS) return null;
  if (raw.includes("\\") || ENCODED_TRAVERSAL.test(raw) || DOT_SEGMENT.test(raw)) return null;

  if (!URL_SCHEME.test(raw)) {
    const path = raw.replace(/^resumes\//, "").replace(/^\//, "");
    return isSafeResumeStoragePath(path) ? path : null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!allowedOrigins.has(url.origin)) return null;

  const match = STORAGE_OBJECT_PATH.exec(url.pathname);
  if (!match) return null;

  let path: string;
  try {
    path = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isSafeResumeStoragePath(path) ? path : null;
}

/**
 * Re-point a URL built against the internal gateway (e.g. http://kong:8000 on
 * self-hosted stacks) at the public API origin so browsers can reach it.
 * Signed storage tokens cover the object path only, so they stay valid.
 * Returns the URL unchanged when no usable public URL is configured.
 */
export function withPublicOrigin(url: string, publicBaseUrl: string | undefined): string {
  if (!publicBaseUrl) return url;
  try {
    const target = new URL(url);
    return `${new URL(publicBaseUrl).origin}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return url;
  }
}

export function resumePathMatches(
  storedUrl: string | null | undefined,
  path: string,
): boolean {
  if (!storedUrl || !path) return false;
  return extractResumeStoragePath(storedUrl) === path || storedUrl === path;
}
