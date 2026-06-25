import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { extractResumeStoragePath, userCanAccessResume } from "../_shared/resume.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_PUBLIC_URL = Deno.env.get("SUPABASE_PUBLIC_URL") ?? SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const signingClient = createClient(SUPABASE_PUBLIC_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireAuth(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;
    if (auth.isServiceRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { resume_url } = await req.json() as { resume_url?: string };
    if (!resume_url?.trim()) {
      return new Response(JSON.stringify({ error: "resume_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: authData } = await supabase.auth.getUser(token);
    const email = authData?.user?.email ?? undefined;

    const allowed = await userCanAccessResume(supabase, auth.userId!, email, resume_url);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = extractResumeStoragePath(resume_url);
    const { data, error } = await signingClient.storage.from("resumes").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return new Response(JSON.stringify({ error: error?.message ?? "Resume not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
