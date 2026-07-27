import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useApplicantAuth } from './useApplicantAuth';
import { useToast } from './use-toast';
import { buildFullName } from '@/lib/applicantProfile';
import {
  fetchMyJobApplications,
  normalizeApplicantEmail,
} from '@/lib/applicantApplicationEligibility';

interface Application {
  id: string;
  job_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  cover_letter: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  application_form_status?: 'pending' | 'submitted' | null;
  job?: {
    id: string;
    title: string;
    department: string | null;
    location: string | null;
    job_type: string;
    require_digital_application_form?: boolean;
  } | null;
}

interface CandidateRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  job_id: string | null;
  notes: string | null;
  skills: string[];
  created_at: string;
}

interface AssessmentAssignment {
  id: string;
  candidate_id: string;
  assessment_id: string;
  status: string;
  invited_at: string;
  deadline: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  assessment?: {
    id: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    passing_score: number;
  } | null;
}

export function useApplicantApplications() {
  const { profile } = useApplicantAuth();

  return useQuery({
    queryKey: ['applicant-applications', profile?.email],
    queryFn: async () => {
      if (!profile?.email) return [];

      const rows = await fetchMyJobApplications();
      const applications = rows as Application[];

      const requiredIds = applications
        .filter((a) => a.job?.require_digital_application_form !== false)
        .map((a) => a.id);

      if (requiredIds.length === 0) return applications;

      const { data: forms } = await supabase
        .from('job_application_forms')
        .select('job_application_id, status')
        .in('job_application_id', requiredIds);

      const formByAppId = new Map(
        (forms || []).map((f) => [f.job_application_id, f.status as 'pending' | 'submitted']),
      );

      return applications.map((app) => ({
        ...app,
        application_form_status: app.job?.require_digital_application_form === false
          ? null
          : (formByAppId.get(app.id) || 'pending'),
      }));
    },
    enabled: !!profile?.email,
  });
}

export function useApplicantCandidateRecord() {
  const { profile } = useApplicantAuth();

  return useQuery({
    queryKey: ['applicant-candidate', profile?.email],
    queryFn: async () => {
      if (!profile?.email) return null;

      const { data: rows, error } = await supabase
        .from('candidates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const normalizedEmail = normalizeApplicantEmail(profile.email);
      const data = (rows || []).find(
        (row) => normalizeApplicantEmail((row as CandidateRecord).email) === normalizedEmail,
      );
      if (!data) return null;
      return data as CandidateRecord;
    },
    enabled: !!profile?.email,
  });
}

export function useApplicantAssessments() {
  const { profile } = useApplicantAuth();
  const { data: candidateRecord } = useApplicantCandidateRecord();

  return useQuery({
    queryKey: ['applicant-assessments', candidateRecord?.id],
    queryFn: async () => {
      if (!candidateRecord?.id) return [];

      const { data, error } = await supabase
        .from('candidate_assessments')
        .select(`
          *,
          assessment:assessments(id, title, description, duration_minutes, passing_score)
        `)
        .eq('candidate_id', candidateRecord.id)
        .order('invited_at', { ascending: false });

      if (error) throw error;
      return data as AssessmentAssignment[];
    },
    enabled: !!candidateRecord?.id,
  });
}

export function useStartAssessment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assessmentId: string) => {
      const { error } = await supabase
        .from('candidate_assessments')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', assessmentId)
        .eq('status', 'invited');

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applicant-assessments'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to start assessment', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

export interface TimelineEvent {
  title: string;
  description?: string;
  date?: string;
  complete: boolean;
}

export function useApplicantApplication(applicationId: string | undefined) {
  const { profile } = useApplicantAuth();

  return useQuery({
    queryKey: ['applicant-application', applicationId, profile?.email],
    queryFn: async () => {
      if (!applicationId || !profile?.email) return null;

      const ownedApps = (await fetchMyJobApplications()) as Application[];
      let application = ownedApps.find((app) => app.id === applicationId) ?? null;

      if (!application) {
        const { data, error } = await supabase
          .from('job_applications')
          .select(`
            *,
            job:jobs(id, title, department, location, job_type, require_digital_application_form)
          `)
          .eq('id', applicationId)
          .maybeSingle();

        if (error) throw error;
        if (
          !data ||
          normalizeApplicantEmail(data.applicant_email) !== normalizeApplicantEmail(profile.email)
        ) {
          return null;
        }
        application = data as Application;
      }

      let assessments: AssessmentAssignment[] = [];
      if (application.candidate_id) {
        const { data: assessmentData, error: assessmentError } = await supabase
          .from('candidate_assessments')
          .select(`
            *,
            assessment:assessments(id, title, description, duration_minutes, passing_score)
          `)
          .eq('candidate_id', application.candidate_id)
          .order('invited_at', { ascending: true });

        if (assessmentError) throw assessmentError;
        assessments = (assessmentData || []) as AssessmentAssignment[];
      }

      let applicationForm: { status: string; submitted_at: string | null } | null = null;
      const jobRequiresForm = (application.job as { require_digital_application_form?: boolean } | null)
        ?.require_digital_application_form !== false;
      if (jobRequiresForm) {
        const { data: formData } = await supabase
          .from('job_application_forms')
          .select('status, submitted_at')
          .eq('job_application_id', application.id)
          .maybeSingle();
        applicationForm = formData;
      }

      const timeline = buildApplicationTimeline(application, assessments, applicationForm, jobRequiresForm);

      return { application, assessments, timeline };
    },
    enabled: !!applicationId && !!profile?.email,
  });
}

function buildApplicationTimeline(
  application: Application,
  assessments: AssessmentAssignment[],
  applicationForm?: { status: string; submitted_at: string | null } | null,
  jobRequiresForm = false,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      title: 'Application Submitted',
      description: 'Your application has been received.',
      date: application.created_at,
      complete: true,
    },
  ];

  if (jobRequiresForm) {
    if (applicationForm?.status === 'submitted') {
      events.push({
        title: 'Job Application Form — Submitted',
        description: 'Your pre-screen responses are on file.',
        date: applicationForm.submitted_at || undefined,
        complete: true,
      });
    } else {
      events.push({
        title: 'Job Application Form — Pending',
        description: 'Complete your digital application form before interview rounds.',
        complete: false,
      });
    }
  }

  const statusOrder = ['new', 'reviewing', 'shortlisted', 'converted', 'rejected'];
  const currentIdx = statusOrder.indexOf(application.status);

  if (currentIdx >= 1 || application.status === 'reviewing') {
    events.push({
      title: 'Under Review',
      description: 'Our team is reviewing your application.',
      date: application.updated_at,
      complete: currentIdx >= 1,
    });
  }

  if (application.status === 'shortlisted' || application.status === 'converted') {
    events.push({
      title: 'Shortlisted',
      description: 'You have been shortlisted for this role.',
      date: application.updated_at,
      complete: true,
    });
  }

  if (application.status === 'converted') {
    events.push({
      title: 'Interview Stage',
      description: 'You have progressed to the interview stage.',
      date: application.updated_at,
      complete: true,
    });
  }

  if (application.status === 'rejected') {
    events.push({
      title: 'Not Selected',
      description: 'Thank you for your interest. We encourage you to apply for other openings.',
      date: application.updated_at,
      complete: true,
    });
  }

  for (const a of assessments) {
    const label = a.assessment?.title || 'Assessment';
    if (a.status === 'invited') {
      events.push({
        title: `${label} — Assigned`,
        description: a.deadline ? `Complete by ${new Date(a.deadline).toLocaleDateString()}` : undefined,
        date: a.invited_at,
        complete: false,
      });
    } else if (a.status === 'in_progress') {
      events.push({
        title: `${label} — In Progress`,
        date: a.started_at || undefined,
        complete: false,
      });
    } else if (a.status === 'completed' || a.status === 'evaluated') {
      events.push({
        title: `${label} — Submitted`,
        description: 'Your assessment is under review.',
        date: a.completed_at || undefined,
        complete: true,
      });
    } else if (a.status === 'expired') {
      events.push({
        title: `${label} — Expired`,
        date: a.deadline || undefined,
        complete: true,
      });
    }
  }

  return events;
}

export function useApplicantUpdateProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile, updateProfile } = useApplicantAuth();

  return useMutation({
    mutationFn: async (updates: {
      first_name?: string;
      last_name?: string;
      middle_name?: string | null;
      phone?: string;
      emergency_phone?: string | null;
      linkedin_url?: string | null;
      resume_url?: string;
      avatar_url?: string | null;
      dob_actual?: string | null;
      dob_documented?: string | null;
      gender?: string | null;
      marital_status?: string | null;
      blood_group?: string | null;
      work_experience?: any[];
      education?: any[];
      skills?: string[];
      notification_prefs?: Record<string, boolean>;
      documents?: unknown[];
    }) => {
      const { error, skippedFields } = await updateProfile(updates);
      if (error) throw error;

      if (profile?.email) {
        const candidateUpdate: Record<string, unknown> = {};
        if (
          updates.first_name !== undefined ||
          updates.middle_name !== undefined ||
          updates.last_name !== undefined
        ) {
          candidateUpdate.name = buildFullName(
            updates.first_name ?? profile.first_name ?? '',
            updates.middle_name !== undefined ? updates.middle_name : profile.middle_name,
            updates.last_name ?? profile.last_name ?? '',
          );
        }
        if (updates.phone !== undefined) candidateUpdate.phone = updates.phone;
        if (updates.resume_url !== undefined) candidateUpdate.resume_url = updates.resume_url;
        if (updates.linkedin_url !== undefined) candidateUpdate.linkedin_url = updates.linkedin_url;
        if (updates.skills !== undefined) candidateUpdate.skills = updates.skills;

        if (Object.keys(candidateUpdate).length > 0) {
          const { error: candidateError } = await supabase
            .from('candidates')
            .update(candidateUpdate)
            .eq('email', profile.email);

          if (candidateError && !candidateError.message.includes('0 rows')) {
            console.error('Error updating candidate:', candidateError);
          }
        }
      }

      return { skippedFields };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['applicant-candidate'] });
      if (result.skippedFields?.length) {
        toast({
          title: 'Profile saved',
          description:
            'Your core profile was updated. Some fields will save after the next platform update.',
        });
      } else {
        toast({ title: 'Profile updated successfully' });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to update profile', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}
