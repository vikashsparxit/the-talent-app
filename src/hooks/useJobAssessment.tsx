import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JobAssessmentConfig } from '@/types/jobs';
import {
  type AssessmentOrgDefaults,
  DEFAULT_ASSESSMENT_ORG_DEFAULTS,
} from '@/hooks/useSystemConfig';

export type PipelineAssessmentStatus =
  | 'not_required'
  | 'none'
  | 'pending'
  | 'passed'
  | 'failed'
  | 'expired';

export interface CandidateJobAssessmentRow {
  id: string;
  candidate_id: string;
  assessment_id: string;
  job_id: string | null;
  status: string;
  passed: boolean | null;
  percentage: number | null;
  deadline: string | null;
  invited_at: string;
  completed_at: string | null;
  consent_given: boolean;
  assessment?: { title: string; passing_score: number } | null;
}

const DEFAULT_CONFIG: JobAssessmentConfig = {
  deadline_days: DEFAULT_ASSESSMENT_ORG_DEFAULTS.deadline_days,
  pass_threshold_override: DEFAULT_ASSESSMENT_ORG_DEFAULTS.default_pass_threshold,
  notify_recruiter_on_complete: DEFAULT_ASSESSMENT_ORG_DEFAULTS.notify_recruiter_on_complete,
  require_pass_before_interview: DEFAULT_ASSESSMENT_ORG_DEFAULTS.require_pass_before_interview,
};

/** Build job assessment_config defaults from org Settings (used when creating new jobs). */
export function defaultAssessmentConfig(
  orgDefaults: AssessmentOrgDefaults = DEFAULT_ASSESSMENT_ORG_DEFAULTS,
): JobAssessmentConfig {
  return {
    deadline_days: orgDefaults.deadline_days,
    pass_threshold_override: orgDefaults.default_pass_threshold,
    notify_recruiter_on_complete: orgDefaults.notify_recruiter_on_complete,
    require_pass_before_interview: orgDefaults.require_pass_before_interview,
  };
}

/**
 * Pass threshold resolution (most specific wins):
 *   1. job pass_threshold_override
 *   2. org default_pass_threshold from Settings (null = skip)
 *   3. assessment.passing_score
 */
export function resolvePassThreshold(
  jobConfig: JobAssessmentConfig,
  orgDefaults: AssessmentOrgDefaults,
  assessmentPassingScore: number,
): number {
  if (typeof jobConfig.pass_threshold_override === 'number') {
    return jobConfig.pass_threshold_override;
  }
  if (typeof orgDefaults.default_pass_threshold === 'number') {
    return orgDefaults.default_pass_threshold;
  }
  return assessmentPassingScore;
}

export function parseJobAssessmentConfig(
  raw: unknown,
  orgDefaults?: AssessmentOrgDefaults,
): JobAssessmentConfig {
  const fallback = orgDefaults ? defaultAssessmentConfig(orgDefaults) : DEFAULT_CONFIG;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const c = raw as Record<string, unknown>;
  return {
    deadline_days: typeof c.deadline_days === 'number' ? c.deadline_days : fallback.deadline_days,
    pass_threshold_override:
      typeof c.pass_threshold_override === 'number' ? c.pass_threshold_override : null,
    notify_recruiter_on_complete:
      c.notify_recruiter_on_complete !== false,
    require_pass_before_interview:
      c.require_pass_before_interview !== false,
  };
}

export function resolvePipelineAssessmentStatus(
  row: Pick<CandidateJobAssessmentRow, 'status' | 'passed'> | null | undefined,
): PipelineAssessmentStatus {
  if (!row) return 'none';
  if (row.status === 'expired') return 'expired';
  if (row.status === 'completed' || row.status === 'evaluated') {
    return row.passed ? 'passed' : 'failed';
  }
  return 'pending';
}

export function useJobAssessmentConfig(jobId: string | null) {
  return useQuery({
    queryKey: ['job-assessment-config', jobId],
    queryFn: async () => {
      if (!jobId) return null;

      const { data, error } = await supabase
        .from('jobs')
        .select('id, assessment_enabled, default_assessment_id, assessment_config')
        .eq('id', jobId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        jobId: data.id,
        assessmentEnabled: data.assessment_enabled === true,
        defaultAssessmentId: data.default_assessment_id as string | null,
        config: parseJobAssessmentConfig(data.assessment_config),
      };
    },
    enabled: !!jobId,
    staleTime: 60_000,
  });
}

export function usePipelineAssessmentStatuses(
  jobId: string | null,
  candidateIds: string[],
  jobConfig?: {
    assessmentEnabled: boolean;
    defaultAssessmentId: string | null;
  } | null,
) {
  const normalizedIds = [...new Set(candidateIds.filter(Boolean))].sort();

  return useQuery({
    queryKey: ['pipeline-assessment-statuses', jobId, normalizedIds, jobConfig?.defaultAssessmentId],
    queryFn: async () => {
      const result = new Map<string, PipelineAssessmentStatus>();
      if (!jobId || normalizedIds.length === 0) return result;

      const enabled = jobConfig?.assessmentEnabled ?? false;
      const defaultAssessmentId = jobConfig?.defaultAssessmentId ?? null;

      if (!enabled || !defaultAssessmentId) {
        normalizedIds.forEach((id) => result.set(id, 'not_required'));
        return result;
      }

      const { data, error } = await supabase
        .from('candidate_assessments')
        .select('id, candidate_id, assessment_id, job_id, status, passed, invited_at')
        .in('candidate_id', normalizedIds)
        .eq('assessment_id', defaultAssessmentId)
        .order('invited_at', { ascending: false });

      if (error) throw error;

      const latestByCandidate = new Map<string, (typeof data)[number]>();
      for (const row of data || []) {
        if (!latestByCandidate.has(row.candidate_id)) {
          latestByCandidate.set(row.candidate_id, row);
        }
      }

      for (const candidateId of normalizedIds) {
        const row = latestByCandidate.get(candidateId);
        result.set(candidateId, resolvePipelineAssessmentStatus(row));
      }
      return result;
    },
    enabled: !!jobId && normalizedIds.length > 0,
    staleTime: 30_000,
  });
}

export function useCandidateJobAssessment(
  candidateId: string | null | undefined,
  jobId: string | null | undefined,
  defaultAssessmentId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['candidate-job-assessment', candidateId, jobId, defaultAssessmentId],
    queryFn: async () => {
      if (!candidateId || !jobId || !defaultAssessmentId) {
        return { required: false, assignment: null as CandidateJobAssessmentRow | null };
      }

      const { data, error } = await supabase
        .from('candidate_assessments')
        .select(`
          id, candidate_id, assessment_id, job_id, status, passed, percentage,
          deadline, invited_at, completed_at, consent_given,
          assessment:assessments(title, passing_score)
        `)
        .eq('candidate_id', candidateId)
        .eq('assessment_id', defaultAssessmentId)
        .order('invited_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const assessment = Array.isArray(data?.assessment)
        ? data.assessment[0]
        : data?.assessment;

      return {
        required: true,
        assignment: data
          ? ({
              ...data,
              assessment: assessment as { title: string; passing_score: number } | null,
            } as CandidateJobAssessmentRow)
          : null,
      };
    },
    enabled: !!candidateId && !!jobId && !!defaultAssessmentId,
  });
}
