import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { analyzeCareer } from "../_shared/candidateTenure.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER = "tavily_salary";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface TavilyHit {
  title?: string;
  url?: string;
  content?: string;
}

interface ExtractedBand {
  min_lpa: number;
  max_lpa: number;
  sources: Array<{ title: string; url: string }>;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildCacheKey(input: {
  candidateId: string;
  jobId?: string | null;
}): string {
  const job = input.jobId ?? "nojob";
  return `${input.candidateId}|${job}|v2`;
}

function parseCtcLakhs(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(String(raw).replace(/[₹,\s]/g, "").replace(/lakh.*$/i, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function compareExpected(expected: number | null, min: number, max: number): "below" | "in_band" | "above" | null {
  if (expected == null) return null;
  if (expected < min) return "below";
  if (expected > max) return "above";
  return "in_band";
}

function isFresh(syncedAt: string | null | undefined): boolean {
  if (!syncedAt) return false;
  const t = Date.parse(syncedAt);
  return !Number.isNaN(t) && Date.now() - t < CACHE_TTL_MS;
}

function parseCachedPayload(raw: string | null): ExtractedBand | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExtractedBand> & { ok?: boolean };
    if (parsed.ok === false) return null;
    if (typeof parsed.min_lpa !== "number" || typeof parsed.max_lpa !== "number") return null;
    if (!Array.isArray(parsed.sources) || parsed.sources.length < 2) return null;
    return { min_lpa: parsed.min_lpa, max_lpa: parsed.max_lpa, sources: parsed.sources };
  } catch {
    return null;
  }
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

    const body = await req.json() as { candidate_id?: string; force?: boolean; cacheOnly?: boolean };
    const candidateId = body.candidate_id;
    if (!candidateId) return json({ error: "candidate_id is required" }, 400);

    const { data: candidate, error: candErr } = await supabase
      .from("candidates")
      .select("id, role_applied, work_experience, education, job_id, job:jobs(id, title, description, required_skills, location)")
      .eq("id", candidateId)
      .maybeSingle();
    if (candErr) throw candErr;
    if (!candidate) return json({ error: "Candidate not found" }, 404);

    const { data: prescreen } = await supabase
      .from("candidate_prescreens")
      .select("expected_ctc, current_location, preferred_location, relevant_experience_domain")
      .eq("candidate_id", candidateId)
      .maybeSingle();

    const job = candidate.job as {
      id?: string;
      title?: string;
      description?: string;
      required_skills?: string[];
      location?: string;
    } | null;

    const career = analyzeCareer({
      workExperience: candidate.work_experience,
      education: candidate.education,
      target: {
        jobTitle: job?.title ?? null,
        jobDescription: job?.description ?? null,
        roleApplied: candidate.role_applied ?? null,
        requiredSkills: Array.isArray(job?.required_skills) ? job.required_skills : null,
      },
    });

    const role = (job?.title || candidate.role_applied || "the open role").trim();
    const location = (
      prescreen?.current_location
      || prescreen?.preferred_location
      || job?.location
      || "India"
    ).trim();
    const relevantYears = career.relevantYears;
    const cacheKey = buildCacheKey({
      candidateId,
      jobId: job?.id ?? candidate.job_id,
    });

    if (!body.force) {
      const jobKey = job?.id ?? candidate.job_id ?? "nojob";
      const { data: exactCachedRow, error: exactCacheErr } = await supabase
        .from("external_refs")
        .select("external_url, synced_at")
        .eq("provider", PROVIDER)
        .eq("entity_type", "candidate")
        .eq("entity_id", candidateId)
        .eq("external_id", cacheKey)
        .maybeSingle();
      if (exactCacheErr) throw exactCacheErr;

      let cachedRow = exactCachedRow;
      if (!cachedRow) {
        const { data: legacyCachedRow, error: legacyCacheErr } = await supabase
          .from("external_refs")
          .select("external_url, synced_at")
          .eq("provider", PROVIDER)
          .eq("entity_type", "candidate")
          .eq("entity_id", candidateId)
          .like("external_id", `${candidateId}|${jobKey}|%`)
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (legacyCacheErr) throw legacyCacheErr;
        cachedRow = legacyCachedRow;
      }

      if (cachedRow && isFresh(cachedRow.synced_at as string | null)) {
        const cached = parseCachedPayload(cachedRow.external_url as string | null);
        if (cached) {
          const expected = parseCtcLakhs(prescreen?.expected_ctc);
          return json({
            ok: true,
            ...cached,
            expected_vs_band: compareExpected(expected, cached.min_lpa, cached.max_lpa),
            cached: true,
            queried_at: cachedRow.synced_at,
            role,
            relevant_years: relevantYears,
            location,
          });
        }
        const miss = (() => {
          try {
            return JSON.parse(String(cachedRow.external_url)) as { ok?: boolean; reason?: string; message?: string };
          } catch {
            return null;
          }
        })();
        if (miss?.ok === false) {
          return json({
            ok: false,
            reason: miss.reason ?? "insufficient_sources",
            message: miss.message ?? "Not enough INR sources to quote a range.",
            cached: true,
          });
        }
      }

      if (body.cacheOnly) {
        return json({ cache_miss: true, cached: false });
      }
    } else if (body.cacheOnly) {
      return json({ error: "cacheOnly cannot be combined with force" }, 400);
    }

    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!tavilyKey) {
      return json({
        ok: false,
        reason: "tavily_unconfigured",
        message: "TAVILY_API_KEY is not set on the functions host.",
        cached: false,
      });
    }
    if (!geminiKey) {
      throw new Error("Gemini API key not set. Add GOOGLE_AI_API_KEY or GEMINI_API_KEY.");
    }

    const yearLabel = relevantYears > 0
      ? `${relevantYears} years relevant experience`
      : "relevant experience from résumé timeline";
    const query =
      `${role} salary CTC LPA India ${location} ${yearLabel} 2024 2025 2026`.replace(/\s+/g, " ").trim();

    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tavilyKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 8,
        include_answer: false,
        topic: "general",
      }),
    });
    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text();
      throw new Error(`Tavily search failed: HTTP ${tavilyRes.status}${errText.length < 160 ? ` ${errText}` : ""}`);
    }
    const tavilyJson = await tavilyRes.json() as { results?: TavilyHit[] };
    const hits = (tavilyJson.results ?? []).filter((h) => h.url && h.content);

    const snippets = hits.slice(0, 8).map((h, i) => (
      `[${i + 1}] ${h.title ?? "Untitled"}\nURL: ${h.url}\n${(h.content ?? "").slice(0, 600)}`
    )).join("\n\n");

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const extractPrompt = `You extract Indian IT compensation ranges from web search snippets.

Ground-truth profile (do not inflate years):
- Target role: ${role}
- Relevant professional years (trainings/interns excluded): ${relevantYears}
- Location: ${location}
- Domain note: ${prescreen?.relevant_experience_domain ?? "n/a"}

Rules:
- Use only INR lakhs per annum (LPA). Drop USD, intern/stipend, campus, and stale/off-role hits.
- A usable source must mention INR/LPA/lakh figures that could apply to this role + relevant years + India.
- If fewer than TWO distinct usable INR sources remain, set enough_sources=false and omit min/max.
- Never invent a range. Never scrape or claim Naukri/AmbitionBox/Glassdoor live APIs — these are search snippets only.
- min_lpa < max_lpa; both positive numbers in lakhs.

Snippets:
${snippets || "(no snippets)"}`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${geminiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Return structured salary extraction via the extract_inr_lpa tool only." },
            { role: "user", content: extractPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_inr_lpa",
              description: "INR LPA range grounded in snippets, or insufficient_sources.",
              parameters: {
                type: "object",
                properties: {
                  enough_sources: { type: "boolean" },
                  min_lpa: { type: "number" },
                  max_lpa: { type: "number" },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        url: { type: "string" },
                      },
                      required: ["title", "url"],
                    },
                  },
                },
                required: ["enough_sources", "sources"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_inr_lpa" } },
        }),
      },
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Gemini API error: HTTP ${aiRes.status}${errText.length < 200 ? ` ${errText}` : ""}`);
    }

    const aiJson = await aiRes.json() as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const argsRaw = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsRaw) throw new Error("Gemini did not return salary extraction");
    const extracted = JSON.parse(argsRaw) as {
      enough_sources?: boolean;
      min_lpa?: number;
      max_lpa?: number;
      sources?: Array<{ title?: string; url?: string }>;
    };

    const usableSources = (extracted.sources ?? [])
      .filter((s): s is { title: string; url: string } =>
        typeof s.title === "string" && typeof s.url === "string" && /^https?:\/\//i.test(s.url))
      .slice(0, 3);

    const enough = extracted.enough_sources === true
      && usableSources.length >= 2
      && typeof extracted.min_lpa === "number"
      && typeof extracted.max_lpa === "number"
      && extracted.min_lpa > 0
      && extracted.max_lpa > extracted.min_lpa;

    const nowIso = new Date().toISOString();

    if (!enough) {
      const failPayload = {
        ok: false,
        reason: "insufficient_sources",
        message: "Not enough INR sources to quote a range.",
      };
      const { error: missCacheErr } = await supabase.from("external_refs").upsert(
        {
          entity_type: "candidate",
          entity_id: candidateId,
          provider: PROVIDER,
          external_id: cacheKey,
          external_url: JSON.stringify(failPayload),
          synced_at: nowIso,
        },
        { onConflict: "provider,entity_type,external_id" },
      );
      if (missCacheErr) throw new Error(`Salary cache write failed: ${missCacheErr.message}`);
      return json({ ...failPayload, cached: false });
    }

    const band: ExtractedBand = {
      min_lpa: Math.round(extracted.min_lpa! * 10) / 10,
      max_lpa: Math.round(extracted.max_lpa! * 10) / 10,
      sources: usableSources,
    };
    const expected = parseCtcLakhs(prescreen?.expected_ctc);
    const successPayload = {
      ok: true as const,
      ...band,
      expected_vs_band: compareExpected(expected, band.min_lpa, band.max_lpa),
      queried_at: nowIso,
      role,
      relevant_years: relevantYears,
      location,
    };

    const { error: hitCacheErr } = await supabase.from("external_refs").upsert(
      {
        entity_type: "candidate",
        entity_id: candidateId,
        provider: PROVIDER,
        external_id: cacheKey,
        external_url: JSON.stringify(successPayload),
        synced_at: nowIso,
      },
      { onConflict: "provider,entity_type,external_id" },
    );
    if (hitCacheErr) throw new Error(`Salary cache write failed: ${hitCacheErr.message}`);

    return json({ ...successPayload, cached: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("salary-market-check error:", e);
    return json({ error: message }, 500);
  }
});
