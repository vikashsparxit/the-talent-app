import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AssessmentTier =
  | "tech_fresher"
  | "tech_junior"
  | "tech_mid"
  | "tech_senior"
  | "nontech_fresher"
  | "nontech_experienced";

interface GenerationProfile {
  tier: AssessmentTier;
  displayName: string;
  sectionCount: number;
  questionsPerSection: number;
  sectionTitles: string[];
  marks: { mcq: number; coding: number; subjective: number };
  durationMinutes: number;
  passingScore: number;
  minCodingQuestions: number;
  maxCodingQuestions: number;
  minSubjectiveQuestions: number;
  maxSubjectiveQuestions: number;
  minMcqQuestions: number;
  maxMcqQuestions: number;
  isTechnical: boolean;
  codingGuidance: string;
  focusGuidance: string;
}

const ASSESSMENT_PROFILES: Record<AssessmentTier, GenerationProfile> = {
  tech_fresher: {
    tier: "tech_fresher",
    displayName: "Technical — Fresher (0–1 yr)",
    sectionCount: 3,
    questionsPerSection: 2,
    sectionTitles: ["Fundamentals", "Coding Basics", "Problem Solving"],
    marks: { mcq: 5, coding: 10, subjective: 10 },
    durationMinutes: 60,
    passingScore: 60,
    minCodingQuestions: 2,
    maxCodingQuestions: 3,
    minSubjectiveQuestions: 1,
    maxSubjectiveQuestions: 2,
    minMcqQuestions: 1,
    maxMcqQuestions: 2,
    isTechnical: true,
    codingGuidance:
      "Easy coding: trace output, fix small bugs, or implement a simple function (arrays, strings, loops). Starter code encouraged.",
    focusGuidance:
      "~40% coding (2–3 questions), remainder MCQ fundamentals and short scenario/subjective judgment.",
  },
  tech_junior: {
    tier: "tech_junior",
    displayName: "Technical — Junior (1–3 yrs)",
    sectionCount: 3,
    questionsPerSection: 2,
    sectionTitles: ["Core Skills", "Coding & Algorithms", "Scenario Application"],
    marks: { mcq: 5, coding: 10, subjective: 10 },
    durationMinutes: 75,
    passingScore: 60,
    minCodingQuestions: 3,
    maxCodingQuestions: 3,
    minSubjectiveQuestions: 1,
    maxSubjectiveQuestions: 2,
    minMcqQuestions: 1,
    maxMcqQuestions: 2,
    isTechnical: true,
    codingGuidance:
      "Easy-to-medium coding: implement functions, basic data structures, simple algorithms. Include 2+ visible test cases.",
    focusGuidance:
      "~50% coding (3 questions), ~30% scenario/subjective, ~20% MCQ — total 6 questions.",
  },
  tech_mid: {
    tier: "tech_mid",
    displayName: "Technical — Mid (3–5 yrs)",
    sectionCount: 3,
    questionsPerSection: 2,
    sectionTitles: ["Technical Depth", "Coding & Design", "System Thinking"],
    marks: { mcq: 5, coding: 10, subjective: 10 },
    durationMinutes: 90,
    passingScore: 65,
    minCodingQuestions: 3,
    maxCodingQuestions: 3,
    minSubjectiveQuestions: 2,
    maxSubjectiveQuestions: 2,
    minMcqQuestions: 1,
    maxMcqQuestions: 1,
    isTechnical: true,
    codingGuidance:
      "Medium coding: design small modules, optimize logic, handle edge cases. May include API/service snippets relevant to the JD.",
    focusGuidance:
      "~50% coding (3 questions), ~30% scenario/subjective, ~20% MCQ — total 6 questions.",
  },
  tech_senior: {
    tier: "tech_senior",
    displayName: "Technical — Senior (5+ yrs)",
    sectionCount: 3,
    questionsPerSection: 2,
    sectionTitles: ["Architecture & Leadership", "Advanced Coding/Design", "System Design & Scenarios"],
    marks: { mcq: 5, coding: 10, subjective: 10 },
    durationMinutes: 90,
    passingScore: 70,
    minCodingQuestions: 2,
    maxCodingQuestions: 3,
    minSubjectiveQuestions: 2,
    maxSubjectiveQuestions: 3,
    minMcqQuestions: 1,
    maxMcqQuestions: 2,
    isTechnical: true,
    codingGuidance:
      "Hard coding/design: complex logic, performance trade-offs, or design-implement a non-trivial component. System design may appear as subjective instead.",
    focusGuidance:
      "~40% coding/design (2–3 questions), ~40% system/scenario subjective, ~20% MCQ — total 6 questions.",
  },
  nontech_fresher: {
    tier: "nontech_fresher",
    displayName: "Non-Technical — Fresher (0–1 yr)",
    sectionCount: 3,
    questionsPerSection: 2,
    sectionTitles: ["Role Knowledge", "Situational Judgment", "Communication"],
    marks: { mcq: 5, coding: 10, subjective: 10 },
    durationMinutes: 60,
    passingScore: 60,
    minCodingQuestions: 0,
    maxCodingQuestions: 0,
    minSubjectiveQuestions: 2,
    maxSubjectiveQuestions: 4,
    minMcqQuestions: 2,
    maxMcqQuestions: 4,
    isTechnical: false,
    codingGuidance: "No coding questions — this is a non-technical role.",
    focusGuidance:
      "MCQ on role basics, situational judgment, and short written responses. No coding. Role-agnostic professional skills from the JD.",
  },
  nontech_experienced: {
    tier: "nontech_experienced",
    displayName: "Non-Technical — Experienced (2+ yrs)",
    sectionCount: 3,
    questionsPerSection: 2,
    sectionTitles: ["Professional Judgment", "Prioritization & Strategy", "Communication & Stakeholders"],
    marks: { mcq: 5, coding: 10, subjective: 10 },
    durationMinutes: 75,
    passingScore: 65,
    minCodingQuestions: 0,
    maxCodingQuestions: 0,
    minSubjectiveQuestions: 3,
    maxSubjectiveQuestions: 5,
    minMcqQuestions: 1,
    maxMcqQuestions: 2,
    isTechnical: false,
    codingGuidance: "No coding questions — this is a non-technical role.",
    focusGuidance:
      "Scenario-heavy: prioritization, communication, stakeholder management, role-agnostic professional skills inferred from the JD.",
  },
};

interface AssessmentGenerationGlobal {
  section_count: number;
  questions_per_section: number;
  marks: { mcq: number; coding: number; subjective: number };
}

interface AssessmentTierGenerationSettings {
  duration_minutes: number;
  passing_score: number;
  min_coding_questions: number;
  max_coding_questions: number;
  min_subjective_questions: number;
  max_subjective_questions: number;
  min_mcq_questions: number;
  max_mcq_questions: number;
}

interface AssessmentGenerationSettings {
  global: AssessmentGenerationGlobal;
  tiers: Partial<Record<AssessmentTier, AssessmentTierGenerationSettings>>;
}

function mergeProfileWithSettings(
  base: GenerationProfile,
  settings: AssessmentGenerationSettings | null,
  tier: AssessmentTier,
): GenerationProfile {
  const tierSettings = settings?.tiers?.[tier];
  const global = settings?.global;

  const merged: GenerationProfile = { ...base };

  if (global) {
    merged.sectionCount = clampInt(global.section_count, 1, 10, base.sectionCount);
    merged.questionsPerSection = clampInt(global.questions_per_section, 1, 10, base.questionsPerSection);
    if (global.marks) {
      merged.marks = {
        mcq: clampInt(global.marks.mcq, 1, 20, base.marks.mcq),
        coding: clampInt(global.marks.coding, 1, 20, base.marks.coding),
        subjective: clampInt(global.marks.subjective, 1, 20, base.marks.subjective),
      };
    }
  }

  if (tierSettings) {
    merged.durationMinutes = clampInt(tierSettings.duration_minutes, 15, 180, base.durationMinutes);
    merged.passingScore = clampInt(tierSettings.passing_score, 40, 90, base.passingScore);
    merged.minCodingQuestions = clampInt(tierSettings.min_coding_questions, 0, 10, base.minCodingQuestions);
    merged.maxCodingQuestions = clampInt(tierSettings.max_coding_questions, 0, 10, base.maxCodingQuestions);
    merged.minSubjectiveQuestions = clampInt(
      tierSettings.min_subjective_questions, 0, 10, base.minSubjectiveQuestions,
    );
    merged.maxSubjectiveQuestions = clampInt(
      tierSettings.max_subjective_questions, 0, 10, base.maxSubjectiveQuestions,
    );
    merged.minMcqQuestions = clampInt(tierSettings.min_mcq_questions, 0, 10, base.minMcqQuestions);
    merged.maxMcqQuestions = clampInt(tierSettings.max_mcq_questions, 0, 10, base.maxMcqQuestions);
  }

  // Non-tech tiers: coding locked to zero regardless of settings
  if (!base.isTechnical) {
    merged.minCodingQuestions = 0;
    merged.maxCodingQuestions = 0;
  }

  return merged;
}

const TIER_LABELS: Record<AssessmentTier, string> = Object.fromEntries(
  Object.values(ASSESSMENT_PROFILES).map((p) => [p.tier, p.displayName]),
) as Record<AssessmentTier, string>;

const MAX_GENERATION_ATTEMPTS = 3;

const TECH_TITLE_KEYWORDS = [
  "engineer", "developer", "devops", "sre", "architect", "programmer", "coder",
  "software", "backend", "frontend", "fullstack", "full-stack", "data scientist",
  "ml engineer", "qa engineer", "sdet", "dba", "sysadmin", "cloud",
];

const NONTECH_TITLE_KEYWORDS = [
  "product manager", "project manager", "marketing", "sales", "hr ", "human resources",
  "recruiter", "designer", "ux ", "ui ", "content", "copywriter", "operations",
  "business analyst", "account manager", "customer success", "finance", "legal",
  "administrator", "coordinator", "executive assistant",
];

const TECH_DEPT_KEYWORDS = [
  "engineering", "development", "technology", "tech", "it ", "software", "data",
  "devops", "infrastructure", "platform", "qa", "quality assurance",
];

const NONTECH_DEPT_KEYWORDS = [
  "marketing", "sales", "hr", "human resources", "design", "product", "operations",
  "finance", "legal", "admin", "customer success", "support", "communications",
];

const TECH_JD_KEYWORDS = [
  "javascript", "typescript", "python", "java", "react", "node", "sql", "api",
  "kubernetes", "docker", "aws", "git", "algorithm", "data structure", "coding",
  "programming", "framework", "microservice", "database", "rest api", "graphql",
];

interface GeneratedQuestion {
  type: "mcq" | "coding" | "subjective";
  question_text: string;
  marks: number;
  options?: Array<{ id: string; text: string; is_correct: boolean }>;
  coding_language?: string;
  coding_starter_code?: string;
  coding_test_cases?: Array<{ input: string; expected_output: string; is_hidden: boolean }>;
  subjective_max_words?: number;
  subjective_rubric?: string;
}

interface GeneratedSection {
  title: string;
  description?: string;
  weightage: number;
  questions: GeneratedQuestion[];
}

interface GeneratedAssessment {
  title: string;
  description: string;
  duration_minutes: number;
  passing_score: number;
  sections: GeneratedSection[];
}

interface ExperienceSignal {
  minYears: number;
  maxYears: number | null;
  source: string;
}

function joinList(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map(String).join(", ");
}

function buildJobContext(job: Record<string, unknown>): string {
  const requiredSkills = joinList(job.required_skills);
  return [
    job.title && `Job Title: ${job.title}`,
    job.department && `Department: ${job.department}`,
    job.location && `Location: ${job.location}`,
    job.job_type && `Job Type: ${String(job.job_type).replace("_", " ")}`,
    job.position_type && `Position Type: ${job.position_type}`,
    job.experience_level && `Experience Level: ${job.experience_level}`,
    job.experience_years_range && `Experience Range: ${job.experience_years_range}`,
    job.description && `Description:\n${job.description}`,
    requiredSkills && `Required Skills: ${requiredSkills}`,
  ].filter(Boolean).join("\n");
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeQuestionType(raw: unknown): GeneratedQuestion["type"] {
  const t = String(raw ?? "mcq").toLowerCase().trim();
  // file_upload is builder-only — never AI-generated; coerce to subjective if model invents it
  if (t === "file_upload" || t === "file" || t === "upload") return "subjective";
  if (t === "coding" || t === "code") return "coding";
  if (t === "subjective" || t === "text" || t === "essay") return "subjective";
  return "mcq";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function textBlob(job: Record<string, unknown>): string {
  return [
    String(job.title ?? ""),
    String(job.department ?? ""),
    String(job.description ?? ""),
    joinList(job.required_skills) ?? "",
  ].join(" ").toLowerCase();
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
}

function isTechnicalRole(job: Record<string, unknown>): boolean {
  const positionType = String(job.position_type ?? "").toLowerCase();
  if (positionType === "tech") return true;
  if (positionType === "non_tech") return false;

  const blob = textBlob(job);
  const title = String(job.title ?? "").toLowerCase();
  const dept = String(job.department ?? "").toLowerCase();

  const techScore =
    countKeywordHits(title, TECH_TITLE_KEYWORDS) * 3 +
    countKeywordHits(dept, TECH_DEPT_KEYWORDS) * 2 +
    countKeywordHits(blob, TECH_JD_KEYWORDS);
  const nonTechScore =
    countKeywordHits(title, NONTECH_TITLE_KEYWORDS) * 3 +
    countKeywordHits(dept, NONTECH_DEPT_KEYWORDS) * 2;

  if (techScore > nonTechScore) return true;
  if (nonTechScore > techScore) return false;
  return techScore > 0 || countKeywordHits(blob, TECH_JD_KEYWORDS) >= 2;
}

function yearsFromRange(range: string): ExperienceSignal | null {
  const map: Record<string, ExperienceSignal> = {
    fresh: { minYears: 0, maxYears: 0, source: "experience_years_range:fresh" },
    "0_6_months": { minYears: 0, maxYears: 0.5, source: "experience_years_range:0_6_months" },
    "6_months_plus": { minYears: 0.5, maxYears: 1, source: "experience_years_range:6_months_plus" },
    "1_year_plus": { minYears: 1, maxYears: 2, source: "experience_years_range:1_year_plus" },
    "2_years_plus": { minYears: 2, maxYears: 3, source: "experience_years_range:2_years_plus" },
    "3_years_plus": { minYears: 3, maxYears: 5, source: "experience_years_range:3_years_plus" },
    "5_years_plus": { minYears: 5, maxYears: 8, source: "experience_years_range:5_years_plus" },
    "8_years_plus": { minYears: 8, maxYears: 10, source: "experience_years_range:8_years_plus" },
    "10_years_plus": { minYears: 10, maxYears: 12, source: "experience_years_range:10_years_plus" },
    "12_years_plus": { minYears: 12, maxYears: 15, source: "experience_years_range:12_years_plus" },
    "15_years_plus": { minYears: 15, maxYears: null, source: "experience_years_range:15_years_plus" },
  };
  return map[range] ?? null;
}

function yearsFromLevel(level: string): ExperienceSignal | null {
  const map: Record<string, ExperienceSignal> = {
    entry: { minYears: 0, maxYears: 2, source: "experience_level:entry" },
    mid: { minYears: 3, maxYears: 5, source: "experience_level:mid" },
    senior: { minYears: 5, maxYears: 10, source: "experience_level:senior" },
    lead: { minYears: 7, maxYears: 12, source: "experience_level:lead" },
    executive: { minYears: 10, maxYears: null, source: "experience_level:executive" },
  };
  return map[level] ?? null;
}

function yearsFromDescription(text: string): ExperienceSignal | null {
  const t = text.toLowerCase();

  const fresherPatterns = [
    /\b(fresher|freshers|intern(?:ship)?|entry[\s-]?level|graduate|final[\s-]?year|campus hire|0[\s-]?(?:to|-)[\s-]?1\s*years?)\b/,
    /\b(?:no|zero)\s+(?:prior\s+)?experience\b/,
    /\b0[\s-]?1\s*years?\b/,
  ];
  if (fresherPatterns.some((re) => re.test(t))) {
    return { minYears: 0, maxYears: 1, source: "jd:fresher" };
  }

  const seniorPatterns = [
    /\b(5\+|5\s*\+|5[\s-]?(?:to|-)[\s-]?10|6\+|7\+|8\+|10\+)\s*years?\b/,
    /\b(senior|lead|principal|staff|architect|head of)\b/,
  ];
  if (seniorPatterns.some((re) => re.test(t))) {
    return { minYears: 5, maxYears: null, source: "jd:senior" };
  }

  const midPatterns = [
    /\b(3[\s-]?(?:to|-)[\s-]?5|4[\s-]?(?:to|-)[\s-]?6)\s*years?\b/,
    /\bmid[\s-]?level\b/,
  ];
  if (midPatterns.some((re) => re.test(t))) {
    return { minYears: 3, maxYears: 5, source: "jd:mid" };
  }

  const juniorPatterns = [
    /\b(1[\s-]?(?:to|-)[\s-]?3|2[\s-]?(?:to|-)[\s-]?3|2[\s-]?(?:to|-)[\s-]?4)\s*years?\b/,
    /\bjunior\b/,
  ];
  if (juniorPatterns.some((re) => re.test(t))) {
    return { minYears: 1, maxYears: 3, source: "jd:junior" };
  }

  const rangeMatch = t.match(/\b(\d+)\s*[\s-]?(?:to|-)\s*(\d+)\s*years?\b/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { minYears: min, maxYears: max, source: "jd:range" };
    }
  }

  const plusMatch = t.match(/\b(\d+)\+\s*years?\b/);
  if (plusMatch) {
    const min = Number(plusMatch[1]);
    if (Number.isFinite(min)) {
      return { minYears: min, maxYears: null, source: "jd:plus" };
    }
  }

  const singleMatch = t.match(/\b(\d+)\s*years?\s+(?:of\s+)?experience\b/);
  if (singleMatch) {
    const min = Number(singleMatch[1]);
    if (Number.isFinite(min)) {
      return { minYears: min, maxYears: min + 1, source: "jd:single" };
    }
  }

  if (/\bintern(?:ship)?\b/.test(t)) {
    return { minYears: 0, maxYears: 0, source: "jd:intern" };
  }

  return null;
}

function mergeExperienceSignals(signals: ExperienceSignal[]): ExperienceSignal {
  if (signals.length === 0) {
    return { minYears: 1, maxYears: 3, source: "default:junior" };
  }

  const priority = (s: ExperienceSignal): number => {
    if (s.source.startsWith("experience_years_range")) return 4;
    if (s.source.startsWith("experience_level")) return 3;
    if (s.source.startsWith("jd:")) return 2;
    return 1;
  };

  const sorted = [...signals].sort((a, b) => priority(b) - priority(a));
  const primary = sorted[0];
  const minYears = Math.max(...signals.map((s) => s.minYears));
  const maxValues = signals.map((s) => s.maxYears).filter((v): v is number => v !== null);
  const maxYears = maxValues.length > 0 ? Math.min(...maxValues) : primary.maxYears;

  return { minYears, maxYears, source: primary.source };
}

function parseExperience(job: Record<string, unknown>): ExperienceSignal {
  const signals: ExperienceSignal[] = [];

  const range = String(job.experience_years_range ?? "").trim();
  if (range) {
    const fromRange = yearsFromRange(range);
    if (fromRange) signals.push(fromRange);
  }

  const level = String(job.experience_level ?? "").trim();
  if (level) {
    const fromLevel = yearsFromLevel(level);
    if (fromLevel) signals.push(fromLevel);
  }

  const jobType = String(job.job_type ?? "").toLowerCase();
  if (jobType === "internship") {
    signals.push({ minYears: 0, maxYears: 0, source: "job_type:internship" });
  }

  const fromDesc = yearsFromDescription(textBlob(job));
  if (fromDesc) signals.push(fromDesc);

  return mergeExperienceSignals(signals);
}

function detectTier(
  job: Record<string, unknown>,
  generationSettings: AssessmentGenerationSettings | null,
): {
  tier: AssessmentTier;
  profile: GenerationProfile;
  isTechnical: boolean;
  experience: ExperienceSignal;
} {
  const isTechnical = isTechnicalRole(job);
  const experience = parseExperience(job);
  const { minYears } = experience;

  let tier: AssessmentTier;
  if (isTechnical) {
    if (minYears < 1) tier = "tech_fresher";
    else if (minYears < 3) tier = "tech_junior";
    else if (minYears < 5) tier = "tech_mid";
    else tier = "tech_senior";
  } else if (minYears < 2) {
    tier = "nontech_fresher";
  } else {
    tier = "nontech_experienced";
  }

  const baseProfile = ASSESSMENT_PROFILES[tier];
  const profile = mergeProfileWithSettings(baseProfile, generationSettings, tier);

  return { tier, profile, isTechnical, experience };
}

function extractSectionQuestions(section: Record<string, unknown>): unknown[] {
  const candidates = [section.questions, section.question_list, section.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  const single = section.question;
  if (single) return [single];
  return [];
}

function normalizeMcqOptions(raw: unknown): GeneratedQuestion["options"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { id: "a", text: "Option A", is_correct: true },
      { id: "b", text: "Option B", is_correct: false },
      { id: "c", text: "Option C", is_correct: false },
      { id: "d", text: "Option D", is_correct: false },
    ];
  }

  const options = raw.map((opt, index) => {
    const row = asRecord(opt);
    if (!row) {
      return { id: String(index), text: String(opt), is_correct: index === 0 };
    }
    return {
      id: String(row.id ?? String.fromCharCode(97 + index)),
      text: String(row.text ?? row.label ?? row.option ?? `Option ${index + 1}`),
      is_correct: Boolean(row.is_correct ?? row.correct ?? row.isCorrect),
    };
  });

  const correctCount = options.filter((o) => o.is_correct).length;
  if (correctCount !== 1) {
    options.forEach((o, i) => { o.is_correct = i === 0; });
  }

  while (options.length < 4) {
    const id = String.fromCharCode(97 + options.length);
    options.push({ id, text: `Option ${id.toUpperCase()}`, is_correct: false });
  }

  return options.slice(0, 6);
}

function normalizeTestCases(raw: unknown): GeneratedQuestion["coding_test_cases"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { input: "sample input", expected_output: "sample output", is_hidden: false },
      { input: "edge case input", expected_output: "edge case output", is_hidden: false },
    ];
  }

  const cases = raw.map((tc) => {
    const row = asRecord(tc);
    if (!row) return { input: "", expected_output: "", is_hidden: false };
    return {
      input: String(row.input ?? ""),
      expected_output: String(row.expected_output ?? row.output ?? row.expected ?? ""),
      is_hidden: Boolean(row.is_hidden ?? row.hidden),
    };
  }).filter((tc) => tc.input.length > 0 || tc.expected_output.length > 0);

  if (cases.length < 2) {
    cases.push(
      { input: "sample input", expected_output: "sample output", is_hidden: false },
      { input: "edge case input", expected_output: "edge case output", is_hidden: false },
    );
  }

  return cases.slice(0, 8).map((tc) => ({ ...tc, is_hidden: false }));
}

function defaultMarks(type: GeneratedQuestion["type"], profile: GenerationProfile): number {
  return profile.marks[type];
}

function normalizeQuestion(
  raw: unknown,
  index: number,
  profile: GenerationProfile,
): GeneratedQuestion | null {
  const row = asRecord(raw);
  if (!row) return null;

  let type = normalizeQuestionType(row.type);
  if (!profile.isTechnical && type === "coding") type = "subjective";

  const questionText = String(
    row.question_text ?? row.text ?? row.question ?? row.prompt ?? "",
  ).trim();
  if (!questionText) return null;

  const question: GeneratedQuestion = {
    type,
    question_text: questionText,
    marks: clampInt(row.marks, 1, 20, defaultMarks(type, profile)),
  };

  if (type === "mcq") {
    question.options = normalizeMcqOptions(row.options ?? row.choices ?? row.answers);
    question.marks = profile.marks.mcq;
  } else if (type === "coding") {
    question.coding_language = String(row.coding_language ?? row.language ?? "javascript");
    question.coding_starter_code = String(
      row.coding_starter_code ?? row.starter_code ?? row.template ?? "// Write your solution here\n",
    );
    question.coding_test_cases = normalizeTestCases(row.coding_test_cases ?? row.test_cases);
    question.marks = profile.marks.coding;
  } else {
    question.subjective_max_words = clampInt(row.subjective_max_words ?? row.max_words, 50, 2000, 500);
    question.subjective_rubric = String(
      row.subjective_rubric ?? row.rubric ?? "Evaluate clarity, relevance, and depth of the response.",
    );
    question.marks = profile.marks.subjective;
  }

  if (!question.question_text) {
    question.question_text = `Question ${index + 1}`;
  }

  return question;
}

function normalizeSection(
  raw: unknown,
  index: number,
  profile: GenerationProfile,
): GeneratedSection | null {
  const row = asRecord(raw);
  if (!row) return null;

  const questions = extractSectionQuestions(row)
    .map((q, qIdx) => normalizeQuestion(q, qIdx, profile))
    .filter((q): q is GeneratedQuestion => q !== null);

  return {
    title: String(row.title ?? row.name ?? profile.sectionTitles[index] ?? `Section ${index + 1}`).trim(),
    description: row.description ? String(row.description).trim() : undefined,
    weightage: clampInt(row.weightage ?? row.weight, 1, 100, 0),
    questions,
  };
}

function convertQuestionType(
  q: GeneratedQuestion,
  target: GeneratedQuestion["type"],
  profile: GenerationProfile,
): GeneratedQuestion {
  if (q.type === target) return q;

  const base = { ...q, type: target, marks: defaultMarks(target, profile) };
  if (target === "mcq") {
    return { ...base, options: normalizeMcqOptions(q.options) };
  }
  if (target === "coding") {
    return {
      ...base,
      coding_language: q.coding_language ?? "javascript",
      coding_starter_code: q.coding_starter_code ?? "// Write your solution here\n",
      coding_test_cases: normalizeTestCases(q.coding_test_cases),
    };
  }
  return {
    ...base,
    subjective_max_words: q.subjective_max_words ?? 500,
    subjective_rubric: q.subjective_rubric ?? "Evaluate clarity, relevance, and depth of the response.",
  };
}

function countByType(questions: GeneratedQuestion[]): Record<GeneratedQuestion["type"], number> {
  return questions.reduce(
    (acc, q) => {
      acc[q.type] += 1;
      return acc;
    },
    { mcq: 0, coding: 0, subjective: 0 },
  );
}

function balanceQuestionTypes(
  questions: GeneratedQuestion[],
  profile: GenerationProfile,
): GeneratedQuestion[] {
  const required = profile.sectionCount * profile.questionsPerSection;
  const balanced = [...questions.slice(0, required)];

  while (balanced.length < required) {
    balanced.push({
      type: "mcq",
      question_text: `Placeholder question ${balanced.length + 1}`,
      marks: profile.marks.mcq,
      options: normalizeMcqOptions(null),
    });
  }

  const enforceMax = (type: GeneratedQuestion["type"], max: number, fallback: GeneratedQuestion["type"]) => {
    const counts = countByType(balanced);
    let excess = counts[type] - max;
    if (excess <= 0) return;
    for (let i = balanced.length - 1; i >= 0 && excess > 0; i--) {
      if (balanced[i].type !== type) continue;
      const countsAfter = countByType(balanced);
      if (countsAfter[fallback] >= (fallback === "mcq" ? profile.maxMcqQuestions : profile.maxSubjectiveQuestions)) {
        continue;
      }
      balanced[i] = convertQuestionType(balanced[i], fallback, profile);
      excess -= 1;
    }
  };

  enforceMax("coding", profile.maxCodingQuestions, profile.isTechnical ? "subjective" : "subjective");
  enforceMax("subjective", profile.maxSubjectiveQuestions, "mcq");
  enforceMax("mcq", profile.maxMcqQuestions, "subjective");

  const enforceMin = (type: GeneratedQuestion["type"], min: number, donor: GeneratedQuestion["type"]) => {
    const counts = countByType(balanced);
    let deficit = min - counts[type];
    if (deficit <= 0) return;
    for (let i = 0; i < balanced.length && deficit > 0; i++) {
      if (balanced[i].type !== donor) continue;
      const countsAfter = countByType(balanced);
      if (type === "coding" && countsAfter.coding >= profile.maxCodingQuestions) continue;
      if (type === "subjective" && countsAfter.subjective >= profile.maxSubjectiveQuestions) continue;
      if (type === "mcq" && countsAfter.mcq >= profile.maxMcqQuestions) continue;
      balanced[i] = convertQuestionType(balanced[i], type, profile);
      deficit -= 1;
    }
  };

  if (profile.isTechnical) {
    enforceMin("coding", profile.minCodingQuestions, "mcq");
    enforceMin("coding", profile.minCodingQuestions, "subjective");
  } else {
    for (let i = 0; i < balanced.length; i++) {
      if (balanced[i].type === "coding") {
        balanced[i] = convertQuestionType(balanced[i], "subjective", profile);
      }
    }
  }
  enforceMin("subjective", profile.minSubjectiveQuestions, "mcq");
  enforceMin("mcq", profile.minMcqQuestions, "subjective");

  return balanced;
}

function redistributeToSpec(
  raw: GeneratedAssessment,
  profile: GenerationProfile,
): GeneratedAssessment {
  const flatQuestions = balanceQuestionTypes(
    raw.sections.flatMap((section) => section.questions),
    profile,
  );

  const required = profile.sectionCount * profile.questionsPerSection;
  if (flatQuestions.length < required) {
    throw new Error(`AI returned only ${flatQuestions.length} questions; need ${required}`);
  }

  const sections: GeneratedSection[] = [];
  let questionOffset = 0;

  for (let sIdx = 0; sIdx < profile.sectionCount; sIdx++) {
    const sourceSection = raw.sections[sIdx];
    const questions = flatQuestions.slice(
      questionOffset,
      questionOffset + profile.questionsPerSection,
    );
    questionOffset += profile.questionsPerSection;

    const weightage = sIdx === profile.sectionCount - 1
      ? 100 - sections.reduce((sum, s) => sum + s.weightage, 0)
      : Math.floor(100 / profile.sectionCount);

    sections.push({
      title: sourceSection?.title?.trim() || profile.sectionTitles[sIdx],
      description: sourceSection?.description,
      weightage: weightage > 0 ? weightage : 34,
      questions,
    });
  }

  return {
    title: raw.title?.trim() || "Job Assessment",
    description: raw.description?.trim() || "",
    duration_minutes: profile.durationMinutes,
    passing_score: profile.passingScore,
    sections,
  };
}

function validateAssessment(assessment: GeneratedAssessment, profile: GenerationProfile): void {
  if (assessment.sections.length !== profile.sectionCount) {
    throw new Error(`Expected ${profile.sectionCount} sections`);
  }

  if (assessment.duration_minutes !== profile.durationMinutes) {
    throw new Error(`Expected duration ${profile.durationMinutes} minutes`);
  }
  if (assessment.passing_score !== profile.passingScore) {
    throw new Error(`Expected passing score ${profile.passingScore}%`);
  }

  const allQuestions = assessment.sections.flatMap((s) => s.questions);
  const counts = countByType(allQuestions);

  if (counts.coding < profile.minCodingQuestions || counts.coding > profile.maxCodingQuestions) {
    throw new Error(
      `Expected ${profile.minCodingQuestions}-${profile.maxCodingQuestions} coding questions; got ${counts.coding}`,
    );
  }
  if (counts.subjective < profile.minSubjectiveQuestions || counts.subjective > profile.maxSubjectiveQuestions) {
    throw new Error(
      `Expected ${profile.minSubjectiveQuestions}-${profile.maxSubjectiveQuestions} subjective questions; got ${counts.subjective}`,
    );
  }
  if (counts.mcq < profile.minMcqQuestions || counts.mcq > profile.maxMcqQuestions) {
    throw new Error(
      `Expected ${profile.minMcqQuestions}-${profile.maxMcqQuestions} MCQ questions; got ${counts.mcq}`,
    );
  }

  for (let sIdx = 0; sIdx < assessment.sections.length; sIdx++) {
    const section = assessment.sections[sIdx];
    if (!section.title.trim()) {
      throw new Error(`Section ${sIdx + 1} is missing a title`);
    }
    if (section.questions.length !== profile.questionsPerSection) {
      throw new Error(
        `Section ${sIdx + 1} has ${section.questions.length} questions; expected ${profile.questionsPerSection}`,
      );
    }
    for (const question of section.questions) {
      if (!question.question_text.trim()) {
        throw new Error(`Section ${sIdx + 1} has an empty question`);
      }
      if (question.type === "mcq" && (!question.options || question.options.length < 2)) {
        throw new Error(`Section ${sIdx + 1} has an MCQ without options`);
      }
      if (question.type === "coding" && (!question.coding_test_cases || question.coding_test_cases.length < 2)) {
        throw new Error(`Section ${sIdx + 1} has a coding question without test cases`);
      }
    }
  }
}

function parseAndNormalizeAssessment(content: string, profile: GenerationProfile): GeneratedAssessment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned malformed assessment JSON");
  }

  const root = asRecord(parsed);
  if (!root) throw new Error("AI response was not a JSON object");

  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  if (rawSections.length === 0) throw new Error("No sections returned");

  const sections = rawSections
    .map((section, index) => normalizeSection(section, index, profile))
    .filter((section): section is GeneratedSection => section !== null);

  if (sections.length === 0) throw new Error("No valid sections returned");

  const normalized = redistributeToSpec({
    title: String(root.title ?? "Job Assessment"),
    description: String(root.description ?? ""),
    duration_minutes: clampInt(root.duration_minutes, 15, 180, profile.durationMinutes),
    passing_score: clampInt(root.passing_score, 40, 90, profile.passingScore),
    sections,
  }, profile);

  validateAssessment(normalized, profile);
  return normalized;
}

function buildSystemPrompt(profile: GenerationProfile): string {
  const { sectionCount, questionsPerSection, sectionTitles, marks } = profile;
  const totalQuestions = sectionCount * questionsPerSection;

  const typeBreakdown = profile.isTechnical
    ? `- Coding: ${profile.minCodingQuestions} to ${profile.maxCodingQuestions} questions (${marks.coding} marks each)
- Subjective/scenario: ${profile.minSubjectiveQuestions} to ${profile.maxSubjectiveQuestions} questions (${marks.subjective} marks each)
- MCQ: ${profile.minMcqQuestions} to ${profile.maxMcqQuestions} questions (${marks.mcq} marks each)`
    : `- Subjective/scenario/situational: ${profile.minSubjectiveQuestions} to ${profile.maxSubjectiveQuestions} questions (${marks.subjective} marks each)
- MCQ: ${profile.minMcqQuestions} to ${profile.maxMcqQuestions} questions (${marks.mcq} marks each)
- NO coding questions`;

  return `You are an expert recruiter at SparxIT. Generate a practical hiring assessment draft tailored to the job described.

ASSESSMENT PROFILE: ${profile.displayName}
${profile.focusGuidance}
${profile.codingGuidance}

STRICT OUTPUT REQUIREMENTS (must follow exactly):
- Exactly ${sectionCount} sections with titles similar to: ${sectionTitles.join(", ")}
- Exactly ${questionsPerSection} questions in EACH section (${totalQuestions} questions total)
${typeBreakdown}
- Question type must be exactly "mcq", "coding", or "subjective" (lowercase). Never use "file_upload" (manual builder-only type).
- MCQ: options [{ "id": "a"|"b"|"c"|"d", "text": string, "is_correct": boolean }] with exactly one is_correct=true
- Coding: coding_language, coding_starter_code, coding_test_cases with at least 2 entries (is_hidden=false)
- Subjective: subjective_max_words (default 500), subjective_rubric
- Do NOT generate file upload / attachment questions
- duration_minutes: ${profile.durationMinutes} (fixed)
- passing_score: ${profile.passingScore} (fixed)
- weightage per section should sum to 100
- Questions must be specific to the job description skills and responsibilities

Return ONLY valid JSON:
{
  "title": string,
  "description": string,
  "duration_minutes": number,
  "passing_score": number,
  "sections": [
    {
      "title": string,
      "description": string,
      "weightage": number,
      "questions": [
        {
          "type": "mcq"|"coding"|"subjective",
          "question_text": string,
          "marks": number,
          "options": [...],
          "coding_language": string,
          "coding_starter_code": string,
          "coding_test_cases": [...],
          "subjective_max_words": number,
          "subjective_rubric": string
        }
      ]
    }
  ]
}`;
}

async function callGemini(
  apiKey: string,
  jobContext: string,
  profile: GenerationProfile,
  attempt: number,
): Promise<string> {
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const retryHint = attempt > 1
    ? `\n\nPrevious attempt was incomplete. You MUST return exactly ${profile.sectionCount} sections with exactly ${profile.questionsPerSection} questions in each section, matching the ${profile.displayName} profile type counts.`
    : "";

  const aiRes = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(profile) },
          {
            role: "user",
            content: `--- JOB DESCRIPTION ---\n${jobContext}${retryHint}\n\nGenerate the assessment JSON for profile: ${profile.tier}.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!aiRes.ok) {
    const errorText = await aiRes.text();
    let reason = `HTTP ${aiRes.status}`;
    try {
      const errJson = JSON.parse(errorText);
      const msg = errJson?.error?.message ?? errJson?.message ?? errJson?.error;
      if (msg) reason = typeof msg === "string" ? msg : String(msg);
    } catch {
      if (errorText.length < 200) reason = errorText;
    }
    throw new Error(`Gemini API error: ${reason}`);
  }

  const aiResult = await aiRes.json();
  const content = aiResult.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI did not return assessment data");
  }
  return content;
}

async function generateAssessmentWithGemini(
  apiKey: string,
  jobContext: string,
  profile: GenerationProfile,
): Promise<GeneratedAssessment> {
  let lastError = "AI returned incomplete assessment";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      const content = await callGemini(apiKey, jobContext, profile, attempt);
      return parseAndNormalizeAssessment(content, profile);
    } catch (e) {
      lastError = errorMessage(e);
      console.warn(`generate-assessment attempt ${attempt} failed:`, lastError);
    }
  }

  throw new Error(lastError);
}

async function cleanupAssessment(supabase: ReturnType<typeof createClient>, assessmentId: string) {
  await supabase.from("assessments").delete().eq("id", assessmentId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let createdAssessmentId: string | null = null;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const auth = await requireStaff(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { job_id } = body as { job_id?: string };

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        id, title, description, department, location, job_type,
        experience_level, experience_years_range, position_type, required_skills
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      return new Response(JSON.stringify({ error: "Gemini API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: genSettingsRow } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "assessment_generation_settings")
      .maybeSingle();

    const generationSettings = (genSettingsRow?.config_value ?? null) as AssessmentGenerationSettings | null;

    const jobRecord = job as Record<string, unknown>;
    const { tier, profile, isTechnical, experience } = detectTier(jobRecord, generationSettings);

    const generated = await generateAssessmentWithGemini(
      GOOGLE_AI_API_KEY,
      buildJobContext(jobRecord),
      profile,
    );

    const jobTitle = String(jobRecord.title ?? "Job");

    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .insert({
        title: generated.title?.trim() || `${jobTitle} Assessment`,
        description: generated.description?.trim() || null,
        duration_minutes: generated.duration_minutes,
        passing_score: generated.passing_score,
        status: "draft",
        source_job_id: job_id,
        ai_generated: true,
        created_by: auth.userId,
        settings: {
          randomize_questions: false,
          show_score_immediately: false,
          allow_review: false,
          generation_tier: tier,
        },
      })
      .select("id, title, status, source_job_id, ai_generated")
      .single();

    if (assessmentError || !assessment) {
      throw new Error(assessmentError?.message ?? "Failed to create assessment");
    }

    createdAssessmentId = assessment.id;

    for (let sIdx = 0; sIdx < generated.sections.length; sIdx++) {
      const section = generated.sections[sIdx];
      const { data: sectionRow, error: sectionError } = await supabase
        .from("assessment_sections")
        .insert({
          assessment_id: assessment.id,
          title: section.title?.trim() || `Section ${sIdx + 1}`,
          description: section.description?.trim() || null,
          order_index: sIdx,
          weightage: clampInt(section.weightage, 1, 100, Math.floor(100 / profile.sectionCount)),
        })
        .select("id")
        .single();

      if (sectionError || !sectionRow) {
        throw new Error(sectionError?.message ?? "Failed to create section");
      }

      for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
        const q = section.questions[qIdx];
        const questionType = q.type;
        const correctIds = questionType === "mcq"
          ? (q.options?.filter((o) => o.is_correct).map((o) => o.id) ?? [])
          : [];

        const { error: questionError } = await supabase.from("questions").insert({
          section_id: sectionRow.id,
          type: questionType,
          question_text: q.question_text.trim(),
          marks: q.marks,
          order_index: qIdx,
          options: questionType === "mcq" ? q.options ?? [] : null,
          correct_answer: correctIds.length ? correctIds : null,
          coding_language: questionType === "coding" ? (q.coding_language ?? null) : null,
          coding_starter_code: questionType === "coding" ? (q.coding_starter_code ?? null) : null,
          coding_test_cases: questionType === "coding" ? (q.coding_test_cases ?? null) : null,
          subjective_max_words: questionType === "subjective"
            ? clampInt(q.subjective_max_words, 50, 2000, 500)
            : null,
          subjective_rubric: questionType === "subjective" ? (q.subjective_rubric ?? null) : null,
        });

        if (questionError) throw new Error(questionError.message);
      }
    }

    const { error: jobUpdateError } = await supabase
      .from("jobs")
      .update({ default_assessment_id: assessment.id, assessment_enabled: true })
      .eq("id", job_id);

    if (jobUpdateError) throw new Error(jobUpdateError.message);

    const totalQuestions = generated.sections.reduce((sum, s) => sum + s.questions.length, 0);
    const totalMarks = generated.sections.reduce(
      (sum, s) => sum + s.questions.reduce((qSum, q) => qSum + q.marks, 0),
      0,
    );
    const typeCounts = countByType(generated.sections.flatMap((s) => s.questions));

    return new Response(
      JSON.stringify({
        success: true,
        assessment,
        tier: {
          id: tier,
          label: TIER_LABELS[tier],
          is_technical: isTechnical,
          experience_source: experience.source,
        },
        stats: {
          sections: generated.sections.length,
          questions: totalQuestions,
          marks: totalMarks,
          duration_minutes: generated.duration_minutes,
          passing_score: generated.passing_score,
          coding: typeCounts.coding,
          subjective: typeCounts.subjective,
          mcq: typeCounts.mcq,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (createdAssessmentId) {
      await cleanupAssessment(supabase, createdAssessmentId);
    }
    console.error("generate-assessment error:", e);
    return new Response(
      JSON.stringify({ error: errorMessage(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
