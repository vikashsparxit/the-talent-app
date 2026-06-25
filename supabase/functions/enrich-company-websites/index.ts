import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("Gemini API key not configured");

    // Fetch candidate work_experience
    const { data: candidate, error: fetchErr } = await supabase
      .from("candidates")
      .select("work_experience")
      .eq("id", candidate_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const workExp: any[] = (candidate?.work_experience as any[]) || [];
    const toEnrich = workExp.filter((e) => e.company && !e.website);

    if (!toEnrich.length) {
      return new Response(JSON.stringify({ success: true, enriched: 0, work_experience: workExp }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean company names before sending to Gemini — strip legal suffixes and city names
    // so "Denave India Pvt Ltd Noida" → "Denave India", "Paytm Movies" stays as-is
    function cleanBrandName(name: string): string {
      return name
        .replace(/\s+(Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|Limited|Inc\.?|LLP|LLC|Corp\.?|Corporation)\b/gi, "")
        .replace(/\s+(Noida|Mumbai|Bangalore|Bengaluru|Delhi\s*NCR|Delhi|Gurgaon|Gurugram|Hyderabad|Pune|Chennai|Kolkata|Ahmedabad|Jaipur|Lucknow|Surat)\s*$/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Build both original and cleaned name for each company
    const rawNames = [...new Set(toEnrich.map((e) => e.company as string))];
    const cleanedNames = rawNames.map(cleanBrandName);
    // Deduplicate while keeping original→cleaned mapping
    const nameMap = new Map(rawNames.map((raw, i) => [raw, cleanedNames[i]]));
    const uniqueCleaned = [...new Set(cleanedNames)];

    // Gemini call — improved prompt for Indian company names
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GOOGLE_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          messages: [
            {
              role: "system",
              content: `You are an expert at identifying company websites, especially Indian companies.
For each company name provided, return its primary official website URL (e.g. https://zomato.com).
Rules:
- Include well-known Indian companies: Zomato, Paytm, Nykaa, Myntra, Swiggy, Flipkart, Ola, Byju's, etc.
- For subsidiary or brand names (e.g. "District by Zomato", "Paytm Movies"), return the parent brand or brand-specific URL.
- Names have already been cleaned of Pvt Ltd / city suffixes.
- Always include https:// in the URL.
- Return null ONLY if you genuinely cannot identify the company. Do not guess unknown SMBs.`,
            },
            {
              role: "user",
              content: `Return the official website for each: ${uniqueCleaned.join(", ")}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "company_websites",
                description: "Return official website URLs for a list of company names",
                parameters: {
                  type: "object",
                  properties: {
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Company name exactly as provided" },
                          website: { type: "string", description: "Official website URL with https://, or null if not found" },
                        },
                        required: ["name"],
                      },
                    },
                  },
                  required: ["results"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "company_websites" } },
        }),
      }
    );

    if (!aiRes.ok) throw new Error(`Gemini error: ${aiRes.status}`);
    const aiResult = await aiRes.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");

    const { results } = JSON.parse(toolCall.function.arguments) as {
      results: { name: string; website?: string | null }[];
    };

    // Sanitise results — reject null strings and non-URLs
    const isValidUrl = (v: string | null | undefined): boolean =>
      !!v && v !== "null" && v !== "None" && v !== "none" && v !== "" && v.startsWith("http");

    // Build lookup map keyed by cleaned name (lowercase)
    const websiteMap = new Map<string, string>(
      results
        .filter((r) => isValidUrl(r.website))
        .map((r) => [r.name.toLowerCase().trim(), r.website as string])
    );

    // Merge back: for each work_exp entry, resolve via cleaned name → lookup
    const updatedWorkExp = workExp.map((e) => {
      if (e.website && isValidUrl(e.website)) return e; // already has a valid URL
      const cleaned = nameMap.get(e.company as string) ?? cleanBrandName(e.company as string);
      const found = websiteMap.get(cleaned.toLowerCase().trim()) ?? null;
      return { ...e, website: found };
    });

    // Persist to DB
    await supabase
      .from("candidates")
      .update({ work_experience: updatedWorkExp })
      .eq("id", candidate_id);

    return new Response(
      JSON.stringify({ success: true, enriched: toEnrich.length, work_experience: updatedWorkExp }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enrich-company-websites error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
