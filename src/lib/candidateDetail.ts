import { supabase } from '@/integrations/supabase/client';
import type { Candidate } from '@/types/database';

type CandidateStub = Partial<Candidate> & Pick<Candidate, 'id'>;

/** Merge a list/stub row with a full `select('*')` candidates row for the detail drawer. */
export async function fetchFullCandidate(stub: CandidateStub): Promise<Candidate> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', stub.id)
    .single();

  if (error || !data) return stub as Candidate;

  return {
    ...stub,
    ...(data as Candidate),
    skills: Array.isArray(data.skills) ? data.skills.map(String) : stub.skills ?? [],
    job_id: stub.job_id ?? (data as Candidate).job_id,
  } as Candidate;
}

/** Show stub immediately, then replace with the full candidate row when loaded. */
export async function openCandidateDetailWithFetch(
  stub: CandidateStub,
  setCandidate: (candidate: Candidate) => void,
): Promise<Candidate> {
  setCandidate(stub as Candidate);
  const full = await fetchFullCandidate(stub);
  setCandidate(full);
  return full;
}
