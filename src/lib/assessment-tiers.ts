export type AssessmentTier =
  | 'tech_fresher'
  | 'tech_junior'
  | 'tech_mid'
  | 'tech_senior'
  | 'nontech_fresher'
  | 'nontech_experienced';

export const ASSESSMENT_TIERS: AssessmentTier[] = [
  'tech_fresher',
  'tech_junior',
  'tech_mid',
  'tech_senior',
  'nontech_fresher',
  'nontech_experienced',
];

export const assessmentTierLabels: Record<AssessmentTier, string> = {
  tech_fresher: 'Technical — Fresher (0–1 yr)',
  tech_junior: 'Technical — Junior (1–3 yrs)',
  tech_mid: 'Technical — Mid (3–5 yrs)',
  tech_senior: 'Technical — Senior (5+ yrs)',
  nontech_fresher: 'Non-Technical — Fresher (0–1 yr)',
  nontech_experienced: 'Non-Technical — Experienced (2+ yrs)',
};

export function isNonTechAssessmentTier(tier: AssessmentTier): boolean {
  return tier === 'nontech_fresher' || tier === 'nontech_experienced';
}
