import type { Dispatch, SetStateAction } from 'react';
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

/**
 * Show stub immediately, then replace with the full candidate row when loaded.
 * Ignores late responses if a newer open was requested (prevents cross-candidate leakage).
 */
export async function openCandidateDetailWithFetch(
  stub: CandidateStub,
  setCandidate: Dispatch<SetStateAction<Candidate | null>>,
): Promise<Candidate> {
  const requestId = stub.id;
  setCandidate(stub as Candidate);
  const full = await fetchFullCandidate(stub);
  setCandidate((prev) => {
    // Drawer closed, or another candidate opened while this fetch was in flight
    if (!prev || prev.id !== requestId || full.id !== requestId) return prev;
    return full;
  });
  return full;
}
