/** Google Drive / Docs share-link validation for assessment file_upload answers. */

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

const DOCS_PATH_PREFIXES = [
  '/file/',
  '/document/',
  '/spreadsheets/',
  '/presentation/',
  '/forms/',
];

export function isAllowedGoogleDriveLink(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  if (!DRIVE_HOSTS.has(host)) return false;

  if (host === 'drive.google.com') {
    // /file/d/..., /open?id=, /drive/folders/..., /uc?id=, etc.
    return true;
  }

  // docs.google.com — only document-like share paths (not arbitrary google.com pages)
  return DOCS_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

export const ASSESSMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const ASSESSMENT_FILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;

export type AssessmentFileMime = (typeof ASSESSMENT_FILE_MIME_TYPES)[number];

export interface QuestionFileConfig {
  allow_file: boolean;
  allow_link: boolean;
  allowed_mime_types: string[];
  max_file_bytes: number;
  max_files: number;
}

export const DEFAULT_FILE_CONFIG: QuestionFileConfig = {
  allow_file: true,
  allow_link: true,
  allowed_mime_types: [...ASSESSMENT_FILE_MIME_TYPES],
  max_file_bytes: ASSESSMENT_FILE_MAX_BYTES,
  max_files: 1,
};

export interface FileUploadFileMeta {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export interface FileUploadLinkMeta {
  url: string;
  label?: string;
}

/** Stored in candidate_responses.response for file_upload questions */
export interface FileUploadResponse {
  mode: 'file' | 'link' | 'both';
  file?: FileUploadFileMeta;
  link?: FileUploadLinkMeta;
}

export function parseFileConfig(raw: unknown): QuestionFileConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_FILE_CONFIG };
  }
  const o = raw as Record<string, unknown>;
  let allow_file = o.allow_file !== false;
  let allow_link = o.allow_link !== false;
  if (!allow_file && !allow_link) {
    allow_file = true;
    allow_link = true;
  }
  const max_file_bytes =
    typeof o.max_file_bytes === 'number' && o.max_file_bytes > 0
      ? Math.min(o.max_file_bytes, ASSESSMENT_FILE_MAX_BYTES)
      : ASSESSMENT_FILE_MAX_BYTES;
  const max_files = typeof o.max_files === 'number' && o.max_files > 0 ? Math.min(o.max_files, 1) : 1;
  const allowed_mime_types = Array.isArray(o.allowed_mime_types)
    ? o.allowed_mime_types.filter((m): m is string => typeof m === 'string')
    : [...ASSESSMENT_FILE_MIME_TYPES];

  return {
    allow_file,
    allow_link,
    allowed_mime_types: allowed_mime_types.length
      ? allowed_mime_types
      : [...ASSESSMENT_FILE_MIME_TYPES],
    max_file_bytes,
    max_files,
  };
}

export function parseFileUploadResponse(raw: unknown): FileUploadResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  if (mode !== 'file' && mode !== 'link' && mode !== 'both') return null;

  const result: FileUploadResponse = { mode };
  if (o.file && typeof o.file === 'object' && !Array.isArray(o.file)) {
    const f = o.file as Record<string, unknown>;
    if (
      typeof f.path === 'string' &&
      typeof f.name === 'string' &&
      typeof f.mime === 'string' &&
      typeof f.size === 'number'
    ) {
      result.file = { path: f.path, name: f.name, mime: f.mime, size: f.size };
    }
  }
  if (o.link && typeof o.link === 'object' && !Array.isArray(o.link)) {
    const l = o.link as Record<string, unknown>;
    if (typeof l.url === 'string') {
      result.link = {
        url: l.url,
        label: typeof l.label === 'string' ? l.label : undefined,
      };
    }
  }
  return result;
}

export function isFileUploadAnswered(raw: unknown): boolean {
  const parsed = parseFileUploadResponse(raw);
  if (!parsed) return false;
  return Boolean(parsed.file?.path || parsed.link?.url);
}

export function buildFileUploadResponse(parts: {
  file?: FileUploadFileMeta | null;
  link?: FileUploadLinkMeta | null;
}): FileUploadResponse | null {
  const file = parts.file ?? undefined;
  const link = parts.link ?? undefined;
  if (!file && !link) return null;
  const mode: FileUploadResponse['mode'] =
    file && link ? 'both' : file ? 'file' : 'link';
  return { mode, ...(file ? { file } : {}), ...(link ? { link } : {}) };
}
