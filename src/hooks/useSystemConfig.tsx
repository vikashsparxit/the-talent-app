import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type AssessmentTier,
  assessmentTierLabels,
  ASSESSMENT_TIERS,
  isNonTechAssessmentTier,
} from '@/lib/assessment-tiers';
import {
  EMPTY_SOCIAL_DRAFTS_HISTORY,
  EMPTY_SOCIAL_DRAFTS_LATEST,
} from '@/lib/socialDrafts';

export interface CertTierEntry {
  tier: number;
  category: string;
  skill_upgrade: string;
}

export interface SystemConfigRow {
  id: string;
  config_key: string;
  config_value: any;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessBranding {
  logo_desktop_url: string | null;
  logo_mobile_url: string | null;
  company_name: string | null;
  primary_color: string;
  primary_foreground_color: string;
}

export interface EmailSettings {
  enabled: boolean;
  from_address: string;
  reply_to: string;
  daily_quota: number;
  monthly_quota: number;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  enabled: true,
  from_address: 'system@thetalentapp.io',
  reply_to: 'system@thetalentapp.io',
  daily_quota: 100,
  monthly_quota: 3000,
};

export type EmailNotificationKey =
  | 'candidate_hired_staff'
  | 'candidate_hired_applicant'
  | 'candidate_rejected'
  | 'chitra_warning'
  | 'chitra_praise'
  | 'chitra_daily_report'
  | 'chitra_weekly_report'
  | 'interview_scheduled'
  | 'assignment_completed';

export type EmailNotificationSettings = Record<EmailNotificationKey, boolean>;

export const DEFAULT_EMAIL_NOTIFICATION_SETTINGS: EmailNotificationSettings = {
  candidate_hired_staff: true,
  candidate_hired_applicant: true,
  candidate_rejected: true,
  chitra_warning: true,
  chitra_praise: true,
  chitra_daily_report: true,
  chitra_weekly_report: true,
  interview_scheduled: true,
  assignment_completed: true,
};

export const EMAIL_NOTIFICATION_LABELS: Record<EmailNotificationKey, { label: string; description: string }> = {
  candidate_hired_staff: {
    label: 'Candidate hired (staff)',
    description: 'Notify HR and admin when a candidate is marked hired.',
  },
  candidate_hired_applicant: {
    label: 'Candidate hired (applicant)',
    description: 'Send next-steps email to the applicant (documentation, BGV, pre-onboarding).',
  },
  candidate_rejected: {
    label: 'Rejection',
    description: 'Send rejection email to candidates/applicants with feedback when provided.',
  },
  chitra_warning: {
    label: 'Chitragupta warning',
    description: 'Email interviewers who receive a formal Chitragupta warning.',
  },
  chitra_praise: {
    label: 'Chitragupta appreciation',
    description: 'Email interviewers and recruiters when Chitragupta sends praise.',
  },
  chitra_daily_report: {
    label: 'Chitra daily report',
    description: 'Email the super admin the daily executive brief.',
  },
  chitra_weekly_report: {
    label: 'Chitra weekly report',
    description: 'Email the super admin the weekly pipeline report.',
  },
  interview_scheduled: {
    label: 'Interview scheduled',
    description: 'Notify interviewers, panelists, and recruiters when an interview is scheduled.',
  },
  assignment_completed: {
    label: 'Assignment completed',
    description: 'Notify recruiters when a candidate completes an assigned assessment.',
  },
};

export const DEFAULT_BUSINESS_BRANDING: BusinessBranding = {
  logo_desktop_url: null,
  logo_mobile_url: null,
  company_name: null,
  primary_color: '#D64541',
  primary_foreground_color: '#FFFFFF',
};

export interface AssessmentOrgDefaults {
  deadline_days: number;
  default_pass_threshold: number | null;
  require_pass_before_interview: boolean;
  notify_recruiter_on_complete: boolean;
}

export const DEFAULT_ASSESSMENT_ORG_DEFAULTS: AssessmentOrgDefaults = {
  deadline_days: 7,
  default_pass_threshold: null,
  require_pass_before_interview: true,
  notify_recruiter_on_complete: true,
};

export interface AssessmentGenerationMarks {
  mcq: number;
  coding: number;
  subjective: number;
}

export interface AssessmentGenerationGlobal {
  section_count: number;
  questions_per_section: number;
  marks: AssessmentGenerationMarks;
}

export interface AssessmentTierGenerationSettings {
  duration_minutes: number;
  passing_score: number;
  min_coding_questions: number;
  max_coding_questions: number;
  min_subjective_questions: number;
  max_subjective_questions: number;
  min_mcq_questions: number;
  max_mcq_questions: number;
}

export interface AssessmentGenerationSettings {
  global: AssessmentGenerationGlobal;
  tiers: Record<AssessmentTier, AssessmentTierGenerationSettings>;
}

const DEFAULT_TIER_GENERATION_SETTINGS: Record<AssessmentTier, AssessmentTierGenerationSettings> = {
  tech_fresher: {
    duration_minutes: 60,
    passing_score: 60,
    min_coding_questions: 2,
    max_coding_questions: 3,
    min_subjective_questions: 1,
    max_subjective_questions: 2,
    min_mcq_questions: 1,
    max_mcq_questions: 2,
  },
  tech_junior: {
    duration_minutes: 75,
    passing_score: 60,
    min_coding_questions: 3,
    max_coding_questions: 3,
    min_subjective_questions: 1,
    max_subjective_questions: 2,
    min_mcq_questions: 1,
    max_mcq_questions: 2,
  },
  tech_mid: {
    duration_minutes: 90,
    passing_score: 65,
    min_coding_questions: 3,
    max_coding_questions: 3,
    min_subjective_questions: 2,
    max_subjective_questions: 2,
    min_mcq_questions: 1,
    max_mcq_questions: 1,
  },
  tech_senior: {
    duration_minutes: 90,
    passing_score: 70,
    min_coding_questions: 2,
    max_coding_questions: 3,
    min_subjective_questions: 2,
    max_subjective_questions: 3,
    min_mcq_questions: 1,
    max_mcq_questions: 2,
  },
  nontech_fresher: {
    duration_minutes: 60,
    passing_score: 60,
    min_coding_questions: 0,
    max_coding_questions: 0,
    min_subjective_questions: 2,
    max_subjective_questions: 4,
    min_mcq_questions: 2,
    max_mcq_questions: 4,
  },
  nontech_experienced: {
    duration_minutes: 75,
    passing_score: 65,
    min_coding_questions: 0,
    max_coding_questions: 0,
    min_subjective_questions: 3,
    max_subjective_questions: 5,
    min_mcq_questions: 1,
    max_mcq_questions: 2,
  },
};

export const DEFAULT_ASSESSMENT_GENERATION_SETTINGS: AssessmentGenerationSettings = {
  global: {
    section_count: 3,
    questions_per_section: 2,
    marks: { mcq: 5, coding: 10, subjective: 10 },
  },
  tiers: DEFAULT_TIER_GENERATION_SETTINGS,
};

export function parseAssessmentOrgDefaults(raw: unknown): AssessmentOrgDefaults {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ASSESSMENT_ORG_DEFAULTS };
  }
  const c = raw as Record<string, unknown>;
  return {
    deadline_days: typeof c.deadline_days === 'number' ? c.deadline_days : DEFAULT_ASSESSMENT_ORG_DEFAULTS.deadline_days,
    default_pass_threshold:
      typeof c.default_pass_threshold === 'number' ? c.default_pass_threshold : null,
    require_pass_before_interview: c.require_pass_before_interview !== false,
    notify_recruiter_on_complete: c.notify_recruiter_on_complete !== false,
  };
}

function parseTierGenerationSettings(
  raw: unknown,
  tier: AssessmentTier,
): AssessmentTierGenerationSettings {
  const defaults = DEFAULT_TIER_GENERATION_SETTINGS[tier];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults };
  const c = raw as Record<string, unknown>;
  const minCoding = isNonTechAssessmentTier(tier)
    ? 0
    : typeof c.min_coding_questions === 'number' ? c.min_coding_questions : defaults.min_coding_questions;
  const maxCoding = isNonTechAssessmentTier(tier)
    ? 0
    : typeof c.max_coding_questions === 'number' ? c.max_coding_questions : defaults.max_coding_questions;
  return {
    duration_minutes:
      typeof c.duration_minutes === 'number' ? c.duration_minutes : defaults.duration_minutes,
    passing_score: typeof c.passing_score === 'number' ? c.passing_score : defaults.passing_score,
    min_coding_questions: minCoding,
    max_coding_questions: maxCoding,
    min_subjective_questions:
      typeof c.min_subjective_questions === 'number'
        ? c.min_subjective_questions
        : defaults.min_subjective_questions,
    max_subjective_questions:
      typeof c.max_subjective_questions === 'number'
        ? c.max_subjective_questions
        : defaults.max_subjective_questions,
    min_mcq_questions:
      typeof c.min_mcq_questions === 'number' ? c.min_mcq_questions : defaults.min_mcq_questions,
    max_mcq_questions:
      typeof c.max_mcq_questions === 'number' ? c.max_mcq_questions : defaults.max_mcq_questions,
  };
}

export function parseAssessmentGenerationSettings(raw: unknown): AssessmentGenerationSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      global: { ...DEFAULT_ASSESSMENT_GENERATION_SETTINGS.global, marks: { ...DEFAULT_ASSESSMENT_GENERATION_SETTINGS.global.marks } },
      tiers: { ...DEFAULT_TIER_GENERATION_SETTINGS },
    };
  }
  const c = raw as Record<string, unknown>;
  const globalRaw = c.global;
  const globalDefaults = DEFAULT_ASSESSMENT_GENERATION_SETTINGS.global;
  let global: AssessmentGenerationGlobal = { ...globalDefaults, marks: { ...globalDefaults.marks } };
  if (globalRaw && typeof globalRaw === 'object' && !Array.isArray(globalRaw)) {
    const g = globalRaw as Record<string, unknown>;
    const marksRaw = g.marks;
    global = {
      section_count:
        typeof g.section_count === 'number' ? g.section_count : globalDefaults.section_count,
      questions_per_section:
        typeof g.questions_per_section === 'number'
          ? g.questions_per_section
          : globalDefaults.questions_per_section,
      marks: { ...globalDefaults.marks },
    };
    if (marksRaw && typeof marksRaw === 'object' && !Array.isArray(marksRaw)) {
      const m = marksRaw as Record<string, unknown>;
      global.marks = {
        mcq: typeof m.mcq === 'number' ? m.mcq : globalDefaults.marks.mcq,
        coding: typeof m.coding === 'number' ? m.coding : globalDefaults.marks.coding,
        subjective: typeof m.subjective === 'number' ? m.subjective : globalDefaults.marks.subjective,
      };
    }
  }

  const tiersRaw = c.tiers;
  const tiers = { ...DEFAULT_TIER_GENERATION_SETTINGS };
  if (tiersRaw && typeof tiersRaw === 'object' && !Array.isArray(tiersRaw)) {
    for (const tier of ASSESSMENT_TIERS) {
      tiers[tier] = parseTierGenerationSettings(
        (tiersRaw as Record<string, unknown>)[tier],
        tier,
      );
    }
  }

  return { global, tiers };
}

export { assessmentTierLabels, ASSESSMENT_TIERS, isNonTechAssessmentTier };

export function useBusinessBranding() {
  const { configValue, isLoading, update, updateAsync, isUpdating } = useSystemConfig('business_branding');
  const raw = configValue as Partial<BusinessBranding> | undefined;
  const branding: BusinessBranding = {
    ...DEFAULT_BUSINESS_BRANDING,
    ...raw,
    primary_color: raw?.primary_color ?? DEFAULT_BUSINESS_BRANDING.primary_color,
    primary_foreground_color:
      raw?.primary_foreground_color ?? DEFAULT_BUSINESS_BRANDING.primary_foreground_color,
  };
  return { branding, isLoading, update, updateAsync, isUpdating };
}

export function useAssessmentOrgDefaults() {
  const { configValue, isLoading, update, updateAsync, isUpdating } = useSystemConfig('assessment_org_defaults');
  const orgDefaults = parseAssessmentOrgDefaults(configValue);
  return { orgDefaults, isLoading, update, updateAsync, isUpdating };
}

export function useAssessmentGenerationSettings() {
  const { configValue, isLoading, update, updateAsync, isUpdating } = useSystemConfig('assessment_generation_settings');
  const generationSettings = parseAssessmentGenerationSettings(configValue);
  return { generationSettings, isLoading, update, updateAsync, isUpdating };
}

export function useSystemConfig(configKey: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['system_config', configKey],
    enabled: options?.enabled !== false,
    staleTime: configKey === 'business_branding' ? 0 : 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Request only config_value to avoid proxy/API stripping or omitting large JSON
      const { data, error } = await supabase
        .from('system_config' as any)
        .select('config_value')
        .eq('config_key', configKey)
        .maybeSingle();
      if (error) throw error;
      const row = data as { config_value?: unknown } | null;
      const config_value = row?.config_value;

      // For different keys, config_value shapes are:
      // - 'cert_tiers'      → object map (key → { tier, category, skill_upgrade })
      // - 'tier1_colleges'  → string[]
      // - 'job_domains'     → string[]
      // - 'job_teams'       → string[]
      let normalized: unknown;
      if (config_value == null) {
        normalized = configKey === 'cert_tiers' ? {} : configKey === 'business_branding'
          ? { ...DEFAULT_BUSINESS_BRANDING }
          : configKey === 'email_settings'
            ? { ...DEFAULT_EMAIL_SETTINGS }
          : configKey === 'email_notification_settings'
            ? { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS }
          : configKey === 'assessment_org_defaults'
            ? { ...DEFAULT_ASSESSMENT_ORG_DEFAULTS }
          : configKey === 'assessment_generation_settings'
            ? parseAssessmentGenerationSettings(null)
          : configKey === 'chitra_social_drafts_latest'
            ? { ...EMPTY_SOCIAL_DRAFTS_LATEST, pillars: [], drafts: [] }
          : configKey === 'chitra_social_drafts_history'
            ? { ...EMPTY_SOCIAL_DRAFTS_HISTORY, entries: [] }
          : [];
      } else {
        normalized = config_value;
      }

      return { config_value: normalized } as unknown as SystemConfigRow;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (newValue: unknown) => {
      const { data, error } = await supabase
        .from('system_config' as any)
        .upsert(
          { config_key: configKey, config_value: newValue } as any,
          { onConflict: 'config_key' },
        )
        .select('config_key')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Save failed — no row returned. Check admin permissions.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['system_config', configKey] });
      toast.success('Configuration updated successfully');
    },
    onError: (err: Error) => {
      toast.error('Failed to update: ' + err.message);
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    configValue: query.data?.config_value,
    update: updateMutation.mutate,
    updateAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

export function useReScoreCandidates() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('rescore-candidates');
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Re-scored ${data?.updated || 0} candidates`);
    },
    onError: (err: any) => {
      toast.error('Re-score failed: ' + err.message);
    },
  });
}
