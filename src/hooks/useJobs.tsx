import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  submitPortalJobApplication,
  formatPortalApplyError,
  type PortalApplyResult,
} from '@/lib/applicantApplicationEligibility';
import { ToastAction } from '@/components/ui/toast';
import type { Job, JobApplication, JobStatus, JobType, ExperienceLevel, PositionType, ExperienceYearsRange, JobAssessmentConfig } from '@/types/jobs';
import { parseJobAssessmentConfig } from '@/hooks/useJobAssessment';
import { DEFAULT_CURRENCY } from '@/lib/indianLocale';

interface CreateJobData {
  title: string;
  description?: string;
  domain?: string;
  department?: string;
  location?: string;
  job_type?: JobType;
  experience_level?: ExperienceLevel;
  experience_years_range?: ExperienceYearsRange;
  position_type?: PositionType;
  total_openings?: number;
  salary_min?: number;
  salary_max?: number;
  required_skills?: string[];
  benefits?: string[];
  application_deadline?: string;
  status?: JobStatus;
  require_digital_application_form?: boolean;
  assessment_enabled?: boolean;
  default_assessment_id?: string | null;
  assessment_config?: JobAssessmentConfig;
}

interface UpdateJobData extends Partial<CreateJobData> {
  id: string;
  positions_filled?: number;
}

export function useJobs(options?: { summary?: boolean; reportList?: boolean }) {
  const summary = options?.summary ?? false;
  const reportList = options?.reportList ?? false;
  const listMode = reportList ? 'reportList' : summary ? 'summary' : 'full';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', listMode],
    staleTime: listMode !== 'full' ? 120_000 : 0,
    queryFn: async () => {
      if (summary) {
        const { data, error } = await supabase
          .from('jobs')
          .select('id, title, status, created_at, application_deadline, total_openings, positions_filled')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as Job[];
      }

      if (reportList) {
        const { data, error } = await supabase
          .from('jobs')
          .select('id, title, status, application_deadline, created_at, department, domain, candidates(count)')
          .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((job: any) => ({
          ...job,
          candidate_count: job.candidates?.[0]?.count ?? 0,
        })) as (Job & { candidate_count: number })[];
      }

      const { data, error } = await supabase
        .from('jobs')
        .select('*, candidates(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((job: any) => ({
        ...job,
        required_skills: Array.isArray(job.required_skills) ? job.required_skills : [],
        benefits: Array.isArray(job.benefits) ? job.benefits : [],
        salary_currency: 'INR',
        candidate_count: job.candidates?.[0]?.count ?? 0,
      })) as (Job & { candidate_count: number })[];
    },
  });

  const createJob = useMutation({
    mutationFn: async (data: CreateJobData) => {
      const { data: result, error } = await supabase
        .from('jobs')
        .insert({
          title: data.title,
          description: data.description,
          domain: data.domain,
          department: data.department,
          location: data.location,
          job_type: data.job_type || 'full_time',
          experience_level: data.experience_level,
          experience_years_range: data.experience_years_range,
          position_type: data.position_type || 'tech',
          total_openings: data.total_openings || 1,
          salary_min: data.salary_min,
          salary_max: data.salary_max,
          salary_currency: 'INR',
          required_skills: data.required_skills || [],
          benefits: data.benefits || [],
          application_deadline: data.application_deadline,
          status: data.status || 'draft',
          require_digital_application_form: data.require_digital_application_form ?? true,
          assessment_enabled: data.assessment_enabled ?? false,
          default_assessment_id: data.default_assessment_id ?? null,
          assessment_config: data.assessment_config ?? parseJobAssessmentConfig(null),
        } as any)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({ title: 'Job created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create job', description: error.message, variant: 'destructive' });
    },
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, ...data }: UpdateJobData) => {
      const updateData: any = {
        ...data,
        salary_currency: 'INR',
        updated_at: new Date().toISOString(),
      };
      const { data: result, error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({ title: 'Job updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update job', description: error.message, variant: 'destructive' });
    },
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('jobs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({ title: 'Job deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete job', description: error.message, variant: 'destructive' });
    },
  });

  return {
    jobs,
    isLoading,
    createJob,
    updateJob,
    deleteJob,
  };
}

export function useJobApplications(jobId?: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const enabled = options?.enabled ?? true;

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['job-applications', jobId],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from('job_applications')
        .select('*, job:jobs(*)')
        .order('created_at', { ascending: false });

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as JobApplication[];
    },
  });

  const updateApplicationStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('job_applications')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-applications'] });
      toast({ title: 'Application status updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
    },
  });

  const shortlistApplicant = useMutation({
    mutationFn: async (application: JobApplication) => {
      const job = application.job;
      
      const { error: emailError } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          type: 'shortlist',
          applicant_name: application.applicant_name,
          applicant_email: application.applicant_email,
          job_title: job?.title || 'the position',
        },
      });

      if (emailError) {
        console.error('Failed to send shortlist email:', emailError);
      }

      const { error: statusError } = await supabase
        .from('job_applications')
        .update({ status: 'shortlisted' })
        .eq('id', application.id);

      if (statusError) throw statusError;

      // Candidate is auto-created by DB trigger, no need to create manually
      return { emailSent: !emailError };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-applications'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      if (result.emailSent) {
        toast({ title: 'Applicant shortlisted', description: 'Confirmation email sent and added to candidates' });
      } else {
        toast({ title: 'Applicant shortlisted', description: 'Added to candidates (email failed to send)' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to shortlist applicant', description: error.message, variant: 'destructive' });
    },
  });

  const rejectApplicant = useMutation({
    mutationFn: async ({ application, rejectionReason }: { application: JobApplication; rejectionReason: string }) => {
      const job = application.job;
      
      const { error: emailError } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          type: 'reject',
          applicant_name: application.applicant_name,
          applicant_email: application.applicant_email,
          job_title: job?.title || 'the position',
          rejection_reason: rejectionReason,
        },
      });

      if (emailError) {
        console.error('Failed to send rejection email:', emailError);
        throw new Error('Failed to send rejection email');
      }

      const { error: statusError } = await supabase
        .from('job_applications')
        .update({ status: 'rejected' })
        .eq('id', application.id);

      if (statusError) throw statusError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-applications'] });
      toast({ title: 'Application rejected', description: 'Rejection email sent to the applicant' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to reject applicant', description: error.message, variant: 'destructive' });
    },
  });

  const convertToCandidate = useMutation({
    mutationFn: async (application: JobApplication) => {
      // Candidate is auto-created by DB trigger on application insert
      // This action just marks the application as 'converted' if not already linked
      if (application.candidate_id) {
        // Already linked, just update status
        const { error } = await supabase
          .from('job_applications')
          .update({ status: 'converted' })
          .eq('id', application.id);
        if (error) throw error;
        return { id: application.candidate_id };
      }

      // Edge case: old application without trigger - create candidate
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          name: application.applicant_name,
          email: application.applicant_email,
          phone: application.applicant_phone,
          resume_url: application.resume_url,
          job_id: application.job_id,
          notes: application.cover_letter,
        })
        .select()
        .single();

      if (candidateError) throw candidateError;

      await supabase
        .from('job_applications')
        .update({ candidate_id: candidate.id, status: 'converted' })
        .eq('id', application.id);

      return candidate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-applications'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Applicant converted to candidate' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to convert applicant', description: error.message, variant: 'destructive' });
    },
  });

  return {
    applications,
    isLoading,
    updateApplicationStatus,
    shortlistApplicant,
    rejectApplicant,
    convertToCandidate,
  };
}

// Hook for public job listings (no auth required) - excludes sensitive data
export function usePublicJobs() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['public-jobs'],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Select only public-safe fields: domain, team, location, experience, skills
      // Exclude: salary, position_type, total_openings
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, description, domain, department, location, job_type, experience_level, experience_years_range, required_skills, application_deadline, created_at, updated_at, status')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((job: any) => ({
        ...job,
        required_skills: Array.isArray(job.required_skills) ? job.required_skills : [],
        benefits: [],
        salary_min: null,
        salary_max: null,
        salary_currency: 'INR',
      })) as Job[];
    },
  });

  return { jobs, isLoading };
}

export function useSubmitApplication() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      job_id: string;
      job_title: string;
      applicant_name: string;
      applicant_email: string;
      applicant_phone?: string;
      cover_letter?: string;
      linkedin_url?: string;
      resume_url?: string;
    }): Promise<PortalApplyResult> => {
      const { job_title, ...applicationData } = data;

      const result = await submitPortalJobApplication({
        job_id: applicationData.job_id,
        applicant_name: applicationData.applicant_name,
        applicant_email: applicationData.applicant_email,
        applicant_phone: applicationData.applicant_phone,
        cover_letter: applicationData.cover_letter,
        linkedin_url: applicationData.linkedin_url,
        resume_url: applicationData.resume_url,
      });

      if (result.status !== 'already_applied') {
        try {
          const { error: emailError } = await supabase.functions.invoke('send-applicant-email', {
            body: {
              type: 'application_received',
              applicant_name: data.applicant_name,
              applicant_email: data.applicant_email,
              job_title: job_title,
            },
          });

          if (emailError) {
            console.error('Failed to send application received email:', emailError);
          }
        } catch (emailErr) {
          console.error('Email function error:', emailErr);
        }
      }

      return result;
    },
    onSuccess: (result) => {
      if (result.status === 'already_applied') {
        toast({
          title: 'You already have an application for this position',
          description: 'Sign in to the applicant portal to view your application.',
          action: (
            <ToastAction
              altText="Applicant portal"
              onClick={() => {
                window.location.assign('/applicant/login');
              }}
            >
              Sign in
            </ToastAction>
          ),
        });
        return;
      }

      toast({
        title: result.status === 'updated' ? 'Application linked!' : 'Application submitted successfully!',
        description: 'Check your email for confirmation.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit application', description: formatPortalApplyError(error), variant: 'destructive' });
    },
  });
}
