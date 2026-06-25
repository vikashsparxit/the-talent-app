import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireStaff(req, supabase, corsHeaders, ["admin", "hr", "recruiter"]);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const job = body.job;
    const metrics = body.metrics;

    if (!job || !job.id || !metrics) {
      return new Response(JSON.stringify({ error: "job.id and metrics are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("Gemini API key not configured. Add GOOGLE_AI_API_KEY to edge function secrets.");
    }

    // ── DB enrichment: avg interview scores for this job ──────────────────
    const { data: stageData } = await supabase
      .from("job_interview_stages").select("id").eq("job_id", job.id);
    const stageIds = (stageData || []).map((s) => s.id);

    const { data: ivScores } = await supabase
      .from("candidate_interviews")
      .select("overall_score, rating_categories")
      .in("job_interview_stage_id", stageIds.length > 0 ? stageIds : ["none"]);

    const scoredRows = (ivScores || []).filter((r) => r.overall_score != null);
    let avgOverallScore = null;
    if (scoredRows.length > 0) {
      const sum = scoredRows.reduce((acc, r) => acc + Number(r.overall_score), 0);
      avgOverallScore = Math.round((sum / scoredRows.length) * 10) / 10;
    }

    const categoryKeys = ["technical", "communication", "problem_solving", "culture_fit"];
    const avgCategories = {};
    for (let ci = 0; ci < categoryKeys.length; ci++) {
      const cat = categoryKeys[ci];
      const vals = (ivScores || [])
        .map((r) => r.rating_categories && r.rating_categories[cat])
        .filter((v) => v != null)
        .map((v) => Number(v));
      avgCategories[cat] = vals.length > 0
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
    }
    const totalInterviews = (ivScores || []).length;
    const scoredInterviews = scoredRows.length;

    // ── Build Gemini prompt ───────────────────────────────────────────────
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    let deadlineText = "No deadline set";
    if (job.application_deadline && metrics.days_to_deadline != null) {
      const daysLeft = metrics.days_to_deadline;
      const suffix = daysLeft >= 0 ? (daysLeft + " days remaining") : (Math.abs(daysLeft) + " days overdue");
      deadlineText = job.application_deadline + " (" + suffix + ")";
    }

    const funnelLines = (metrics.stage_funnel || []).map((s) =>
      "  " + s.name + ": " + s.count + " candidates → " + s.proceeded + " proceeded, " + s.rejected + " rejected, " + s.hold + " hold, " + s.pending + " pending"
    ).join("\n");

    const userMessage = [
      "Analyse the following hiring pipeline and use the score_pipeline tool to return a structured evaluation.",
      "",
      'JOB: "' + job.title + '" | Status: ' + job.status + ' | Openings: ' + (job.total_openings || "N/A"),
      "Deadline: " + deadlineText,
      "",
      "PIPELINE METRICS:",
      "- Total candidates: " + metrics.total_candidates,
      "- Proceeded: " + metrics.proceeded + " | Rejected: " + metrics.rejected + " | Hold: " + metrics.hold + " | No-show: " + metrics.no_show,
      "- Pending feedback: " + metrics.pending_feedback,
      "- Conversion rate (top of funnel to last stage): " + (metrics.conversion_rate != null ? metrics.conversion_rate + "%" : "N/A"),
      "- Feedback coverage: " + metrics.feedback_coverage_pct + "% of interviews have written feedback",
      "- Avg days between stages: " + (metrics.avg_days_between_stages != null ? metrics.avg_days_between_stages + " days" : "N/A (insufficient data)"),
      "- Days since last interview activity: " + (metrics.days_since_last_activity != null ? metrics.days_since_last_activity + " days" : "N/A"),
      "",
      "INTERVIEW QUALITY (from evaluation forms):",
      "- Avg overall interview score: " + (avgOverallScore != null ? avgOverallScore + "/5" : "No scored evaluations yet"),
      "- Avg technical score: " + (avgCategories["technical"] != null ? avgCategories["technical"] + "/5" : "N/A"),
      "- Avg communication score: " + (avgCategories["communication"] != null ? avgCategories["communication"] + "/5" : "N/A"),
      "- Avg problem solving: " + (avgCategories["problem_solving"] != null ? avgCategories["problem_solving"] + "/5" : "N/A"),
      "- Avg culture fit: " + (avgCategories["culture_fit"] != null ? avgCategories["culture_fit"] + "/5" : "N/A"),
      "- Evaluated interviews: " + scoredInterviews + " of " + totalInterviews,
      "",
      "STAGE FUNNEL (in order):",
      funnelLines,
    ].join("\n");

    const systemPrompt = [
      "You are a senior recruitment analyst evaluating a hiring pipeline.",
      "",
      "You receive structured pipeline metrics and must score and analyse the recruitment health using the score_pipeline tool.",
      "",
      "SCORING RULES — follow precisely:",
      "",
      "SPEED SCORE (start at 80):",
      "- avg_days_between_stages null or 0: start at 50 instead (insufficient data)",
      "- avg_days_between_stages > 10 days: -30",
      "- avg_days_between_stages 6-10 days: -15",
      "- avg_days_between_stages 3-5 days: no change",
      "- avg_days_between_stages < 3 days: +10",
      "- days_since_last_activity > 14 days: -25 (pipeline stalled)",
      "- days_since_last_activity 8-14 days: -10",
      "- days_to_deadline < 0: -20 (overdue); days_to_deadline 0-7: -10",
      "- pending_feedback > 30% of total_candidates: -10",
      "- total_candidates < 3: cap speed_score at 60",
      "",
      "HEALTH SCORE (start at 70):",
      "- conversion_rate >= 30%: +15; 20-29%: +5; 10-19%: no change; < 10%: -15",
      "- feedback_coverage_pct >= 80%: +15; 60-79%: +5; 40-59%: no change; < 40%: -15",
      "- no_show / total_candidates > 20%: -15; 10-20%: -5",
      "- hold / total_candidates > 30%: -10; 15-30%: -5",
      "- avg_overall_interview_score >= 3.5/5: +15; 2.5-3.4: +5; < 2.5 and not null: -10; null: no change",
      "- total_candidates < 3: cap health_score at 60",
      "",
      "OVERALL SCORE: round(0.4 * speed_score + 0.6 * health_score). Clamp all three scores 0-100.",
      "GRADE: A >= 80, B 65-79, C 50-64, D 35-49, F < 35.",
      "GRADE LABEL: Excellent / Good / Fair / Poor / Critical",
      "",
      "INSIGHTS: 2-4 factual observations directly from the data. Use the numbers. Never fabricate.",
      "RISKS: Only include genuine concerns. Empty array if pipeline is healthy.",
      "RECOMMENDATION: One specific actionable step.",
    ].join("\n");

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + GOOGLE_AI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "score_pipeline",
                description: "Score a recruitment pipeline and generate actionable hiring insights",
                parameters: {
                  type: "object",
                  properties: {
                    overall_score:  { type: "integer", minimum: 0, maximum: 100 },
                    speed_score:    { type: "integer", minimum: 0, maximum: 100 },
                    health_score:   { type: "integer", minimum: 0, maximum: 100 },
                    grade:          { type: "string", enum: ["A", "B", "C", "D", "F"] },
                    grade_label:    { type: "string" },
                    insights:       { type: "array", items: { type: "string" } },
                    risks:          { type: "array", items: { type: "string" } },
                    recommendation: { type: "string" },
                  },
                  required: ["overall_score", "speed_score", "health_score", "grade", "grade_label", "insights", "risks", "recommendation"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "score_pipeline" } },
          temperature: 0.3,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error("Gemini API error " + aiResponse.status + ": " + errText);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices && aiResult.choices[0] && aiResult.choices[0].message &&
      aiResult.choices[0].message.tool_calls && aiResult.choices[0].message.tool_calls[0];
    if (!toolCall || !toolCall.function || !toolCall.function.arguments) {
      throw new Error("AI did not return scoring data");
    }

    let result;
    try {
      result = JSON.parse(toolCall.function.arguments);
    } catch (_e) {
      throw new Error("AI returned malformed scoring data");
    }

    const generatedAt = new Date().toISOString();
    const { error: cacheError } = await supabase
      .from("pipeline_analysis_cache")
      .upsert(
        {
          job_id: job.id,
          result,
          generated_at: generatedAt,
          updated_at: generatedAt,
        },
        { onConflict: "job_id" },
      );
    if (cacheError) {
      console.error("pipeline_analysis_cache upsert failed:", cacheError);
    }

    return new Response(JSON.stringify({ success: true, result, generated_at: generatedAt }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("score-pipeline error:", err);
    return new Response(JSON.stringify({ error: err && err.message ? err.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
