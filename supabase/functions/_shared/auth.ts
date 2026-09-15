import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function isServiceRoleToken(token: string): boolean {
  return decodeJwtRole(token) === "service_role";
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
  if (isServiceRoleToken(token)) {
    return { ok: true, isServiceRole: true };
  }

  const { data: authData } = await supabase.auth.getUser(token);
  if (!authData?.user) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401, corsHeaders) };
  }

  return { ok: true, userId: authData.user.id, isServiceRole: false };
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
