import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { 
  Candidate, 
  CandidateAssessment, 
  IntegrityEvent,
  AssessmentSettings,
  StructuredSkill
} from '@/types/database';
import type { Json } from '@/integrations/supabase/types';
import { fetchCandidateIdsForTag } from '@/hooks/useCandidateTags';

import { normalizeIntegrityLog } from '@/lib/integrity';

const parseIntegrityLog = (log: Json | null): IntegrityEvent[] => normalizeIntegrityLog(log);

// Helper to safely cast JSON to AssessmentSettings
const parseSettings = (settings: Json | null): AssessmentSettings => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {
      randomize_questions: false,
      show_score_immediately: false,
      allow_review: false,
    };
  }
  const s = settings as Record<string, unknown>;
  return {
    randomize_questions: Boolean(s.randomize_questions),
    show_score_immediately: Boolean(s.show_score_immediately),
    allow_review: Boolean(s.allow_review),
  };
};

// Helper to parse structured_skills JSON
const parseStructuredSkills = (skills: Json | null): StructuredSkill[] => {
  if (!skills || !Array.isArray(skills)) return [];
  return skills.map(s => {
    if (typeof s === 'object' && s !== null && !Array.isArray(s)) {
      const sk = s as Record<string, unknown>;
      return {
        name: String(sk.name || ''),
        category: String(sk.category || 'other') as StructuredSkill['category'],
        proficiency: String(sk.proficiency || 'beginner') as StructuredSkill['proficiency'],
        confidence: typeof sk.confidence === 'number' ? sk.confidence : 0.3,
        sources: Array.isArray(sk.sources) ? sk.sources.map(String) : ['manual'],
      } as StructuredSkill;
    }
    return { name: String(s), category: 'other' as const, proficiency: 'beginner' as const, confidence: 0.3, sources: ['manual' as const] };
  });
};

export type PipelineEnrollmentFilter = 'all' | 'in_pipeline' | 'not_in_job';

export interface CandidatesPageOptions {
  page?: number;
  pageSize?: number;
  mode?: 'pipeline' | 'database';
  jobId?: string;
  status?: string;
  search?: string;
  forceFullFetch?: boolean;
  pipelineFilter?: PipelineEnrollmentFilter;
  tag?: string;
}

const CANDIDATE_LIST_SELECT_LEAN = `
  id, name, email, phone, linkedin_url, role_applied, job_id, candidate_status,
  source, parse_score, enrichment_score, suitability_score, credential_score,
  experience_years, candidate_current_role, candidate_current_company,
  uploaded_by, created_at, updated_at,
  job:jobs(id, title, status)
`.trim();

const CANDIDATE_LIST_SELECT_FULL = `
  ${CANDIDATE_LIST_SELECT_LEAN},
  skills, structured_skills, skills_tags, resume_url
`.trim();

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&');
}

function applyCandidateTextSearch<T extends { or: (filters: string) => T }>(query: T, search: string): T {
  const term = search.trim();
  if (!term) return query;
  const pattern = `%${escapeIlike(term)}%`;
  return query.or(
    `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},role_applied.ilike.${pattern},candidate_current_company.ilike.${pattern},candidate_current_role.ilike.${pattern}`,
  );
}

const IN_FILTER_CHUNK = 100;

async function fetchDistinctActivePipelineCandidateIds(jobId?: string): Promise<string[]> {
  const ids = new Set<string>();
  const batchSize = 1000;
  let offset = 0;

  for (;;) {
    let batchQuery = supabase
      .from('candidate_interviews')
      .select(
        jobId
          ? 'candidate_id, job_interview_stage:job_interview_stages!inner(job_id)'
          : 'candidate_id',
      )
      .is('removed_from_pipeline_at', null);

    if (jobId) {
      batchQuery = batchQuery.eq('job_interview_stage.job_id', jobId);
    }

    const { data, error } = await batchQuery.range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (row.candidate_id) ids.add(row.candidate_id);
    }
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return [...ids];
}

function stripPipelineJoin(row: Record<string, unknown>) {
  const { candidate_interviews: _, ...candidate } = row;
  return candidate;
}

async function countCandidatesMatchingIds(
  ids: string[],
  filters: { status?: string; search?: string; tag?: string },
): Promise<number> {
  if (ids.length === 0) return 0;

  let eligibleIds = ids;
  if (filters.tag?.trim()) {
    const tagIds = await fetchCandidateIdsForTag(filters.tag);
    const tagSet = new Set(tagIds);
    eligibleIds = ids.filter((id) => tagSet.has(id));
    if (eligibleIds.length === 0) return 0;
  }

  let total = 0;
  for (let i = 0; i < eligibleIds.length; i += IN_FILTER_CHUNK) {
    const chunk = eligibleIds.slice(i, i + IN_FILTER_CHUNK);
    let countQuery = supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .in('id', chunk);

    if (filters.status) {
      countQuery = countQuery.eq('candidate_status', filters.status);
    }
    if (filters.search?.trim()) {
      countQuery = applyCandidateTextSearch(countQuery, filters.search);
    }

    const { count, error } = await countQuery;
    if (error) throw error;
    total += count ?? 0;
  }

  return total;
}

async function mapCandidatesWithOwners(data: any[]): Promise<Candidate[]> {
  const ownerIds = [...new Set((data || []).map((c: any) => c.uploaded_by).filter(Boolean))];
  const ownerMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', ownerIds);
    (profiles || []).forEach(p => { if (p.full_name) ownerMap.set(p.user_id, p.full_name); });
  }

  return (data || []).map((c: any) => ({
    ...c,
    skills: Array.isArray(c.skills) ? c.skills.map(String) : [],
    structured_skills: parseStructuredSkills(c.structured_skills as Json),
    owner_name: c.uploaded_by ? (ownerMap.get(c.uploaded_by) ?? null) : null,
  })) as Candidate[];
}

export function useCandidates(options: CandidatesPageOptions = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    page = 1,
    pageSize = 50,
    mode = 'database',
    jobId,
    status,
    search,
    forceFullFetch = false,
    pipelineFilter = 'all',
    tag,
  } = options;

  const useServerPagination = !forceFullFetch;

  const candidatesQuery = useQuery({
    queryKey: ['candidates', page, pageSize, mode, jobId, status, search, forceFullFetch, pipelineFilter, tag],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!useServerPagination) {
        let fullQuery = supabase
          .from('candidates')
          .select(CANDIDATE_LIST_SELECT_FULL)
          .order('created_at', { ascending: false });

        if (mode === 'database' && pipelineFilter === 'not_in_job') {
          fullQuery = fullQuery.is('job_id', null);
        } else if (mode === 'database' && pipelineFilter === 'in_pipeline') {
          const selectWithJoin = jobId
            ? `${CANDIDATE_LIST_SELECT_FULL}, candidate_interviews!inner(removed_from_pipeline_at, job_interview_stage:job_interview_stages!inner(job_id))`
            : `${CANDIDATE_LIST_SELECT_FULL}, candidate_interviews!inner(removed_from_pipeline_at)`;
          fullQuery = supabase
            .from('candidates')
            .select(selectWithJoin)
            .is('candidate_interviews.removed_from_pipeline_at', null)
            .order('created_at', { ascending: false });
          if (jobId) {
            fullQuery = fullQuery.eq('candidate_interviews.job_interview_stage.job_id', jobId);
          }
        }

        if (tag?.trim()) {
          const tagIds = await fetchCandidateIdsForTag(tag);
          if (tagIds.length === 0) {
            return { candidates: [] as Candidate[], totalCount: 0 };
          }
          fullQuery = fullQuery.in('id', tagIds);
        }
        const { data, error } = await fullQuery;
        if (error) throw error;
        const rawRows = mode === 'database' && pipelineFilter === 'in_pipeline'
          ? (() => {
              const seen = new Set<string>();
              return (data || []).filter((row: Record<string, unknown>) => {
                const id = row.id as string;
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
              }).map((row: Record<string, unknown>) => stripPipelineJoin(row));
            })()
          : (data || []);
        const candidates = await mapCandidatesWithOwners(rawRows);
        return { candidates, totalCount: candidates.length };
      }

      let openJobIds: string[] | null = null;
      if (mode === 'pipeline') {
        const { data: openJobs, error: jobsError } = await supabase
          .from('jobs')
          .select('id')
          .eq('status', 'open');
        if (jobsError) throw jobsError;
        openJobIds = (openJobs || []).map((j: { id: string }) => j.id);
        if (openJobIds.length === 0) {
          return { candidates: [] as Candidate[], totalCount: 0 };
        }
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const inPipeline = mode === 'database' && pipelineFilter === 'in_pipeline';
      const inPipelineByJob = inPipeline && !!jobId;

      const selectClause = inPipelineByJob
        ? `${CANDIDATE_LIST_SELECT_LEAN}, candidate_interviews!inner(removed_from_pipeline_at, job_interview_stage:job_interview_stages!inner(job_id))`
        : inPipeline
          ? `${CANDIDATE_LIST_SELECT_LEAN}, candidate_interviews!inner(removed_from_pipeline_at)`
          : CANDIDATE_LIST_SELECT_LEAN;

      let query = supabase
        .from('candidates')
        .select(selectClause, inPipeline ? undefined : { count: 'exact' })
        .order('created_at', { ascending: false });

      if (mode === 'pipeline' && openJobIds) {
        query = query.in('job_id', openJobIds);
      }
      if (jobId && !inPipelineByJob) {
        query = query.eq('job_id', jobId);
      }
      if (status) {
        query = query.eq('candidate_status', status);
      }
      if (search?.trim()) {
        query = applyCandidateTextSearch(query, search);
      }

      if (tag?.trim()) {
        const tagIds = await fetchCandidateIdsForTag(tag);
        if (tagIds.length === 0) {
          return { candidates: [] as Candidate[], totalCount: 0 };
        }
        query = query.in('id', tagIds);
      }

      if (mode === 'database' && pipelineFilter === 'not_in_job') {
        query = query.is('job_id', null);
      } else if (inPipeline) {
        query = query.is('candidate_interviews.removed_from_pipeline_at', null);
        if (inPipelineByJob) {
          query = query.eq('candidate_interviews.job_interview_stage.job_id', jobId);
        }
      }

      if (inPipeline) {
        const collected: Record<string, unknown>[] = [];
        const seen = new Set<string>();
        let offset = from;
        const step = Math.max(pageSize * 2, 50);
        let iterations = 0;

        while (collected.length < pageSize && iterations < 12) {
          const { data, error } = await query.range(offset, offset + step - 1);
          if (error) throw error;
          if (!data?.length) break;

          for (const row of data as Record<string, unknown>[]) {
            const id = row.id as string;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            collected.push(stripPipelineJoin(row));
            if (collected.length >= pageSize) break;
          }

          offset += step;
          iterations += 1;
          if (data.length < step) break;
        }

        const enrolledIds = await fetchDistinctActivePipelineCandidateIds(inPipelineByJob ? jobId : undefined);
        const totalCount = await countCandidatesMatchingIds(enrolledIds, { status, search, tag });

        const candidates = await mapCandidatesWithOwners(collected);
        return { candidates, totalCount };
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      const candidates = await mapCandidatesWithOwners(data || []);
      return { candidates, totalCount: count ?? candidates.length };
    },
  });

  const createCandidate = useMutation({
    mutationFn: async (candidate: {
      name: string;
      email: string;
      phone?: string;
      role_applied?: string;
      resume_url?: string;
      skills?: string[];
      notes?: string;
      job_id?: string;
      parse_score?: number;
      experience_years?: number;
      candidate_current_role?: string;
      candidate_current_company?: string;
      // optional override — set by upload flows
      uploaded_by?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const uploaderId = candidate.uploaded_by || user?.id;

      const { job_id, skills, uploaded_by: _ub, ...rest } = candidate;

      const { data, error } = await supabase
        .from('candidates')
        .insert({
          ...rest,
          job_id: job_id || null,
          skills: skills as unknown as Json,
          created_by: user?.id,
          uploaded_by: uploaderId || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // If uploader is a recruiter and a job is selected, auto-assign as primary
      if (uploaderId && job_id) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', uploaderId);
        const isRecruiter = (roles || []).some(r => r.role === 'recruiter');
        if (isRecruiter) {
          // Check if already assigned
          const { data: existing } = await supabase
            .from('job_recruiters')
            .select('id')
            .eq('job_id', job_id)
            .eq('recruiter_user_id', uploaderId)
            .maybeSingle();
          if (!existing) {
            // No existing rows with is_primary — this becomes primary
            const { data: hasPrimary } = await supabase
              .from('job_recruiters')
              .select('id')
              .eq('job_id', job_id)
              .eq('is_primary', true)
              .maybeSingle();
            await supabase.from('job_recruiters').insert({
              job_id,
              recruiter_user_id: uploaderId,
              assigned_by: uploaderId,
              is_primary: !hasPrimary,
            } as any);
          }
        }
      }

      return data;
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      // Invalidate pending-approval so the Pipeline page shows the new candidate immediately
      await queryClient.invalidateQueries({ queryKey: ['pending-approval'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['candidate-application-form'] });
      await queryClient.invalidateQueries({ queryKey: ['job-application-form-statuses'] });
      toast({ title: 'Candidate added successfully' });
      // Auto-score in background — enrich profile, then job-fit if a job is linked
      if (data?.id) {
        supabase.functions.invoke('enrich-profile', { body: { candidate_id: data.id } }).catch(() => {});
        if (data.job_id) {
          supabase.functions.invoke('analyze-candidate', { body: { candidate_id: data.id } }).catch(() => {});
        }
      }
    },
    onError: (error: Error) => {
      let message = error.message;
      if (error.message.includes('duplicate key')) {
        message = 'A candidate with this email already exists';
      }
      toast({ 
        variant: 'destructive', 
        title: 'Failed to add candidate', 
        description: message 
      });
    },
  });

  const updateCandidate = useMutation({
    mutationFn: async ({ id, skills, job_id, ...updates }: { 
      id: string;
      name?: string;
      email?: string;
      phone?: string;
      role_applied?: string;
      resume_url?: string;
      skills?: string[];
      notes?: string;
      job_id?: string;
      candidate_status?: string;
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (skills !== undefined) {
        updateData.skills = skills as unknown as Json;
      }
      if (job_id !== undefined) {
        updateData.job_id = job_id || null;
      }
      
      const { data, error } = await supabase
        .from('candidates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      // Job assignment may have changed — refresh pending-approval for all jobs
      await queryClient.invalidateQueries({ queryKey: ['pending-approval'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
      toast({ title: 'Candidate updated successfully' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update candidate',
        description: error.message
      });
    },
  });

  const deleteCandidate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('candidates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Candidate deleted successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to delete candidate', 
        description: error.message 
      });
    },
  });

  return {
    candidates: candidatesQuery.data?.candidates ?? [],
    totalCount: candidatesQuery.data?.totalCount ?? 0,
    isLoading: candidatesQuery.isLoading,
    error: candidatesQuery.error,
    createCandidate,
    updateCandidate,
    deleteCandidate,
    refetch: candidatesQuery.refetch,
  };
}

function stableIdKey(ids: string[]): string {
  return ids.length ? [...ids].sort().join(',') : '';
}

export function usePageCandidateCoverLetters(candidateIds: string[]) {
  const idKey = stableIdKey(candidateIds);
  return useQuery({
    queryKey: ['job-applications-page', idKey],
    enabled: candidateIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applications')
        .select('candidate_id, cover_letter')
        .in('candidate_id', candidateIds)
        .not('cover_letter', 'is', null);
      if (error) throw error;
      return (data || []) as Array<{ candidate_id: string; cover_letter: string | null }>;
    },
  });
}

export function useCandidateCoverLetter(
  candidateId: string | null | undefined,
  jobId?: string | null,
) {
  return useQuery({
    queryKey: ['candidate-cover-letter', candidateId, jobId ?? 'any'],
    enabled: !!candidateId,
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('job_applications')
        .select('cover_letter, job_id')
        .eq('candidate_id', candidateId!);

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const match = (data || []).find((row) => row.cover_letter?.trim());
      return match?.cover_letter?.trim() ?? null;
    },
  });
}

export function usePageCandidateAssessments(candidateIds: string[]) {
  const idKey = stableIdKey(candidateIds);
  return useQuery({
    queryKey: ['candidate-assessments-page', idKey],
    enabled: candidateIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_assessments')
        .select('id, candidate_id, status, access_token, assessment:assessments(title)')
        .in('candidate_id', candidateIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((ca) => ({
        ...ca,
        assessment: ca.assessment
          ? { title: (ca.assessment as { title: string }).title }
          : undefined,
      })) as Array<{
        id: string;
        candidate_id: string;
        status: CandidateAssessmentStatus;
        access_token: string;
        assessment?: { title: string };
      }>;
    },
  });
}

export function useCandidateAssessments(options?: { enabled?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const assignmentsQuery = useQuery({
    queryKey: ['candidate-assessments'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_assessments')
        .select(`
          *,
          candidate:candidates(*),
          assessment:assessments(*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(ca => ({
        ...ca,
        integrity_log: parseIntegrityLog(ca.integrity_log),
        candidate: ca.candidate ? {
          ...ca.candidate,
          skills: Array.isArray(ca.candidate.skills) ? ca.candidate.skills.map(String) : [],
          structured_skills: parseStructuredSkills(ca.candidate.structured_skills as Json),
        } : undefined,
        assessment: ca.assessment ? {
          ...ca.assessment,
          settings: parseSettings(ca.assessment.settings)
        } : undefined
      })) as CandidateAssessment[];
    },
  });

  const assignAssessment = useMutation({
    mutationFn: async ({ 
      candidate_id, 
      assessment_id, 
      deadline,
      job_id,
      assigned_by,
      assigned_via,
    }: { 
      candidate_id: string; 
      assessment_id: string; 
      deadline?: string;
      job_id?: string;
      assigned_by?: string;
      assigned_via?: 'manual' | 'job_default' | 'auto_stage';
    }) => {
      const tokenExpiresAt = deadline
        ? new Date(new Date(deadline).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('candidate_assessments')
        .insert({
          candidate_id,
          assessment_id,
          deadline,
          token_expires_at: tokenExpiresAt,
          job_id: job_id ?? null,
          assigned_by: assigned_by ?? null,
          assigned_via: assigned_via ?? 'manual',
        } as any)
        .select(`
          *,
          candidate:candidates(*),
          assessment:assessments(*)
        `)
        .single();
      
      if (error) throw error;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-assessments'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-assessment-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-job-assessment'] });
      toast({ title: 'Assessment assigned' });
    },
    onError: (error: Error) => {
      let message = error.message;
      if (error.message.includes('duplicate key')) {
        message = 'This assessment is already assigned to this candidate';
      }
      toast({ 
        variant: 'destructive', 
        title: 'Failed to assign assessment', 
        description: message 
      });
    },
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, integrity_log, ...updates }: { 
      id: string;
      status?: 'invited' | 'in_progress' | 'completed' | 'evaluated' | 'expired';
      deadline?: string;
      started_at?: string;
      completed_at?: string;
      total_score?: number;
      percentage?: number;
      passed?: boolean;
      integrity_log?: IntegrityEvent[];
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (integrity_log !== undefined) {
        updateData.integrity_log = integrity_log as unknown as Json;
      }
      
      const { data, error } = await supabase
        .from('candidate_assessments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-assessments'] });
    },
  });

  return {
    assignments: assignmentsQuery.data ?? [],
    isLoading: assignmentsQuery.isLoading,
    error: assignmentsQuery.error,
    assignAssessment,
    updateAssignment,
    refetch: assignmentsQuery.refetch,
  };
}

export function useActionItems() {
  return useQuery({
    queryKey: ['action-items'],
    staleTime: 300_000,
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        { data: staleCandidates },
        { data: urgentJobs },
        { data: expiringAssessments },
        { data: pendingVerdicts },
        { data: upcomingInterviews },
      ] = await Promise.all([
        // Candidates stuck in non-terminal status for 7+ days
        supabase
          .from('candidates')
          .select('id, name, candidate_status, updated_at, job:jobs(title)')
          .not('candidate_status', 'in', '("shortlisted","rejected","backout")')
          .lt('updated_at', sevenDaysAgo.toISOString())
          .order('updated_at', { ascending: true })
          .limit(8),
        // Open jobs with deadline in ≤5 days
        supabase
          .from('jobs')
          .select('id, title, application_deadline')
          .eq('status', 'open')
          .not('application_deadline', 'is', null)
          .lte('application_deadline', fiveDaysFromNow.toISOString())
          .gte('application_deadline', now.toISOString())
          .order('application_deadline', { ascending: true })
          .limit(5),
        // Assessments expiring within 2 days (still invited)
        supabase
          .from('candidate_assessments')
          .select('id, deadline, candidate:candidates(id, name)')
          .eq('status', 'invited')
          .not('deadline', 'is', null)
          .lte('deadline', twoDaysFromNow.toISOString())
          .gte('deadline', now.toISOString())
          .order('deadline', { ascending: true })
          .limit(5),
        // Interview verdicts pending: scheduled >1 day ago, no verdict recorded
        supabase
          .from('candidate_interviews')
          .select('id, scheduled_at, candidate:candidates(id, name), stage:job_interview_stages(stage_name)')
          .is('verdict', null)
          .not('scheduled_at', 'is', null)
          .lt('scheduled_at', oneDayAgo.toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(5),
        // Interviews scheduled in the next 24 hours
        supabase
          .from('candidate_interviews')
          .select('id, scheduled_at, interview_mode, candidate:candidates(id, name), stage:job_interview_stages(stage_name)')
          .is('verdict', null)
          .not('scheduled_at', 'is', null)
          .gte('scheduled_at', now.toISOString())
          .lte('scheduled_at', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(5),
      ]);

      return {
        staleCandidates: staleCandidates || [],
        urgentJobs: urgentJobs || [],
        expiringAssessments: expiringAssessments || [],
        pendingVerdicts: pendingVerdicts || [],
        upcomingInterviews: upcomingInterviews || [],
        totalCount:
          (staleCandidates?.length ?? 0) +
          (urgentJobs?.length ?? 0) +
          (expiringAssessments?.length ?? 0) +
          (pendingVerdicts?.length ?? 0) +
          (upcomingInterviews?.length ?? 0),
      };
    },
  });
}

export function useDashboardMetrics(period: 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: ['dashboard-metrics', period],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_metrics', { p_period: period });
      if (error) throw error;

      const metrics = (data ?? {}) as Record<string, number>;
      return {
        totalCandidates: metrics.totalCandidates ?? 0,
        activeCandidates: metrics.activeCandidates ?? 0,
        openJobs: metrics.openJobs ?? 0,
        openPositions: metrics.openPositions ?? 0,
        hiresThisPeriod: metrics.hiresThisPeriod ?? 0,
        newThisPeriod: metrics.newThisPeriod ?? 0,
        newThisPeriodTrend: metrics.newThisPeriodTrend ?? 0,
        newThisWeek: metrics.newThisPeriod ?? 0,
        newThisWeekTrend: metrics.newThisPeriodTrend ?? 0,
      };
    },
  });
}
