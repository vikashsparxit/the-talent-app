// Public Jobs API (v1): read-only open job postings for partner integrations.
// Docs: docs/PUBLIC_JOBS_API.md. Machine-readable spec: GET /public-jobs/openapi.json.
//
// Open to every origin on purpose (the data is public and read-only), so this
// function does not use the shared origin allowlist in _shared/cors.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse, HttpError } from "../_shared/errors.ts";
import {
  API_VERSION,
  buildOpenApi,
  likePattern,
  parseListQuery,
  parseRoute,
  PUBLIC_JOB_COLUMNS,
  toPublicJob,
  type JobRow,
} from "../_shared/publicJobs.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
    },
  });
}

async function resolveAppUrl(supabase: SupabaseClient): Promise<string | null> {
  const envUrl = Deno.env.get("PUBLIC_APP_URL")?.trim();
  if (envUrl) return envUrl;

  const { data } = await supabase
    .from("system_config")
    .select("config_value")
    .eq("config_key", "business_branding")
    .maybeSingle();
  const brandingUrl = (data?.config_value as { public_url?: string } | null)?.public_url?.trim();
  return brandingUrl || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") throw new HttpError(405, "Only GET is supported");

    const url = new URL(req.url);
    const route = parseRoute(url.pathname);
    if (route.kind === "not_found") throw new HttpError(404, "Not found");

    if (route.kind === "openapi") {
      const base = (Deno.env.get("SUPABASE_PUBLIC_URL") ?? Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
      return json(buildOpenApi(`${base}/functions/v1/public-jobs`));
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const appUrl = await resolveAppUrl(supabase);

    if (route.kind === "job") {
      const { data, error } = await supabase
        .from("jobs")
        .select(PUBLIC_JOB_COLUMNS)
        .eq("id", route.id)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Job not found or no longer open");
      return json({ api_version: API_VERSION, data: toPublicJob(data as JobRow, appUrl) });
    }

    const query = parseListQuery(url.searchParams);
    let request = supabase
      .from("jobs")
      .select(PUBLIC_JOB_COLUMNS, { count: "exact" })
      .eq("status", "open");
    if (query.department) request = request.eq("department", query.department);
    if (query.domain) request = request.eq("domain", query.domain);
    if (query.location) request = request.ilike("location", likePattern(query.location));
    if (query.employmentType) request = request.eq("job_type", query.employmentType);
    if (query.experienceLevel) request = request.eq("experience_level", query.experienceLevel);
    if (query.updatedSince) request = request.gte("updated_at", query.updatedSince);

    const { data, error, count } = await request
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw error;

    const rows = (data ?? []) as JobRow[];
    const total = count ?? rows.length;
    return json({
      api_version: API_VERSION,
      data: rows.map((row) => toPublicJob(row, appUrl)),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        has_more: query.offset + rows.length < total,
      },
    });
  } catch (e) {
    return errorResponse("public-jobs", e, corsHeaders);
  }
});
