import { supabase } from '@/integrations/supabase/client';

export interface ApplicationForEligibility {
  id: string;
  job_id: string;
  status: string;
  source?: string;
  job?: { title: string } | null;
}

export interface CandidateForEligibility {
  candidate_status: string;
  hired_at: string | null;
  job_id: string | null;
}

export type EligibilityBlockReason = 'active_application' | 'hired' | 'already_applied';

export interface ApplicationEligibility {
  canApply: boolean;
  reason: EligibilityBlockReason | null;
  activeApplication?: ApplicationForEligibility;
  blockMessage?: string;
}

export type PortalApplyResult =
  | { status: 'created'; applicationId: string }
  | { status: 'updated'; applicationId: string }
  | { status: 'already_applied'; applicationId: string };

export function normalizeApplicantEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeIlikeExact(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export function applicantEmailIlikePattern(email: string): string {
  return escapeIlikeExact(normalizeApplicantEmail(email));
}

function isRecruiterSyncedApplication(source?: string): boolean {
  return source === 'recruiter' || source === 'import';
}

function applicationsForEmail(
  applications: (ApplicationForEligibility & { applicant_email?: string })[],
  email: string,
): ApplicationForEligibility[] {
  const normalized = normalizeApplicantEmail(email);
  return applications.filter((app) => {
    if (!app.applicant_email) return true;
    return normalizeApplicantEmail(app.applicant_email) === normalized;
  });
}

/**
 * Closed = applicant may apply to other roles.
 * - job_applications.status rejected (Applications page reject, Candidates status sync)
 * - Pending-approval decline sets candidates.candidate_status only (Pipeline decline)
 * - Pipeline interview reject does NOT sync to job_applications; those apps stay active
 *   until HR updates status — a DB trigger would be needed for full coverage.
 */
export function isApplicationClosed(
  app: ApplicationForEligibility,
  candidate: CandidateForEligibility | null,
): boolean {
  if (app.status === 'rejected' || app.status === 'shortlisted') return true;

  if (
    candidate &&
    candidate.job_id === app.job_id &&
    (candidate.candidate_status === 'rejected' || candidate.candidate_status === 'backout')
  ) {
    return true;
  }

  return false;
}

export function isApplicantHired(
  applications: ApplicationForEligibility[],
  candidate: CandidateForEligibility | null,
): boolean {
  if (candidate?.hired_at) return true;
  if (candidate?.candidate_status === 'shortlisted') return true;
  return applications.some((app) => app.status === 'shortlisted');
}

export function getApplicationEligibility(
  applications: ApplicationForEligibility[],
  candidate: CandidateForEligibility | null,
  targetJobId?: string,
): ApplicationEligibility {
  if (targetJobId) {
    const existingApp = applications.find((app) => app.job_id === targetJobId);
    if (existingApp && !isRecruiterSyncedApplication(existingApp.source)) {
      return {
        canApply: false,
        reason: 'already_applied',
        activeApplication: existingApp,
        blockMessage: 'You already have an application for this position.',
      };
    }
  }

  if (isApplicantHired(applications, candidate)) {
    return {
      canApply: false,
      reason: 'hired',
      blockMessage:
        'You are not eligible to apply while employed through our hiring process.',
    };
  }

  const activeApp = applications.find(
    (app) =>
      !isApplicationClosed(app, candidate) &&
      (!targetJobId || app.job_id !== targetJobId || !isRecruiterSyncedApplication(app.source)),
  );

  if (activeApp && (!targetJobId || activeApp.job_id !== targetJobId)) {
    const jobTitle = activeApp.job?.title || 'another role';
    return {
      canApply: false,
      reason: 'active_application',
      activeApplication: activeApp,
      blockMessage: `You already have an active application for ${jobTitle}. You can apply to other roles once this application is closed (rejected).`,
    };
  }

  return { canApply: true, reason: null };
}

export const HIRED_BLOCK_MESSAGE =
  'You are not eligible to apply while employed through our hiring process.';

export function activeApplicationBlockMessage(jobTitle: string): string {
  return `You already have an active application for ${jobTitle}. You can apply to other roles once this application is closed (rejected).`;
}

async function hasApplicantSession(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

export async function fetchMyJobApplications(): Promise<
  (ApplicationForEligibility & { applicant_email?: string })[]
> {
  const { data, error } = await supabase.rpc('list_my_job_applications');
  if (error) throw error;
  if (!data || !Array.isArray(data)) return [];
  return data as (ApplicationForEligibility & { applicant_email?: string })[];
}

export async function fetchApplicantApplicationEligibility(
  email: string,
  targetJobId?: string,
): Promise<ApplicationEligibility> {
  const normalizedEmail = normalizeApplicantEmail(email);
  const applicantSession = await hasApplicantSession();

  const appsResult = applicantSession
    ? { data: await fetchMyJobApplications(), error: null }
    : await supabase
        .from('job_applications')
        .select('id, job_id, status, source, applicant_email, job:jobs(title)')
        .ilike('applicant_email', applicantEmailIlikePattern(normalizedEmail));

  const candidateResult = applicantSession
    ? await supabase
        .from('candidates')
        .select('candidate_status, hired_at, job_id, email')
        .order('updated_at', { ascending: false })
    : await supabase
        .from('candidates')
        .select('candidate_status, hired_at, job_id, email')
        .ilike('email', applicantEmailIlikePattern(normalizedEmail))
        .maybeSingle();

  if (appsResult.error) throw appsResult.error;
  if (candidateResult.error) throw candidateResult.error;

  const applications = applicationsForEmail(
    (appsResult.data || []) as ApplicationForEligibility[],
    normalizedEmail,
  );
  const candidateRows = applicantSession
    ? ((candidateResult.data || []) as (CandidateForEligibility & { email?: string })[])
    : candidateResult.data
      ? [candidateResult.data as CandidateForEligibility & { email?: string }]
      : [];
  const candidate =
    candidateRows.find((row) => normalizeApplicantEmail(row.email ?? '') === normalizedEmail) ?? null;

  return getApplicationEligibility(applications, candidate, targetJobId);
}

export function isDuplicateKeyError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '23505' ||
    error.code === '21000' ||
    (error.message?.includes('duplicate key') ?? false) ||
    (error.message?.includes('cannot affect row a second time') ?? false)
  );
}

export function formatPortalApplyError(error: unknown): string {
  if (error instanceof Error && error.message && !isDuplicateKeyError(error)) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const err = error as { code?: string; message?: string };
    if (isDuplicateKeyError(err)) {
      return 'You already have an application for this position.';
    }
    if (err.message && !err.message.includes('duplicate key')) {
      return err.message;
    }
  }

  return 'Something went wrong. Please try again.';
}

function parsePortalApplyRpcResult(value: unknown): PortalApplyResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid application response');
  }

  const result = value as { status?: string; application_id?: string; applicationId?: string };
  const applicationId =
    typeof result.application_id === 'string'
      ? result.application_id
      : typeof result.applicationId === 'string'
        ? result.applicationId
        : '';

  if (result.status === 'created' || result.status === 'updated' || result.status === 'already_applied') {
    return { status: result.status, applicationId };
  }

  throw new Error('Invalid application response');
}

export async function submitPortalJobApplication(data: {
  job_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string | null;
  linkedin_url?: string | null;
  resume_url?: string | null;
  cover_letter?: string | null;
}): Promise<PortalApplyResult> {
  const applicantEmail = normalizeApplicantEmail(data.applicant_email);

  const eligibility = await fetchApplicantApplicationEligibility(applicantEmail, data.job_id);
  if (!eligibility.canApply) {
    if (eligibility.reason === 'already_applied' && eligibility.activeApplication?.id) {
      return { status: 'already_applied', applicationId: eligibility.activeApplication.id };
    }
    throw new Error(eligibility.blockMessage || 'You are not eligible to apply at this time');
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('portal_submit_job_application', {
    p_job_id: data.job_id,
    p_applicant_name: data.applicant_name,
    p_applicant_email: applicantEmail,
    p_applicant_phone: data.applicant_phone ?? null,
    p_linkedin_url: data.linkedin_url ?? null,
    p_resume_url: data.resume_url ?? null,
    p_cover_letter: data.cover_letter ?? null,
  });

  if (rpcError) throw new Error(formatPortalApplyError(rpcError));
  return parsePortalApplyRpcResult(rpcResult);
}
