import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mfaSatisfied, tokenAssuranceLevel, type MfaFactor } from "./mfa.ts";

const STAFF_ROLES = ["admin", "hr", "recruiter", "interviewer"] as const;

type AuthResult =
  | { ok: true; userId?: string; isServiceRole: boolean }
  | { ok: false; response: Response };

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time string comparison (compares SHA-256 digests, so length is not leaked either). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(a)));
  const bDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(b)));
  let diff = 0;
  for (let i = 0; i < aDigest.length; i++) {
    diff |= aDigest[i] ^ bDigest[i];
  }
  return diff === 0;
}

export async function isServiceRoleToken(token: string): Promise<boolean> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !serviceRoleKey) return false;
  return timingSafeEqual(token, serviceRoleKey);
}

export async function requireServiceRole(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401, corsHeaders) };
  }

  const token = authHeader.replace("Bearer ", "");
  if (await isServiceRoleToken(token)) {
    return { ok: true, isServiceRole: true };
  }

  return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401, corsHeaders) };
}

export async function requireAuth(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401, corsHeaders) };
  }

  const token = authHeader.replace("Bearer ", "");
  if (await isServiceRoleToken(token)) {
    return { ok: true, isServiceRole: true };
  }

  const { data: authData } = await supabase.auth.getUser(token);
  if (!authData?.user) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401, corsHeaders) };
  }

  const mfaResponse = mfaRequiredResponse(token, authData.user.factors, corsHeaders);
  if (mfaResponse) return { ok: false, response: mfaResponse };

  return { ok: true, userId: authData.user.id, isServiceRole: false };
}

/**
 * 403 response when the user has a verified MFA factor but the token is still aal1; otherwise null.
 * Functions that validate the JWT themselves must call this after auth.getUser().
 */
export function mfaRequiredResponse(
  token: string,
  factors: readonly MfaFactor[] | null | undefined,
  corsHeaders: Record<string, string>,
): Response | null {
  if (mfaSatisfied(tokenAssuranceLevel(token), factors)) return null;
  return jsonResponse({ error: "MFA verification required", code: "mfa_required" }, 403, corsHeaders);
}

export async function requireStaff(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
  roles: readonly string[] = STAFF_ROLES,
): Promise<AuthResult> {
  const auth = await requireAuth(req, supabase, corsHeaders);
  if (!auth.ok) return auth;
  if (auth.isServiceRole) return auth;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId!);

  const allowed = (userRoles || []).some((r: { role: string }) => roles.includes(r.role));
  if (!allowed) {
    return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403, corsHeaders) };
  }

  return auth;
}

export async function requireAdminOrHR(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<AuthResult> {
  return requireStaff(req, supabase, corsHeaders, ["admin", "hr"]);
}

export async function requireServiceRoleOrStaff(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<AuthResult> {
  return requireStaff(req, supabase, corsHeaders);
}

export async function requireSuperAdmin(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<AuthResult> {
  const auth = await requireAuth(req, supabase, corsHeaders);
  if (!auth.ok) return auth;
  if (auth.isServiceRole) return auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("user_id", auth.userId!)
    .maybeSingle();

  if (!(profile as { is_super_admin?: boolean } | null)?.is_super_admin) {
    return { ok: false, response: jsonResponse({ error: "Forbidden: super admin only" }, 403, corsHeaders) };
  }

  return auth;
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
