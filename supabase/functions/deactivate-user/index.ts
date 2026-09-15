import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, target_user_id, replacement_recruiter_id } = body as {
      action: "get_impact" | "deactivate" | "reactivate";
      target_user_id: string;
      replacement_recruiter_id?: string | null;
    };

    if (!action || !target_user_id) {
      return new Response(JSON.stringify({ error: "action and target_user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify caller is admin
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: authData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = authData.user.id;
    const { data: callerRole } = await supabase.from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    if (!["admin", "hr"].includes(callerRole?.role ?? "")) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REACTIVATE ──────────────────────────────────────────────────────────
    if (action === "reactivate") {
      const { error: reactivateErr } = await supabase
        .from("profiles")
        .update({ is_active: true, deactivated_at: null, deactivated_by: null } as any)
        .eq("user_id", target_user_id);
      if (reactivateErr) throw new Error(`Reactivation failed: ${reactivateErr.message}`);
      // Unban via direct REST API
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${target_user_id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ban_duration: "none" }),
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: target must not be admin/super-admin
    const { data: targetRole } = await supabase.from("user_roles").select("role").eq("user_id", target_user_id).maybeSingle();
    if (targetRole?.role === "admin") {
      return new Response(JSON.stringify({ error: "Cannot archive an admin" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: targetProfile } = await supabase.from("profiles").select("is_super_admin").eq("user_id", target_user_id).maybeSingle();
    if ((targetProfile as any)?.is_super_admin === true) {
      return new Response(JSON.stringify({ error: "Cannot archive a super admin" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET IMPACT ──────────────────────────────────────────────────────────
    if (action === "get_impact") {
      const [candidatesRes, jobsRes, interviewsRes] = await Promise.all([
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("uploaded_by", target_user_id),
        supabase.from("job_recruiters").select("id", { count: "exact", head: true }).eq("recruiter_user_id", target_user_id),
        supabase
          .from("candidate_interviews")
          .select(`id, scheduled_at, candidate:candidates!candidate_interviews_candidate_id_fkey(name)`)
          .eq("interviewer_user_id", target_user_id)
          .is("verdict", null)
          .gt("scheduled_at", new Date().toISOString()),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          impact: {
            ownedCandidates: candidatesRes.count ?? 0,
            jobAssignments: jobsRes.count ?? 0,
            pendingInterviews: (interviewsRes.data || []).map((iv: any) => ({
              id: iv.id,
              candidate_name: iv.candidate?.name ?? "Unknown",
              scheduled_at: iv.scheduled_at,
            })),
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DEACTIVATE ──────────────────────────────────────────────────────────
    const result = {
      candidatesTransferred: 0,
      jobAssignmentsRemoved: 0,
      interviewsFlagged: 0,
    };

    // 1. Transfer owned candidates — count first, then update (update doesn't reliably return count)
    if (replacement_recruiter_id) {
      const { count: candidateCount } = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("uploaded_by", target_user_id);
      if ((candidateCount ?? 0) > 0) {
        const { error: transferErr } = await supabase
          .from("candidates")
          .update({ uploaded_by: replacement_recruiter_id })
          .eq("uploaded_by", target_user_id);
        if (transferErr) throw new Error(`Candidate transfer failed: ${transferErr.message}`);
        result.candidatesTransferred = candidateCount ?? 0;
      }
    }

    // 2. Remove job assignments
    await supabase.from("job_recruiters").delete().eq("recruiter_user_id", target_user_id);

    // 3. Remove candidate-interviewer assignments
    await supabase.from("candidate_interviewers").delete().eq("interviewer_user_id", target_user_id);

    // 4. Flag pending interviews + notify recruiters
    const { data: pendingInterviews } = await supabase
      .from("candidate_interviews")
      .select(`
        id, scheduled_at, candidate_id,
        candidate:candidates!candidate_interviews_candidate_id_fkey(name, job_id),
        stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(job_id)
      `)
      .eq("interviewer_user_id", target_user_id)
      .is("verdict", null)
      .gt("scheduled_at", new Date().toISOString());

    if (pendingInterviews?.length) {
      // Clear interviewer from each pending interview
      await supabase
        .from("candidate_interviews")
        .update({ interviewer_user_id: null } as any)
        .in("id", pendingInterviews.map((iv: any) => iv.id));

      // Get the target user's name for the notification message
      const { data: targetProfileFull } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", target_user_id)
        .maybeSingle();
      const targetName = (targetProfileFull as any)?.full_name ?? "A team member";

      // Notify recruiters for each affected job
      const jobIds = [...new Set(pendingInterviews.map((iv: any) => iv.stage?.job_id).filter(Boolean))];
      for (const jobId of jobIds) {
        const { data: recruiters } = await supabase
          .from("job_recruiters")
          .select("recruiter_user_id")
          .eq("job_id", jobId);
        for (const r of recruiters || []) {
          await supabase.from("notifications").insert({
            user_id: r.recruiter_user_id,
            type: "chitra_warning",
            title: "Interviewer Left — Reassign Needed",
            message: `${targetName} has been archived. ${pendingInterviews.length} scheduled interview(s) need a new interviewer assigned.`,
            link: "/pipeline",
            source: "system",
            action_buttons: [{ label: "View Pipeline", link: "/pipeline" }],
          });
        }
      }
      result.interviewsFlagged = pendingInterviews.length;
    }

    // 5. Close open Chitragupta escalations for this user
    await supabase
      .from("chitra_escalations")
      .update({ resolved_at: new Date().toISOString() } as any)
      .eq("subject_user_id", target_user_id)
      .is("resolved_at", null);

    // 6. Mark profile inactive — explicit error check (silent failure was root cause)
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: callerId,
      } as any)
      .eq("user_id", target_user_id);
    if (profileErr) throw new Error(`Profile deactivation failed: ${profileErr.message}`);

    // 7. Disable Supabase auth via direct REST (more reliable across self-hosted versions
    //    than supabase.auth.admin.updateUserById which may not support ban_duration)
    const banRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${target_user_id}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ban_duration: "876600h" }),
    });
    if (!banRes.ok) {
      // Non-fatal: profile is already deactivated. Log but don't fail the whole operation.
      console.error("Auth ban failed:", await banRes.text());
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("deactivate-user error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
