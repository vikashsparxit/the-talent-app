// Cloudflare R2 (S3-compatible) presigned URLs: AWS Signature Version 4,
// query-string auth, on WebCrypto only. No Deno APIs or remote imports here,
// so the vitest suite (src/test/r2Presign.test.ts) can import it directly.

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Default lifetime of a presigned URL, seconds (capped at R2_PRESIGN_MAX_SECONDS). */
  defaultExpiresIn: number;
}

export const R2_PRESIGN_DEFAULT_SECONDS = 600;
export const R2_PRESIGN_MAX_SECONDS = 3600;

/**
 * Reads R2 settings by env var name. Returns null when any required one is
 * missing, so callers can answer 503 instead of failing later. Pass
 * `(name) => Deno.env.get(name)` from an edge function.
 */
export function loadR2Config(get: (name: string) => string | undefined): R2Config | null {
  const accountId = get("R2_ACCOUNT_ID")?.trim();
  const accessKeyId = get("R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = get("R2_SECRET_ACCESS_KEY")?.trim();
  const bucket = get("R2_BUCKET_RECORDINGS")?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const ttl = Number(get("R2_PRESIGN_TTL_SECONDS"));
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    defaultExpiresIn: clampExpires(Number.isFinite(ttl) && ttl > 0 ? ttl : R2_PRESIGN_DEFAULT_SECONDS),
  };
}

export function clampExpires(seconds: number | undefined, fallback: number = R2_PRESIGN_DEFAULT_SECONDS): number {
  const s = typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : fallback;
  return Math.max(1, Math.min(s, R2_PRESIGN_MAX_SECONDS));
}

// ── Object keys ──────────────────────────────────────────────────────────────

const KEY_SEGMENT = /^[A-Za-z0-9_.-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only [A-Za-z0-9/_.-], no leading or trailing '/', no empty, '.' or '..' segments. */
export function isSafeObjectKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) return false;
  return key.split("/").every((seg) => KEY_SEGMENT.test(seg) && seg !== "." && seg !== "..");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function safeExt(ext: string): string {
  if (!/^[a-z0-9]{1,8}$/.test(ext)) throw new Error("Invalid file extension");
  return ext;
}

/** recordings/<candidate_assessment_id>/<recording_id>/<seq padded to 6>.<ext> */
export function recordingChunkKey(candidateAssessmentId: string, recordingId: string, seq: number, ext: string): string {
  if (!isUuid(candidateAssessmentId) || !isUuid(recordingId)) throw new Error("Invalid id in object key");
  if (!Number.isInteger(seq) || seq < 0 || seq > 999_999) throw new Error("Invalid chunk sequence");
  return `${recordingPrefix(candidateAssessmentId, recordingId)}${String(seq).padStart(6, "0")}.${safeExt(ext)}`;
}

/** recordings/<candidate_assessment_id>/<recording_id>/ */
export function recordingPrefix(candidateAssessmentId: string, recordingId: string): string {
  if (!isUuid(candidateAssessmentId) || !isUuid(recordingId)) throw new Error("Invalid id in object key");
  return `recordings/${candidateAssessmentId.toLowerCase()}/${recordingId.toLowerCase()}/`;
}

/** spoken/<candidate_assessment_id>/<question_id>/<attempt>.<ext> */
export function spokenAnswerKey(candidateAssessmentId: string, questionId: string, attempt: number, ext: string): string {
  if (!isUuid(candidateAssessmentId) || !isUuid(questionId)) throw new Error("Invalid id in object key");
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 99) throw new Error("Invalid attempt number");
  return `spoken/${candidateAssessmentId.toLowerCase()}/${questionId.toLowerCase()}/${attempt}.${safeExt(ext)}`;
}

// ── SigV4 query-string presigning ────────────────────────────────────────────

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

async function hmac(key: Bytes, data: string): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(data)));
}

/** RFC 3986 encoding as SigV4 requires: everything but A-Za-z0-9-_.~ is %XX. */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const byte of encoder.encode(value)) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (c === "/" && !encodeSlash)) out += c;
    else out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** 20130524T000000Z */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface PresignParams {
  method: "GET" | "PUT" | "DELETE";
  host: string;
  /** Unencoded absolute path, e.g. /bucket/key. Each segment is URI-encoded once. */
  path: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
  expiresIn: number;
  /** Extra signed query parameters (e.g. response-content-type). */
  query?: Record<string, string>;
  /** Extra signed headers besides host (lower-case name -> value). The client must send them exactly. */
  headers?: Record<string, string>;
}

/** Builds a SigV4 presigned URL (UNSIGNED-PAYLOAD). Generic so it can be checked against AWS test vectors. */
export async function presignUrl(p: PresignParams): Promise<string> {
  const stamp = amzDate(p.date);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${p.region}/${p.service}/aws4_request`;

  const headers: Record<string, string> = { host: p.host };
  for (const [k, v] of Object.entries(p.headers ?? {})) headers[k.toLowerCase()] = v.trim();
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(";");
  const canonicalHeaders = headerNames.map((h) => `${h}:${headers[h]}\n`).join("");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${p.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(p.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
    ...(p.query ?? {}),
  };
  const canonicalQuery = Object.keys(query)
    .map((k) => [uriEncode(k), uriEncode(query[k])] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalUri = uriEncode(p.path, false);
  const canonicalRequest = [
    p.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonicalRequest)].join("\n");

  let key = await hmac(encoder.encode(`AWS4${p.secretAccessKey}`), day);
  key = await hmac(key, p.region);
  key = await hmac(key, p.service);
  key = await hmac(key, "aws4_request");
  const signature = toHex((await hmac(key, stringToSign)).buffer);

  return `https://${p.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── R2 wrappers ──────────────────────────────────────────────────────────────

function r2Base(cfg: R2Config, key: string, method: PresignParams["method"], date: Date, expiresIn?: number) {
  if (!isSafeObjectKey(key)) throw new Error("Unsafe object key");
  return {
    method,
    host: `${cfg.accountId}.r2.cloudflarestorage.com`,
    path: `/${cfg.bucket}/${key}`,
    region: "auto",
    service: "s3",
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    date,
    expiresIn: clampExpires(expiresIn, cfg.defaultExpiresIn),
  };
}

/** Presigned PUT. Content-Type is signed, so the browser must send exactly `contentType`. */
export async function presignPut(
  cfg: R2Config,
  opts: { key: string; contentType: string; expiresIn?: number; now?: Date },
): Promise<string> {
  return await presignUrl({
    ...r2Base(cfg, opts.key, "PUT", opts.now ?? new Date(), opts.expiresIn),
    headers: { "content-type": opts.contentType },
  });
}

export async function presignGet(
  cfg: R2Config,
  opts: { key: string; expiresIn?: number; responseContentType?: string; now?: Date },
): Promise<string> {
  return await presignUrl({
    ...r2Base(cfg, opts.key, "GET", opts.now ?? new Date(), opts.expiresIn),
    query: opts.responseContentType ? { "response-content-type": opts.responseContentType } : undefined,
  });
}

/** Presigned DELETE for cleanup jobs: `fetch(url, { method: "DELETE" })`. */
export async function presignDelete(
  cfg: R2Config,
  opts: { key: string; expiresIn?: number; now?: Date },
): Promise<string> {
  return await presignUrl(r2Base(cfg, opts.key, "DELETE", opts.now ?? new Date(), opts.expiresIn ?? 60));
}
