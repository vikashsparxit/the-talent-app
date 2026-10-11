import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseAllowedOrigins, resolveAllowedOrigin } from "./corsPolicy.ts";

/**
 * Static CORS headers shared by every function. Access-Control-Allow-Origin is
 * deliberately absent: withCors() adds it per request for allowlisted origins.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-access-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Wrap a handler so its responses (including the OPTIONS preflight) reflect
 * the request Origin only when it is listed in ALLOWED_ORIGINS, or matches
 * PUBLIC_APP_URL when ALLOWED_ORIGINS is unset. Other origins get no
 * Access-Control-Allow-Origin header, so browsers block the response;
 * server-to-server callers (cron, webhooks) send no Origin and are unaffected.
 */
function withCors(handler: Handler): (req: Request) => Promise<Response> {
  return async (req) => {
    const response = await handler(req);
    const headers = new Headers(response.headers);
    headers.append("Vary", "Origin");

    const origin = resolveAllowedOrigin(
      req.headers.get("Origin"),
      parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"), Deno.env.get("PUBLIC_APP_URL")),
    );
    if (origin) headers.set("Access-Control-Allow-Origin", origin);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/** Drop-in replacement for std `serve` that applies the origin allowlist. */
export function serveWithCors(handler: Handler): void {
  serve(withCors(handler));
}
