import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { resolveResumePath, userCanAccessResume } from "../_shared/resume.ts";
import { RESUME_BUCKET, withPublicOrigin } from "../_shared/resumePath.ts";

serveWithCors(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireAuth(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;
    if (auth.isServiceRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { resume_url } = await req.json() as { resume_url?: unknown };
    if (typeof resume_url !== "string" || !resume_url.trim()) {
      return new Response(JSON.stringify({ error: "resume_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = resolveResumePath(resume_url);
    if (!path) {
      return new Response(JSON.stringify({ error: "Invalid resume path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: authData } = await supabase.auth.getUser(token);
    const email = authData?.user?.email ?? undefined;

    const allowed = await userCanAccessResume(supabase, auth.userId!, email, path);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.storage.from(RESUME_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      if (error) console.error("get-resume-signed-url signing failed:", error);
      return new Response(JSON.stringify({ error: "Resume not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SUPABASE_URL is the internal gateway on self-hosted stacks; hand the browser a public URL.
    const signedUrl = withPublicOrigin(data.signedUrl, Deno.env.get("SUPABASE_PUBLIC_URL"));

    return new Response(JSON.stringify({ signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse("get-resume-signed-url", err, corsHeaders);
  }
});
