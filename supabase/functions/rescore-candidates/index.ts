import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminOrHR } from "../_shared/auth.ts";
import { findCertTier, normalizeCertifications, type CertTier } from "../_shared/certTiers.ts";

function matchCollegeTier(institution: string, tier1Colleges: string[]): number {
  const lower = institution.toLowerCase();
  for (const college of tier1Colleges) {
    if (lower.includes(college)) return 1;
  }
  return 0;
}

function computeCredentialScore(
  certifications: any[],
  awards: any[],
  education: any[],
  collegeTiers: Record<string, number>,
  certTiersConfig: Record<string, CertTier>,
  tier1Colleges: string[]
): number {
  let score = 0;

  // 1. Premium Certifications (max 30 pts)
  let certScore = 0;
  for (const cert of certifications) {
    const match = findCertTier(cert.name || '', certTiersConfig);
    if (match) {
      const pts = match.tier === 1 ? 30 : match.tier === 2 ? 20 : 10;
      certScore = Math.max(certScore, pts);
    }
  }
  score += certScore;

  // 2. College Tier (max 25 pts)
  let collegeScore = 0;
  for (const edu of education) {
    const inst = edu.institution || '';
    let tier = matchCollegeTier(inst, tier1Colleges);
    if (tier === 0 && collegeTiers[inst]) {
      tier = collegeTiers[inst];
    }
    if (tier === 1) collegeScore = Math.max(collegeScore, 25);
    else if (tier === 2) collegeScore = Math.max(collegeScore, 15);
    else if (tier === 3) collegeScore = Math.max(collegeScore, 5);
  }
  score += collegeScore;

  // 3. Awards (max 15 pts)
  const awardCount = Math.min(awards.length, 3);
  score += awardCount * 5;

  // 4. Recency bonus (max 10 pts)
  const now = new Date().getFullYear();
  for (const cert of certifications) {
    if (cert.year && now - parseInt(cert.year) <= 3) {
      score += 10;
      break;
    }
  }

  return Math.min(score, 100);
}

serveWithCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const auth = await requireAdminOrHR(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    // Fetch config
    const { data: certConfig } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "cert_tiers")
      .single();

    const { data: collegeConfig } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "tier1_colleges")
      .single();

    const certTiers = certConfig?.config_value || {};
    const tier1Colleges = collegeConfig?.config_value || [];

    // Fetch all candidates with certifications or education
    const { data: candidates, error: fetchError } = await supabase
      .from("candidates")
      .select("id, certifications, awards, education")
      .order("created_at", { ascending: false });

    if (fetchError) throw fetchError;

    let updated = 0;
    for (const candidate of candidates || []) {
      const certs = normalizeCertifications(candidate.certifications);
      const awards = candidate.awards || [];
      const education = candidate.education || [];

      // Re-tag premium certifications
      const taggedCerts = certs.map((cert: any) => {
        const match = findCertTier(cert.name || '', certTiers);
        return {
          ...cert,
          tier: match?.tier || null,
          category: match?.category || null,
          skill_upgrade: match?.skill_upgrade || null,
          is_premium: !!match,
        };
      });

      const newScore = computeCredentialScore(certs, awards, education, {}, certTiers, tier1Colleges);

      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          credential_score: newScore,
          certifications: taggedCerts,
        })
        .eq("id", candidate.id);

      if (!updateError) updated++;
    }

    return new Response(JSON.stringify({ success: true, updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return errorResponse("rescore-candidates", error, corsHeaders);
  }
});
