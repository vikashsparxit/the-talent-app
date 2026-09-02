import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  type EmploymentReference,
  type JobApplicationFormRecord,
  type JobApplicationResponseRecord,
  type PrescreenQuestion,
  groupQuestionsByCategory,
  selectAssignedQuestionKeys,
  validateQuestionAnswers,
  validateReferences,
} from '@/lib/jobApplicationForm';
import { applicantEmailIlikePattern } from '@/lib/applicantApplicationEligibility';

interface ApplicationWithJob {
  id: string;
  job_id: string;
  applicant_email: string;
  form_sent_at?: string | null;
  jd_sent_at?: string | null;
  job?: {
    id: string;
    title: string;
    require_digital_application_form?: boolean;
  } | null;
}

export function useQuestionBank() {
  return useQuery({
    queryKey: ['prescreen-question-bank'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescreen_question_bank')
        .select('id, question_key, question_text, sort_hint, category')
        .eq('is_active', true)
        .order('sort_hint', { ascending: true });

      if (error) throw error;
      return (data || []) as PrescreenQuestion[];
    },
    staleTime: 300_000,
  });
}

async function fetchApplication(applicationId: string): Promise<ApplicationWithJob | null> {
  const { data, error } = await supabase
    .from('job_applications')
    .select(`
      id,
      job_id,
      applicant_email,
      form_sent_at,
      jd_sent_at,
      job:jobs(id, title, require_digital_application_form)
    `)
    .eq('id', applicationId)
    .maybeSingle();

  if (error) throw error;
  return data as ApplicationWithJob | null;
}

async function fetchFormByApplicationId(applicationId: string) {
  const { data, error } = await supabase
    .from('job_application_forms')
    .select('*')
    .eq('job_application_id', applicationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    employment_references: (data.employment_references as EmploymentReference[]) || [],
  } as JobApplicationFormRecord;
}

async function fetchResponses(formId: string) {
  const { data, error } = await supabase
    .from('job_application_responses')
    .select('*')
    .eq('form_id', formId);

  if (error) throw error;
  return (data || []) as JobApplicationResponseRecord[];
}

async function ensureForm(
  applicationId: string,
  questionBank: PrescreenQuestion[],
): Promise<JobApplicationFormRecord> {
  const existing = await fetchFormByApplicationId(applicationId);
  if (existing) return existing;

  const assigned = selectAssignedQuestionKeys(
    applicationId,
    groupQuestionsByCategory(questionBank),
  );
  const { data, error } = await supabase
    .from('job_application_forms')
    .insert({
      job_application_id: applicationId,
      assigned_question_keys: assigned,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;
  return {
    ...data,
    employment_references: (data.employment_references as EmploymentReference[]) || [],
  } as JobApplicationFormRecord;
}

async function fetchQuestionBank() {
  const { data, error } = await supabase
    .from('prescreen_question_bank')
    .select('id, question_key, question_text, sort_hint, category')
    .eq('is_active', true)
    .order('sort_hint', { ascending: true });

  if (error) throw error;
  return (data || []) as PrescreenQuestion[];
}

export function useJobApplicationForm(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['job-application-form', applicationId],
    queryFn: async () => {
      if (!applicationId) return null;

      const application = await fetchApplication(applicationId);
      if (!application) return null;

      const required = application.job?.require_digital_application_form !== false;
      if (!required) {
        return { application, required: false, form: null, responses: [], questions: [] };
      }

      const questionBank = await fetchQuestionBank();
      const form = questionBank.length > 0
        ? await ensureForm(applicationId, questionBank)
        : await fetchFormByApplicationId(applicationId);

      const responses = form ? await fetchResponses(form.id) : [];
      const assignedKeys = form?.assigned_question_keys || [];
      const questions = questionBank.filter((q) => assignedKeys.includes(q.question_key));

      return { application, required: true, form, responses, questions };
    },
    enabled: !!applicationId,
  });

  const submit = useMutation({
    mutationFn: async (input: {
      references: EmploymentReference[];
      answers: Record<string, string>;
      filledByRecruiter?: boolean;
    }) => {
      if (!applicationId || !query.data?.form) {
        throw new Error('Application form not found');
      }

      const refError = validateReferences(input.references);
      if (refError) throw new Error(refError);

      const answerError = validateQuestionAnswers(
        query.data.form.assigned_question_keys,
        input.answers,
      );
      if (answerError) throw new Error(answerError);

      const formId = query.data.form.id;
      const now = new Date().toISOString();

      for (const [questionKey, answerText] of Object.entries(input.answers)) {
        const existing = query.data.responses.find((r) => r.question_key === questionKey);
        if (existing) {
          const { error } = await supabase
            .from('job_application_responses')
            .update({ answer_text: answerText })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('job_application_responses')
            .insert({ form_id: formId, question_key: questionKey, answer_text: answerText });
          if (error) throw error;
        }
      }

      const { error: formError } = await supabase
        .from('job_application_forms')
        .update({
          status: 'submitted',
          employment_references: input.references,
          filled_by_recruiter: input.filledByRecruiter ?? false,
          filled_by_user_id: input.filledByRecruiter ? user?.id ?? null : null,
          submitted_at: now,
        })
        .eq('id', formId);

      if (formError) throw formError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-application-form', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['job-application-form-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-application-form'] });
      queryClient.invalidateQueries({ queryKey: ['applicant-application', applicationId] });
      toast({ title: 'Job application form submitted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to submit form', description: err.message, variant: 'destructive' });
    },
  });

  const saveDraft = useMutation({
    mutationFn: async (input: {
      references: EmploymentReference[];
      answers: Record<string, string>;
    }) => {
      if (!applicationId || !query.data?.form || query.data.form.status !== 'pending') {
        throw new Error('Cannot save draft');
      }

      const formId = query.data.form.id;

      const { error: formError } = await supabase
        .from('job_application_forms')
        .update({ employment_references: input.references })
        .eq('id', formId);

      if (formError) throw formError;

      for (const [questionKey, answerText] of Object.entries(input.answers)) {
        if (!answerText.trim()) continue;
        const existing = query.data.responses.find((r) => r.question_key === questionKey);
        if (existing) {
          const { error } = await supabase
            .from('job_application_responses')
            .update({ answer_text: answerText })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('job_application_responses')
            .insert({ form_id: formId, question_key: questionKey, answer_text: answerText });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-application-form', applicationId] });
      toast({ title: 'Draft saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to save draft', description: err.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    submit,
    saveDraft,
  };
}

const APPLICATION_WITH_JOB_SELECT = `
  id,
  job_id,
  applicant_email,
  form_sent_at,
  jd_sent_at,
  job:jobs(id, title, require_digital_application_form)
`;

async function fetchApplicationForCandidate(
  candidateId: string | null,
  candidateEmail: string | null,
  jobId: string,
): Promise<ApplicationWithJob | null> {
  if (candidateId) {
    const { data, error } = await supabase
      .from('job_applications')
      .select(APPLICATION_WITH_JOB_SELECT)
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ApplicationWithJob;
  }

  if (candidateEmail) {
    const { data, error } = await supabase
      .from('job_applications')
      .select(APPLICATION_WITH_JOB_SELECT)
      .eq('job_id', jobId)
      .ilike('applicant_email', applicantEmailIlikePattern(candidateEmail))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ApplicationWithJob;
  }

  return null;
}

export function useCandidateJobApplication(
  candidateId: string | null,
  candidateEmail: string | null,
  jobId: string | null,
) {
  return useQuery({
    queryKey: ['candidate-job-application', candidateId, candidateEmail, jobId],
    queryFn: async () => {
      if (!jobId || (!candidateId && !candidateEmail)) return null;
      return fetchApplicationForCandidate(candidateId, candidateEmail, jobId);
    },
    enabled: !!jobId && (!!candidateId || !!candidateEmail),
  });
}

export function useCandidateApplicationForm(
  candidateId: string | null,
  candidateEmail: string | null,
  jobId: string | null,
) {
  return useQuery({
    queryKey: ['candidate-application-form', candidateId, candidateEmail, jobId],
    queryFn: async () => {
      if (!jobId || (!candidateId && !candidateEmail)) return null;

      const application = await fetchApplicationForCandidate(candidateId, candidateEmail, jobId);
      if (!application) return null;

      const required = (application.job as { require_digital_application_form?: boolean } | null)
        ?.require_digital_application_form !== false;
      if (!required) return { application, required: false, form: null, responses: [], questions: [] };

      const form = await fetchFormByApplicationId(application.id);
      if (!form) {
        return { application, required: true, form: null, responses: [], questions: [] };
      }

      const [responses, { data: bank }] = await Promise.all([
        fetchResponses(form.id),
        supabase
          .from('prescreen_question_bank')
          .select('id, question_key, question_text, sort_hint, category')
          .eq('is_active', true)
          .order('sort_hint', { ascending: true }),
      ]);

      const assignedKeys = form.assigned_question_keys || [];
      const questions = ((bank || []) as PrescreenQuestion[]).filter((q) =>
        assignedKeys.includes(q.question_key),
      );

      return { application, required: true, form, responses, questions };
    },
    enabled: !!jobId && (!!candidateId || !!candidateEmail),
  });
}

export function useJobApplicationFormStatuses(jobId: string | null, emails: string[]) {
  const normalizedEmails = [...new Set(emails.filter(Boolean))].sort();

  return useQuery({
    queryKey: ['job-application-form-statuses', jobId, normalizedEmails],
    queryFn: async () => {
      if (!jobId || normalizedEmails.length === 0) return new Map<string, 'pending' | 'submitted' | 'none'>();

      const { data: applications, error: appError } = await supabase
        .from('job_applications')
        .select('id, applicant_email, job:jobs(require_digital_application_form)')
        .eq('job_id', jobId)
        .in('applicant_email', normalizedEmails);

      if (appError) throw appError;

      const requiredApps = (applications || []).filter(
        (a) => (a.job as { require_digital_application_form?: boolean } | null)
          ?.require_digital_application_form !== false,
      );

      if (requiredApps.length === 0) {
        return new Map<string, 'pending' | 'submitted' | 'none'>();
      }

      const appIds = requiredApps.map((a) => a.id);
      const { data: forms, error: formError } = await supabase
        .from('job_application_forms')
        .select('job_application_id, status')
        .in('job_application_id', appIds);

      if (formError) throw formError;

      const formByAppId = new Map(
        (forms || []).map((f) => [f.job_application_id, f.status as 'pending' | 'submitted']),
      );

      const result = new Map<string, 'pending' | 'submitted' | 'none'>();
      for (const app of requiredApps) {
        const status = formByAppId.get(app.id);
        result.set(app.applicant_email, status || 'none');
      }
      return result;
    },
    enabled: !!jobId && normalizedEmails.length > 0,
    staleTime: 30_000,
  });
}

export function useSendJobDetailsEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      applicationId: string;
      applicantName: string;
      applicantEmail: string;
      jobTitle: string;
    }) => {
      const { error } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          type: 'job_details',
          application_id: input.applicationId,
          applicant_name: input.applicantName,
          applicant_email: input.applicantEmail,
          job_title: input.jobTitle,
        },
      });

      if (error) throw error;

      const sentAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('job_applications')
        .update({ jd_sent_at: sentAt })
        .eq('id', input.applicationId);

      if (updateError) throw updateError;

      return { jd_sent_at: sentAt };
    },
    onSuccess: (data, input) => {
      queryClient.setQueriesData(
        { queryKey: ['candidate-job-application'] },
        (old: ApplicationWithJob | null | undefined) => {
          if (!old || old.id !== input.applicationId) return old;
          return { ...old, jd_sent_at: data.jd_sent_at };
        },
      );
      queryClient.setQueriesData(
        { queryKey: ['candidate-application-form'] },
        (old: { application?: { id?: string; jd_sent_at?: string | null } } | null | undefined) => {
          if (!old?.application || old.application.id !== input.applicationId) return old;
          return {
            ...old,
            application: { ...old.application, jd_sent_at: data.jd_sent_at },
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ['candidate-job-application'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-application-form'] });
      toast({
        title: 'Job details sent',
        description: 'The candidate was emailed the job description and careers link.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to send job details',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

export function useSendApplicationFormEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      applicationId: string;
      applicantName: string;
      applicantEmail: string;
      jobTitle: string;
    }) => {
      const { error } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          type: 'application_form_required',
          application_id: input.applicationId,
          applicant_name: input.applicantName,
          applicant_email: input.applicantEmail,
          job_title: input.jobTitle,
        },
      });

      if (error) throw error;

      const sentAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('job_applications')
        .update({ form_sent_at: sentAt })
        .eq('id', input.applicationId);

      if (updateError) throw updateError;

      return { form_sent_at: sentAt };
    },
    onSuccess: (data, input) => {
      queryClient.setQueriesData(
        { queryKey: ['candidate-application-form'] },
        (old: { application?: { id?: string; form_sent_at?: string | null } } | null | undefined) => {
          if (!old?.application || old.application.id !== input.applicationId) return old;
          return {
            ...old,
            application: { ...old.application, form_sent_at: data.form_sent_at },
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ['candidate-application-form'] });
      queryClient.invalidateQueries({ queryKey: ['job-application-form', input.applicationId] });
      toast({ title: 'Form link sent', description: 'The candidate was emailed a link to complete the digital application form.' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to send form email',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
