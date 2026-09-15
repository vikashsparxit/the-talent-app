import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useApplicantAuth } from './useApplicantAuth';
import { useApplicantApplications, useApplicantCandidateRecord } from './useApplicantPortal';
import { useToast } from './use-toast';
import {
  calculateJobMatchScore,
  isRelevantJobMatch,
  RELEVANT_JOB_MATCH_THRESHOLD,
} from '@/lib/jobMatchScore';
import {
  getApplicationEligibility,
  fetchApplicantApplicationEligibility,
  submitPortalJobApplication,
  formatPortalApplyError,
  type CandidateForEligibility,
  type PortalApplyResult,
} from '@/lib/applicantApplicationEligibility';
import { ToastAction } from '@/components/ui/toast';
import type { Job } from '@/types/jobs';
import { getApplicantDisplayName } from '@/lib/applicantProfile';

const OPEN_JOB_SELECT =
  'id, title, description, department, location, job_type, experience_level, application_deadline, required_skills, created_at, updated_at, status';

function normalizeJob(job: Record<string, unknown>): Job {
  return {
    ...job,
    required_skills: Array.isArray(job.required_skills) ? job.required_skills : [],
    benefits: [],
    salary_min: null,
    salary_max: null,
    salary_currency: null,
  } as Job;
}

export function useApplicantJobs() {
  const { profile } = useApplicantAuth();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['applicant-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select(OPEN_JOB_SELECT)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((job) => normalizeJob(job as Record<string, unknown>));
    },
  });

  const calculateMatchScore = (job: Job): number => calculateJobMatchScore(profile, job);

  const scoredJobs = jobs.map((job) => ({
    job,
    matchScore: calculateMatchScore(job),
  }));

  const relevantJobs = scoredJobs
    .filter(({ matchScore }) => isRelevantJobMatch(matchScore))
    .sort((a, b) => b.matchScore - a.matchScore);

  const otherJobs = scoredJobs
    .filter(({ matchScore }) => !isRelevantJobMatch(matchScore))
    .sort((a, b) => b.matchScore - a.matchScore);

  return {
    jobs,
    isLoading,
    calculateMatchScore,
    scoredJobs,
    relevantJobs,
    otherJobs,
    relevantThreshold: RELEVANT_JOB_MATCH_THRESHOLD,
  };
}

export function useApplicantJob(jobId: string | undefined) {
  const { profile } = useApplicantAuth();

  const query = useQuery({
    queryKey: ['applicant-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;

      const { data, error } = await supabase
        .from('jobs')
        .select(OPEN_JOB_SELECT)
        .eq('id', jobId)
        .eq('status', 'open')
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return normalizeJob(data as Record<string, unknown>);
    },
    enabled: !!jobId,
  });

  const matchScore = query.data ? calculateJobMatchScore(profile, query.data) : 0;

  return {
    job: query.data ?? null,
    matchScore,
    isRelevant: isRelevantJobMatch(matchScore),
    isLoading: query.isLoading,
    error: query.error,
  };
}

export { fetchApplicantApplicationEligibility } from '@/lib/applicantApplicationEligibility';

export function useApplicantApplicationEligibility(targetJobId?: string) {
  const { data: applications = [], isLoading: appsLoading } = useApplicantApplications();
  const { data: candidate = null, isLoading: candidateLoading } = useApplicantCandidateRecord();

  const eligibility = useMemo(() => {
    const candidateEligibility: CandidateForEligibility | null = candidate
      ? {
          candidate_status: (candidate as { candidate_status?: string }).candidate_status ?? 'new',
          hired_at: (candidate as { hired_at?: string | null }).hired_at ?? null,
          job_id: candidate.job_id,
        }
      : null;

    return getApplicationEligibility(applications, candidateEligibility, targetJobId);
  }, [applications, candidate, targetJobId]);

  return {
    ...eligibility,
    isLoading: appsLoading || candidateLoading,
    applications,
  };
}

export function useQuickApply() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useApplicantAuth();

  return useMutation({
    mutationFn: async ({ job, cover_letter }: { job: Job; cover_letter?: string }): Promise<PortalApplyResult> => {
      if (!profile) throw new Error('Not authenticated');

      const applicantName = getApplicantDisplayName(profile) || profile.full_name;

      const result = await submitPortalJobApplication({
        job_id: job.id,
        applicant_name: applicantName,
        applicant_email: profile.email,
        applicant_phone: profile.phone,
        linkedin_url: profile.linkedin_url,
        resume_url: profile.resume_url,
        cover_letter: cover_letter || null,
      });

      if (result.status !== 'already_applied') {
        try {
          await supabase.functions.invoke('send-applicant-email', {
            body: {
              type: 'application_received',
              applicant_name: applicantName,
              applicant_email: profile.email,
              job_title: job.title,
            },
          });
        } catch (e) {
          console.error('Email error:', e);
        }
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['applicant-applications'] });

      if (result.status === 'already_applied') {
        toast({
          title: 'You already have an application for this position',
          description: result.applicationId
            ? 'Opening your existing application…'
            : 'View your existing application in the applicant portal.',
          action: result.applicationId ? (
            <ToastAction
              altText="View application"
              onClick={() => {
                window.location.assign(`/applicant/applications/${result.applicationId}`);
              }}
            >
              View application
            </ToastAction>
          ) : undefined,
        });
        if (result.applicationId) {
          window.location.assign(`/applicant/applications/${result.applicationId}`);
        }
        return;
      }

      toast({
        title: result.status === 'updated' ? 'Application linked!' : 'Application submitted!',
        description:
          result.status === 'updated'
            ? 'Your profile details were added to your existing application.'
            : 'Check your email for confirmation.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to apply', description: formatPortalApplyError(error), variant: 'destructive' });
    },
  });
}
