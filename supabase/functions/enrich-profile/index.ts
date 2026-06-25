import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SKILL_CATEGORIES = [
  "frontend", "backend", "database", "devops", "cloud",
  "mobile", "design", "testing", "data_science", "ai_ml",
  "security", "project_management", "soft_skills", "other"
];

function normalizeLinkedInUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (v.includes("linkedin.com")) return `https://${v.replace(/^\/+/, "")}`;
  if (/^\/?in\//i.test(v)) return `https://www.linkedin.com/${v.replace(/^\//, "")}`;
  if (/^[\w-]{3,}$/.test(v)) return `https://www.linkedin.com/in/${v}`;
  return v;
}

function hasValidLinkedInProfile(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const pattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;
  return pattern.test(normalizeLinkedInUrl(raw));
}

function filterStaleLinkedInRedFlags(
  flags: Array<{ type: string; message: string; severity: string }>,
  linkedinUrl: string | null | undefined,
) {
  if (!hasValidLinkedInProfile(linkedinUrl)) return flags;
  return flags.filter(
    (f) => !(f.type === "incomplete_profile" && /linkedin/i.test(f.message)),
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireStaff(req, supabase, corsHeaders, ["admin", "hr", "recruiter"]);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { candidate_id } = body as { candidate_id?: string };
    if (!candidate_id) {
      return new Response(JSON.stringify({ error: "candidate_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("Gemini API key not set. Add GOOGLE_AI_API_KEY or GEMINI_API_KEY to the environment.");
    }

    // Read red flag thresholds from system_config (fall back to defaults if missing)
    const { data: rfConfig } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "red_flag_rules")
      .maybeSingle();

    const redFlagRules = (rfConfig?.config_value as Record<string, number> | null) ?? {};
    const employmentGapMonths     = redFlagRules.employment_gap_months      ?? 3;
    const frequentSwitchingMonths = redFlagRules.frequent_switching_months  ?? 12;
    const shortSeniorTenureMonths = redFlagRules.short_senior_tenure_months ?? 6;

    // Fetch candidate + linked job
    const { data: candidate, error: fetchError } = await supabase
      .from("candidates")
      .select("*, job:jobs(title, description, required_skills)")
      .eq("id", candidate_id)
      .single();

    if (fetchError || !candidate) throw new Error("Candidate not found");

    const jobTitle = candidate.job?.title || candidate.role_applied || null;
    const workExp = Array.isArray(candidate.work_experience)
      ? candidate.work_experience.map((e: any) => `${e.title} at ${e.company} (${e.start_date || "?"} – ${e.end_date || "Present"})`).join("; ")
      : null;
    const education = Array.isArray(candidate.education)
      ? candidate.education.map((e: any) => `${e.degree || e.qualification} from ${e.institution}`).join("; ")
      : null;
    const certs = Array.isArray(candidate.certifications)
      ? candidate.certifications.map((c: any) => c.name).join(", ")
      : null;

    const profileSummary = `
Name: ${candidate.name}
Email: ${candidate.email || "N/A"}
Phone: ${candidate.phone || "N/A"}
LinkedIn: ${candidate.linkedin_url || "N/A"}
Role Applied: ${candidate.role_applied || "N/A"}
Current Role: ${candidate.candidate_current_role || "N/A"}
Current Company: ${candidate.candidate_current_company || "N/A"}
Experience Years: ${candidate.experience_years || "N/A"}
Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(", ") : "N/A"}
Existing Skill Tags: ${Array.isArray(candidate.skills_tags) ? candidate.skills_tags.join(", ") : "N/A"}
Work Experience: ${workExp || "N/A"}
Education: ${education || "N/A"}
Certifications: ${certs || "N/A"}
Notes: ${candidate.notes || "N/A"}
Resume URL: ${candidate.resume_url ? "Provided" : "Not provided"}
    `.trim();

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    // Single tool call — ai_summary is now part of enrich_profile tool output
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GOOGLE_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are a talent profile enrichment engine. Analyze candidate profiles and return structured data via the enrich_profile tool.

PROFICIENCY ASSIGNMENT RULES (weighted signals):
- Experience Years (30%): 5+ years with skill = expert, 2-5 = intermediate, <2 = beginner
- Role Seniority (25%): Lead/Senior/Principal = expert, Mid-level = intermediate, Junior = beginner
- Skill Prominence (20%): Primary/core skill = boost, tangential = lower
- Company Context (15%): Well-known tech companies suggest higher proficiency for core skills
- Role Count (10%): Used across multiple roles = higher proficiency

CATEGORY ASSIGNMENT: Use exactly one of: ${SKILL_CATEGORIES.join(", ")}

CONFIDENCE SCORING: 0.0-1.0 based on evidence:
- 0.8-1.0: Strong (explicit years, primary skill of role)
- 0.5-0.7: Moderate (in skills list, inferred from role)
- 0.3-0.4: Weak (tangential, category inference only)

AI_SUMMARY: Write a 3-4 sentence internal recruiter brief (factual, direct, no fluff):
1. Who they are (role, company, years of experience)
2. Strongest technical skills and domain expertise
3. ${jobTitle ? `Fit for the "${jobTitle}" role — alignment and gaps` : "Career trajectory and key strengths"}
4. Any notable flag: certs, career gaps, job-hopping, or incomplete profile

RED FLAGS — detect these patterns (only flag when clearly evident):
- employment_gap: unexplained gap ≥ ${employmentGapMonths} months between roles (use work_experience dates)
- frequent_switching: average tenure < ${frequentSwitchingMonths} months across 3+ companies
- short_senior_tenure: held a senior/lead title for < ${shortSeniorTenureMonths} months
- incomplete_profile: missing email, phone, LinkedIn, or no skills listed
- no_resume: resume_url not provided

Severity: high = likely dealbreaker, medium = worth discussing, low = minor concern.
Only include flags you can actually detect from the provided data. Empty array is fine.

Max 15 skills. Summary max 80 words.`,
            },
            {
              role: "user",
              content: `Analyze this candidate and use the enrich_profile tool:\n\n${profileSummary}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "enrich_profile",
                description: "Return enrichment data including structured skills and an internal recruiter summary",
                parameters: {
                  type: "object",
                  properties: {
                    enrichment_score: {
                      type: "integer",
                      description: "Overall profile completeness/quality score 0-100.",
                    },
                    structured_skills: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          category: { type: "string", enum: SKILL_CATEGORIES },
                          proficiency: { type: "string", enum: ["beginner", "intermediate", "expert"] },
                          confidence: { type: "number" },
                        },
                        required: ["name", "category", "proficiency", "confidence"],
                      },
                      description: "Structured skills. Max 15.",
                    },
                    skills_tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "Flat skill tag names — same as structured_skills names.",
                    },
                    ai_summary: {
                      type: "string",
                      description: "3-4 sentence internal recruiter brief. Factual, direct. Max 80 words.",
                    },
                    experience_years: {
                      type: "number",
                      description: "Estimated total years of experience if not already provided.",
                    },
                    suggested_role: {
                      type: "string",
                      description: "Suggested job title if role_applied is empty.",
                    },
                    red_flags: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: {
                            type: "string",
                            enum: ["employment_gap", "frequent_switching", "short_senior_tenure", "incomplete_profile", "no_resume"],
                          },
                          message: { type: "string", description: "One concise sentence describing the flag." },
                          severity: { type: "string", enum: ["low", "medium", "high"] },
                        },
                        required: ["type", "message", "severity"],
                      },
                      description: "Detected warning signals. Only include flags clearly evidenced by the profile data.",
                    },
                  },
                  required: ["enrichment_score", "structured_skills", "skills_tags", "ai_summary", "red_flags"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "enrich_profile" } },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Google AI error:", aiResponse.status, errorText);
      let reason = `HTTP ${aiResponse.status}`;
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.error?.message ?? errJson?.message ?? errJson?.error;
        if (msg) reason = typeof msg === "string" ? msg : String(msg);
      } catch {
        if (errorText.length < 200) reason = errorText;
      }
      throw new Error(`Gemini API error: ${reason}`);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return enrichment data");
    }
    const enrichment = JSON.parse(toolCall.function.arguments);

    // Merge structured_skills: assessment-verified skills take priority
    const existingStructured = Array.isArray(candidate.structured_skills) ? candidate.structured_skills : [];
    const aiSkills = (enrichment.structured_skills || []).map((s: any) => ({ ...s, sources: ["enrichment"] }));

    const mergedSkillsMap = new Map<string, any>();
    for (const skill of aiSkills) mergedSkillsMap.set(skill.name.toLowerCase(), skill);
    for (const existing of existingStructured) {
      const key = (existing as any).name?.toLowerCase();
      if (!key) continue;
      const sources = Array.isArray((existing as any).sources) ? (existing as any).sources : [];
      if (sources.includes("assessment")) {
        mergedSkillsMap.set(key, { ...(existing as any), sources: [...new Set([...sources, "enrichment"])] });
      }
    }
    const finalStructuredSkills = Array.from(mergedSkillsMap.values());

    // Try summary from tool call first; fall back to native generateContent if empty
    let aiSummary: string | null = (typeof enrichment.ai_summary === "string" ? enrichment.ai_summary.trim() : null) || null;

    if (!aiSummary) {
      console.log("ai_summary missing from tool call, trying native generateContent fallback");
      try {
        const summaryPrompt = `Write a 3-4 sentence internal recruiter brief for this candidate. Be factual and direct. Max 80 words. No headers, just plain prose.\n\n${profileSummary}`;
        const summaryRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: summaryPrompt }] }],
              generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
            }),
          }
        );
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          const text: string | undefined = summaryData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text?.trim()) aiSummary = text.trim();
        } else {
          console.error("Summary fallback failed:", summaryRes.status, await summaryRes.text());
        }
      } catch (summaryErr) {
        console.error("Summary fallback error:", summaryErr);
      }
    }

    console.log("Final ai_summary length:", aiSummary?.length ?? 0);

    const rawRedFlags = Array.isArray(enrichment.red_flags) ? enrichment.red_flags : [];
    const redFlags = filterStaleLinkedInRedFlags(rawRedFlags, candidate.linkedin_url);

    const updateData: Record<string, unknown> = {
      enrichment_score: enrichment.enrichment_score,
      skills_tags: enrichment.skills_tags,
      structured_skills: finalStructuredSkills,
      last_enriched_at: new Date().toISOString(),
      ai_summary: aiSummary,
      red_flags: redFlags,
    };
    if (enrichment.experience_years != null && !candidate.experience_years) updateData.experience_years = enrichment.experience_years;
    if (enrichment.suggested_role && !candidate.role_applied) updateData.role_applied = enrichment.suggested_role;

    const { error: updateError } = await supabase
      .from("candidates")
      .update(updateData)
      .eq("id", candidate_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, enrichment: { ...enrichment, structured_skills: finalStructuredSkills }, ai_summary: aiSummary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("enrich-profile error:", e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
