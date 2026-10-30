// Pure CORS origin policy. No Deno APIs or remote imports here,
// so the vitest suite (src/test/corsPolicy.test.ts) can import it directly.

const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function toOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Build the origin allowlist from ALLOWED_ORIGINS (comma-separated), falling
 * back to PUBLIC_APP_URL when it is unset. Entries are reduced to their origin,
 * so "https://app.example.com/" and "https://app.example.com/login" both work.
 */
export function parseAllowedOrigins(
  allowedOrigins: string | undefined,
  publicAppUrl: string | undefined,
): string[] {
  const source = allowedOrigins?.trim() ? allowedOrigins : publicAppUrl ?? "";
  const origins = source
    .split(",")
    .map(toOrigin)
    .filter((origin): origin is string => origin !== null);
  return [...new Set(origins)];
}

/**
 * Return the request origin when it may be reflected in
 * Access-Control-Allow-Origin, otherwise null. With no allowlist configured
 * only loopback origins are accepted, which keeps local development working
 * without opening an unconfigured deployment to every site.
 */
export function resolveAllowedOrigin(
  requestOrigin: string | null,
  allowedOrigins: readonly string[],
): string | null {
  if (!requestOrigin) return null;
  if (allowedOrigins.length === 0) {
    return LOOPBACK_ORIGIN.test(requestOrigin) ? requestOrigin : null;
  }
  const origin = toOrigin(requestOrigin);
  return origin !== null && allowedOrigins.includes(origin) ? origin : null;
}
