import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { requireAuth } from "../_shared/auth.ts";
import { downloadResumeBytes } from "../_shared/resume.ts";

// Normalize AI "null-like" string values to actual null
function normalizeStr(val: any): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s || ['none', 'n/a', 'null', 'undefined', 'not available', 'not provided', '-', 'na', 'unknown'].includes(s.toLowerCase())) return null;
  return s;
}

// Extract plain text from DOCX (ZIP + XML)
function extractDocxText(buffer: ArrayBuffer | Uint8Array): string {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const unzipped = unzipSync(uint8);
  const docXml = unzipped['word/document.xml'];
  if (!docXml) throw new Error('Invalid DOCX: missing word/document.xml');
  const xml = new TextDecoder().decode(docXml);
  // Insert newline at paragraph/line breaks before stripping tags
  return xml
    .replace(/<w:br[^/]*/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Best-effort readable text from old binary .doc files
function extractDocText(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(bytes);
  // Extract printable ASCII runs of 4+ chars
  return (raw.match(/[\x20-\x7E]{4,}/g) || []).join(' ').replace(/\s+/g, ' ').trim();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Dynamic config - loaded from system_config table at runtime
let CERT_TIERS: Record<string, { tier: number; category: string; skill_upgrade: string }> = {};
let TIER1_COLLEGES: string[] = [];

async function loadConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const [certRes, collegeRes] = await Promise.all([
    supabase.from("system_config").select("config_value").eq("config_key", "cert_tiers").single(),
    supabase.from("system_config").select("config_value").eq("config_key", "tier1_colleges").single(),
  ]);

  CERT_TIERS = certRes.data?.config_value || {};
  TIER1_COLLEGES = collegeRes.data?.config_value || [];
}

function matchCertTier(certName: string): { tier: number; category: string; skill_upgrade: string } | null {
  const lower = certName.toLowerCase().trim();
  // Exact match first
  if (CERT_TIERS[lower]) return CERT_TIERS[lower];
  // Substring match
  for (const [key, value] of Object.entries(CERT_TIERS)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }
  return null;
}

function matchCollegeTier(institution: string): number {
  const lower = institution.toLowerCase();
  for (const college of TIER1_COLLEGES) {
    if (lower.includes(college)) return 1;
  }
  return 0; // Will be AI-classified
}

function computeCredentialScore(
  certifications: any[],
  awards: any[],
  education: any[],
  collegeTiers: Record<string, number>
): number {
  let score = 0;

  // 1. Premium Certifications (max 30 pts)
  let certScore = 0;
  for (const cert of certifications) {
    const match = matchCertTier(cert.name || '');
    if (match) {
      const pts = match.tier === 1 ? 30 : match.tier === 2 ? 20 : 10;
      certScore = Math.max(certScore, pts); // Best cert wins
    }
  }
  score += certScore;

  // 2. College Tier (max 25 pts)
  let collegeScore = 0;
  for (const edu of education) {
    const inst = edu.institution || '';
    let tier = matchCollegeTier(inst);
    if (tier === 0 && collegeTiers[inst]) {
      tier = collegeTiers[inst];
    }
    if (tier === 1) collegeScore = Math.max(collegeScore, 25);
    else if (tier === 2) collegeScore = Math.max(collegeScore, 15);
    else if (tier === 3) collegeScore = Math.max(collegeScore, 8);
  }
  score += collegeScore;

  // 3. Awards (max 15 pts)
  let awardScore = 0;
  for (const award of awards) {
    const scope = (award.scope || '').toLowerCase();
    if (scope.includes('international') || scope.includes('global')) awardScore = Math.max(awardScore, 15);
    else if (scope.includes('national')) awardScore = Math.max(awardScore, 10);
    else awardScore = Math.max(awardScore, 5);
  }
  score += awardScore;

  // 4. Certification Recency (max 10 pts)
  const currentYear = new Date().getFullYear();
  let recencyScore = 0;
  for (const cert of certifications) {
    const year = parseInt(cert.year || '0');
    if (year > 0) {
      const age = currentYear - year;
      if (age <= 2) recencyScore = Math.max(recencyScore, 10);
      else if (age <= 5) recencyScore = Math.max(recencyScore, 6);
      else recencyScore = Math.max(recencyScore, 3);
    }
  }
  score += recencyScore;

  // 5. Cert quantity bonus (max 20 pts, 5 pts per meaningful cert up to 4)
  const meaningfulCerts = certifications.filter(c => matchCertTier(c.name || '')).length;
  score += Math.min(meaningfulCerts * 5, 20);

  return Math.min(score, 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Load dynamic config from database
    await loadConfig();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const auth = await requireAuth(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { resume_url } = body as { resume_url?: string };
    if (!resume_url) {
      return new Response(JSON.stringify({ error: "resume_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("Gemini API key not set. Add GOOGLE_AI_API_KEY or GEMINI_API_KEY to the environment of your Edge Functions service (self-hosted: see docs/EDGE_FUNCTIONS_SECRETS_SELF_HOSTED.md).");
    }

    const { bytes, lowerUrl } = await downloadResumeBytes(supabase, resume_url);

    // Determine file type from URL
    const isDocx = lowerUrl.includes(".docx");
    const isDoc = lowerUrl.includes(".doc") && !isDocx;
    const isPdf = !isDocx && !isDoc;

    // Build the content parts for Gemini:
    // - PDF: send as inlineData (Gemini natively supports PDF)
    // - DOCX: extract XML text locally, send as plain text (Gemini rejects Word MIME types)
    // - DOC: extract printable text runs, send as plain text
    let fileParts: any[];

    if (isPdf) {
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64Content = btoa(binary);
      fileParts = [
        { inlineData: { mimeType: "application/pdf", data: base64Content } },
        { text: "Parse this resume PDF and extract the candidate's details using the extract_resume_data function." },
      ];
    } else if (isDocx) {
      const text = extractDocxText(bytes);
      if (!text || text.length < 50) throw new Error("Could not extract text from DOCX file");
      fileParts = [
        { text: `The following is the plain text extracted from a DOCX resume. Parse it and extract the candidate's details using the extract_resume_data function.\n\n${text}` },
      ];
    } else {
      // .doc — best-effort printable text extraction
      const text = extractDocText(bytes);
      if (!text || text.length < 50) throw new Error("Could not extract text from DOC file");
      fileParts = [
        { text: `The following is the plain text extracted from a DOC resume. Parse it and extract the candidate's details using the extract_resume_data function.\n\n${text}` },
      ];
    }

    // Use Gemini native API
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "You are a resume parser. Extract structured information from the resume provided. Be accurate and extract only what is clearly stated in the document. If a field is not present, omit it entirely — do NOT return 'None', 'N/A', 'null', or placeholder strings. Return only real values.",
            }],
          },
          contents: [{
            role: "user",
            parts: [
              ...fileParts,
              {
                text: "Pay special attention to certifications (professional certifications, licenses, accreditations) and awards/achievements. For college_tiers, classify each educational institution as tier 1 (top global/national like IIT, IIM, MIT, Stanford, NIT, BITS), tier 2 (well-known state universities, top private), or tier 3 (others).",
              },
            ],
          }],
          tools: [{
            functionDeclarations: [{
              name: "extract_resume_data",
              description: "Extract structured data from a resume document including certifications and awards.",
              parameters: {
                type: "object",
                properties: {
                  full_name: { type: "string", description: "The candidate's full name" },
                  phone: { type: "string", description: "Phone number with country code if available" },
                  linkedin_url: { type: "string", description: "LinkedIn profile URL if mentioned" },
                  email: { type: "string", description: "Email address from the resume" },
                  summary: { type: "string", description: "A brief professional summary (2-3 sentences)" },
                  skills: { type: "array", items: { type: "string" }, description: "List of key skills" },
                  experience_years: { type: "number", description: "Approximate total years of professional experience" },
                  current_role: { type: "string", description: "The candidate's most recent/current job title" },
                  current_company: { type: "string", description: "The candidate's most recent/current employer name" },
                  work_experience: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        company: { type: "string" },
                        title: { type: "string" },
                        start_date: { type: "string", description: "Format: YYYY-MM or YYYY" },
                        end_date: { type: "string", description: "Format: YYYY-MM, YYYY, or 'Present'" },
                        description: { type: "string", description: "Brief description of role/achievements" },
                      },
                      required: ["company", "title"],
                    },
                    description: "List of work experiences, most recent first",
                  },
                  education: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        institution: { type: "string" },
                        degree: { type: "string" },
                        field: { type: "string", description: "Field of study" },
                        start_date: { type: "string", description: "Format: YYYY" },
                        end_date: { type: "string", description: "Format: YYYY or 'Present'" },
                      },
                      required: ["institution", "degree"],
                    },
                    description: "List of educational qualifications",
                  },
                  certifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Full certification name e.g. 'PMP - Project Management Professional'" },
                        issuer: { type: "string", description: "Issuing organization e.g. 'PMI', 'AWS', '(ISC)²'" },
                        year: { type: "string", description: "Year obtained (YYYY)" },
                        credential_id: { type: "string", description: "Credential/license ID if mentioned" },
                        expiry: { type: "string", description: "Expiry date if mentioned" },
                      },
                      required: ["name"],
                    },
                    description: "Professional certifications, licenses, accreditations (NOT online course completions unless they have an exam component)",
                  },
                  awards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Award or achievement title" },
                        issuer: { type: "string", description: "Who gave the award" },
                        year: { type: "string", description: "Year received" },
                        scope: { type: "string", description: "One of: 'international', 'national', 'regional', 'organizational'" },
                      },
                      required: ["title"],
                    },
                    description: "Awards, honors, and notable achievements",
                  },
                  college_tiers_json: {
                    type: "string",
                    description: "JSON string mapping institution name to tier number (1=top, 2=good, 3=average) for institutions NOT in the standard top-tier list. Example: {\"Some University\": 2}",
                  },
                },
                required: ["full_name"],
              },
            }],
          }],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["extract_resume_data"],
            },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("Google AI error:", aiResponse.status, errorText);
      let reason = `HTTP ${aiResponse.status}`;
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.error?.message ?? errJson?.message;
        if (msg) reason = typeof msg === "string" ? msg : String(msg);
      } catch { if (errorText.length < 200) reason = errorText; }
      throw new Error(`Gemini API error: ${reason}`);
    }

    const aiResult = await aiResponse.json();
    // Native Gemini API returns functionCall inside parts
    const parts = aiResult.candidates?.[0]?.content?.parts ?? [];
    const fnPart = parts.find((p: any) => p.functionCall);

    if (!fnPart?.functionCall?.args) {
      throw new Error("AI did not return structured data");
    }

    // Native API returns args as an object directly (not a JSON string)
    const raw = fnPart.functionCall.args;

    // Normalize all string fields — Gemini sometimes returns "None", "N/A", etc.
    const parsed: any = {
      ...raw,
      full_name: normalizeStr(raw.full_name),
      email: normalizeStr(raw.email),
      phone: normalizeStr(raw.phone),
      linkedin_url: normalizeStr(raw.linkedin_url),
      summary: normalizeStr(raw.summary),
      current_role: normalizeStr(raw.current_role),
      current_company: normalizeStr(raw.current_company),
    };

    // Calculate parse_score based on field completeness
    let filledFields = 0;
    const totalFields = 12;
    if (parsed.full_name) filledFields++;
    if (parsed.email) filledFields++;
    if (parsed.phone) filledFields++;
    if (parsed.linkedin_url) filledFields++;
    if (parsed.summary) filledFields++;
    if (parsed.skills?.length > 0) filledFields++;
    if (parsed.experience_years != null) filledFields++;
    if (parsed.current_role) filledFields++;
    if (parsed.current_company) filledFields++;
    if (parsed.work_experience?.length > 0) filledFields++;
    if (parsed.certifications?.length > 0) filledFields++;
    if (parsed.education?.length > 0) filledFields++;
    parsed.parse_score = Math.round((filledFields / totalFields) * 100);

    // Compute credential score
    const certifications = parsed.certifications || [];
    const awards = parsed.awards || [];
    const education = parsed.education || [];
    let collegeTiers: Record<string, number> = {};
    try {
      if (parsed.college_tiers_json) {
        collegeTiers = JSON.parse(parsed.college_tiers_json);
      }
    } catch { /* ignore malformed JSON from AI */ }

    parsed.credential_score = computeCredentialScore(certifications, awards, education, collegeTiers);

    // Tag premium certifications
    parsed.certifications = certifications.map((cert: any) => {
      const match = matchCertTier(cert.name || '');
      return {
        ...cert,
        tier: match?.tier || null,
        category: match?.category || null,
        skill_upgrade: match?.skill_upgrade || null,
        is_premium: !!match,
      };
    });

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-resume error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
