import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache lives in existing external_refs. Key is the normalized company name, so a
// company resolved for one candidate is reused for every other candidate.
// entity_id records whichever candidate last triggered the lookup.
const PROVIDER = "tavily_company";
const CACHE_KEY_VERSION = "v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SEARCHES_PER_CALL = 8;
const SEARCH_CONCURRENCY = 3;
const TAVILY_RESULTS_PER_COMPANY = 6;

interface WorkExperienceEntry {
  company?: string | null;
  website?: string | null;
  [key: string]: unknown;
}

interface TavilyHit {
  title?: string;
  url?: string;
  content?: string;
}

interface CompanyCandidate {
  key: string;
  cleaned: string;
  searchFailed: boolean;
  hits: Array<{ title: string; url: string; host: string; content: string }>;
}

type CachePayload = { ok: true; website: string } | { ok: false; reason: string };

// Aggregators, social, job boards and registry scrapers are never an official homepage.
// LinkedIn / Naukri / AmbitionBox are also never fetched — they are only dropped from search hits.
const BLOCKED_HOSTS = [
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "threads.net",
  "youtube.com", "pinterest.com", "reddit.com", "quora.com", "medium.com", "blogspot.com",
  "wordpress.com", "wikipedia.org", "wikiwand.com", "fandom.com",
  "naukri.com", "ambitionbox.com", "glassdoor.com", "glassdoor.co.in", "indeed.com",
  "monsterindia.com", "monster.com", "foundit.in", "shine.com", "timesjobs.com",
  "iimjobs.com", "hirist.com", "hirist.tech", "cutshort.io", "internshala.com",
  "freshersworld.com", "simplyhired.com", "ziprecruiter.com", "jobstreet.com",
  "zoominfo.com", "rocketreach.co", "apollo.io", "lusha.com", "signalhire.com",
  "crunchbase.com", "tracxn.com", "owler.com", "similarweb.com", "zaubacorp.com",
  "tofler.in", "indiamart.com", "justdial.com", "yelp.com", "trustpilot.com",
  "mouthshut.com", "clutch.co", "goodfirms.co", "g2.com", "capterra.com",
  "bloomberg.com", "reuters.com", "economictimes.indiatimes.com", "business-standard.com",
  "github.com", "gitlab.com", "behance.net", "dribbble.com", "slideshare.net",
];

// Placeholders that are not real employers.
const GARBAGE_NAMES = new Set([
  "self", "self employed", "selfemployed", "self employment", "freelance", "freelancer",
  "freelancing", "independent", "independent consultant", "consultant", "contract",
  "contractor", "na", "n a", "none", "nil", "null", "unknown", "not applicable",
  "various", "various companies", "multiple", "multiple companies", "confidential",
  "private", "own business", "startup", "home", "student", "internship", "intern",
]);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strip legal suffixes and trailing city names: "Denave India Pvt Ltd Noida" → "Denave India"
function cleanBrandName(name: string): string {
  return name
    .replace(/\s+(Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|Limited|Inc\.?|LLP|LLC|Corp\.?|Corporation)\b/gi, "")
    .replace(/\s+(Noida|Mumbai|Bangalore|Bengaluru|Delhi\s*NCR|Delhi|Gurgaon|Gurugram|Hyderabad|Pune|Chennai|Kolkata|Ahmedabad|Jaipur|Lucknow|Surat)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSearchableName(cleaned: string): boolean {
  const key = normalizeKey(cleaned);
  if (key.length < 3) return false;
  if (!/[a-z]{3}/.test(key)) return false;
  return !GARBAGE_NAMES.has(key);
}

function isValidUrl(value: unknown): boolean {
  return typeof value === "string"
    && value !== "null" && value !== "None" && value !== "none" && value.trim() !== ""
    && /^https?:\/\//i.test(value);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBlockedHost(host: string): boolean {
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

// Homepage, not the deep link Tavily happened to match.
function toHomepage(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
}

function isFresh(syncedAt: string | null | undefined): boolean {
  if (!syncedAt) return false;
  const t = Date.parse(syncedAt);
  return !Number.isNaN(t) && Date.now() - t < CACHE_TTL_MS;
}

function parseCachePayload(raw: string | null): CachePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { ok?: boolean; website?: unknown; reason?: unknown };
    if (parsed.ok === true && typeof parsed.website === "string" && isValidUrl(parsed.website)) {
      return { ok: true, website: parsed.website };
    }
    if (parsed.ok === false) {
      return { ok: false, reason: typeof parsed.reason === "string" ? parsed.reason : "no_official_site" };
    }
    return null;
  } catch {
    return null;
  }
}

function cacheExternalId(key: string): string {
  return `company|${key}|${CACHE_KEY_VERSION}`;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function searchCompany(
  tavilyKey: string,
  entry: { key: string; cleaned: string },
): Promise<CompanyCandidate> {
  const failed: CompanyCandidate = { key: entry.key, cleaned: entry.cleaned, searchFailed: true, hits: [] };
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${tavilyKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Company names only — never candidate contact details or résumé text.
        query: `${entry.cleaned} official website company`,
        search_depth: "basic",
        max_results: TAVILY_RESULTS_PER_COMPANY,
        include_answer: false,
        topic: "general",
      }),
    });
    if (!res.ok) {
      console.error(`Tavily search failed for "${entry.cleaned}": HTTP ${res.status}`);
      return failed;
    }
    const body = await res.json() as { results?: TavilyHit[] };
    const hits = (body.results ?? [])
      .map((hit) => {
        const url = typeof hit.url === "string" ? hit.url : "";
        const host = url ? hostOf(url) : null;
        if (!host || isBlockedHost(host)) return null;
        return {
          title: hit.title ?? host,
          url,
          host,
          content: (hit.content ?? "").slice(0, 300),
        };
      })
      .filter((hit): hit is CompanyCandidate["hits"][number] => hit !== null);

    // Collapse duplicate hosts — one line per domain is enough for the picker.
    const seen = new Set<string>();
    return {
      key: entry.key,
      cleaned: entry.cleaned,
      searchFailed: false,
      hits: hits.filter((hit) => (seen.has(hit.host) ? false : (seen.add(hit.host), true))),
    };
  } catch (e) {
    console.error(`Tavily search error for "${entry.cleaned}":`, e);
    return failed;
  }
}

async function pickOfficialSites(
  geminiKey: string,
  companies: CompanyCandidate[],
): Promise<Map<string, string>> {
  const picked = new Map<string, string>();
  if (!companies.length) return picked;

  const blocks = companies.map((company, i) => {
    const lines = company.hits
      .map((hit, j) => `  ${j + 1}. ${hit.url}\n     title: ${hit.title}\n     snippet: ${hit.content}`)
      .join("\n");
    return `Company ${i + 1}: ${company.cleaned}\n${lines}`;
  }).join("\n\n");

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const prompt = `You match employer names to their official website using web search results.

Rules:
- Choose ONLY from the candidate URLs listed under each company. Never output a domain that is not listed.
- Pick the company's own official site (its homepage domain). Ignore directory, aggregator, review, job-board, news and social pages.
- If the company name is generic and the listed URLs clearly belong to a different business, set found=false.
- If no listed URL is the company's own site, set found=false. Guessing a plausible domain is a failure.
- Return the company name exactly as given.

Candidates:
${blocks}`;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Return official company websites via the pick_official_sites tool only." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "pick_official_sites",
            description: "For each company, the official site chosen from the listed candidate URLs.",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Company name exactly as provided" },
                      found: { type: "boolean", description: "True only when a listed URL is the company's own site" },
                      website: { type: "string", description: "One of the listed candidate URLs" },
                    },
                    required: ["name", "found"],
                  },
                },
              },
              required: ["results"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "pick_official_sites" } },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: HTTP ${res.status}${errText.length < 200 ? ` ${errText}` : ""}`);
  }

  const aiJson = await res.json() as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const argsRaw = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsRaw) throw new Error("Gemini did not return a website selection");

  const parsed = JSON.parse(argsRaw) as {
    results?: Array<{ name?: string; found?: boolean; website?: string }>;
  };

  const byKey = new Map(companies.map((c) => [normalizeKey(c.cleaned), c]));
  for (const result of parsed.results ?? []) {
    if (result.found !== true || typeof result.name !== "string" || !isValidUrl(result.website)) continue;
    const resultKey = normalizeKey(result.name);
    const company = byKey.get(resultKey)
      // Tolerate a name echoed back with an extra or missing trailing word.
      ?? (resultKey.length >= 4
        ? companies.find((c) => c.key.startsWith(resultKey) || resultKey.startsWith(c.key))
        : undefined);
    if (!company) continue;
    const host = hostOf(result.website as string);
    // Grounding gate: the pick must be a domain Tavily actually returned.
    if (!host || isBlockedHost(host) || !company.hits.some((hit) => hit.host === host)) continue;
    const homepage = toHomepage(result.website as string);
    if (homepage) picked.set(company.key, homepage);
  }

  return picked;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireStaff(req, supabase, corsHeaders, ["admin", "hr", "recruiter"]);
    if (!auth.ok) return auth.response;

    const body = await req.json() as { candidate_id?: string; force?: boolean; cache_only?: boolean };
    const candidateId = body.candidate_id;
    if (!candidateId) return json({ error: "candidate_id is required" }, 400);

    const { data: candidate, error: fetchErr } = await supabase
      .from("candidates")
      .select("work_experience")
      .eq("id", candidateId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const workExp = ((candidate?.work_experience as WorkExperienceEntry[] | null) ?? []).filter(
      (e): e is WorkExperienceEntry => !!e && typeof e === "object",
    );

    const pending = new Map<string, string>(); // normalized key → cleaned name
    for (const entry of workExp) {
      const company = typeof entry.company === "string" ? entry.company.trim() : "";
      if (!company || isValidUrl(entry.website)) continue;
      const cleaned = cleanBrandName(company) || company;
      if (!isSearchableName(cleaned)) continue;
      const key = normalizeKey(cleaned);
      if (!pending.has(key)) pending.set(key, cleaned);
    }

    if (!pending.size) {
      return json({ success: true, enriched: 0, from_cache: 0, searched: 0, work_experience: workExp });
    }

    const resolved = new Map<string, string>();
    const negativeCached = new Set<string>();
    let fromCache = 0;

    if (!body.force) {
      const keyByExternalId = new Map([...pending.keys()].map((key) => [cacheExternalId(key), key]));
      const { data: cacheRows, error: cacheErr } = await supabase
        .from("external_refs")
        .select("external_id, external_url, synced_at")
        .eq("provider", PROVIDER)
        .eq("entity_type", "candidate")
        .in("external_id", [...keyByExternalId.keys()]);
      // Cache is an optimisation — if external_refs is unavailable, fall through to search.
      if (cacheErr) console.error("Company website cache read failed:", cacheErr.message);

      for (const row of cacheRows ?? []) {
        if (!isFresh(row.synced_at as string | null)) continue;
        const payload = parseCachePayload(row.external_url as string | null);
        const key = keyByExternalId.get(row.external_id as string);
        if (!payload || !key) continue;
        fromCache++;
        if (payload.ok) resolved.set(key, payload.website);
        else negativeCached.add(key);
      }
    }

    const misses = [...pending.entries()]
      .filter(([key]) => !resolved.has(key) && !negativeCached.has(key))
      .map(([key, cleaned]) => ({ key, cleaned }));

    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    const skipLookup = body.cache_only === true || !misses.length || !tavilyKey || !geminiKey;

    let searched = 0;
    const freshResults = new Map<string, string>();
    const freshMisses: string[] = [];

    if (!skipLookup) {
      const batch = misses.slice(0, MAX_SEARCHES_PER_CALL);
      searched = batch.length;
      const searchResults = await mapPool(batch, SEARCH_CONCURRENCY, (entry) =>
        searchCompany(tavilyKey as string, entry));
      const withHits = searchResults.filter((company) => company.hits.length > 0);

      const picked = withHits.length ? await pickOfficialSites(geminiKey as string, withHits) : new Map<string, string>();
      for (const company of searchResults) {
        const website = picked.get(company.key);
        if (website) {
          freshResults.set(company.key, website);
          resolved.set(company.key, website);
        } else if (!company.searchFailed) {
          // Only cache a negative when the search itself succeeded.
          freshMisses.push(company.key);
        }
      }
    }

    // Apply to work_experience. A company with no official site keeps an empty website —
    // never a guessed domain.
    let changed = false;
    const updatedWorkExp = workExp.map((entry) => {
      if (isValidUrl(entry.website)) return entry;
      const company = typeof entry.company === "string" ? entry.company.trim() : "";
      const key = company ? normalizeKey(cleanBrandName(company) || company) : "";
      const website = key ? resolved.get(key) ?? null : null;
      if (website) {
        changed = true;
        return { ...entry, website };
      }
      // Clear legacy "null"/"None" placeholders so the UI stops treating them as values.
      if (entry.website != null && entry.website !== "") {
        changed = true;
        return { ...entry, website: null };
      }
      return entry;
    });

    if (changed) {
      const { error: updateErr } = await supabase
        .from("candidates")
        .update({ work_experience: updatedWorkExp })
        .eq("id", candidateId);
      if (updateErr) throw updateErr;
    }

    if (freshResults.size || freshMisses.length) {
      const nowIso = new Date().toISOString();
      const rows = [
        ...[...freshResults.entries()].map(([key, website]) => ({
          entity_type: "candidate",
          entity_id: candidateId,
          provider: PROVIDER,
          external_id: cacheExternalId(key),
          external_url: JSON.stringify({ ok: true, website } satisfies CachePayload),
          synced_at: nowIso,
        })),
        ...freshMisses.map((key) => ({
          entity_type: "candidate",
          entity_id: candidateId,
          provider: PROVIDER,
          external_id: cacheExternalId(key),
          external_url: JSON.stringify({ ok: false, reason: "no_official_site" } satisfies CachePayload),
          synced_at: nowIso,
        })),
      ];
      const { error: cacheWriteErr } = await supabase
        .from("external_refs")
        .upsert(rows, { onConflict: "provider,entity_type,external_id" });
      // Cache is an optimisation — a failed write must not fail the enrichment.
      if (cacheWriteErr) console.error("Company website cache write failed:", cacheWriteErr.message);
    }

    return json({
      success: true,
      enriched: resolved.size,
      from_cache: fromCache,
      searched,
      pending: pending.size,
      tavily_unconfigured: !tavilyKey ? true : undefined,
      work_experience: updatedWorkExp,
    });
  } catch (e) {
    console.error("enrich-company-websites error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
