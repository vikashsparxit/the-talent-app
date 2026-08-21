import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Candidate } from '@/types/database';

type CandidateStub = Partial<Candidate> & Pick<Candidate, 'id'>;

/** Resolve owner display name the same way the candidates list does (`uploaded_by` → profiles). */
async function resolveOwnerName(uploadedBy: string | null | undefined): Promise<string | null> {
  if (!uploadedBy) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', uploadedBy)
    .maybeSingle();
  return profile?.full_name ?? null;
}

/** Merge a list/stub row with a full `select('*')` candidates row for the detail drawer. */
export async function fetchFullCandidate(stub: CandidateStub): Promise<Candidate> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', stub.id)
    .single();

  if (error || !data) {
    if (stub.uploaded_by && !stub.owner_name) {
      const owner_name = await resolveOwnerName(stub.uploaded_by);
      return { ...stub, owner_name } as Candidate;
    }
    return stub as Candidate;
  }

  const uploadedBy = (data as Candidate).uploaded_by ?? stub.uploaded_by;
  const owner_name = (await resolveOwnerName(uploadedBy)) ?? stub.owner_name ?? null;

  return {
    ...stub,
    ...(data as Candidate),
    skills: Array.isArray(data.skills) ? data.skills.map(String) : stub.skills ?? [],
    job_id: stub.job_id ?? (data as Candidate).job_id,
    owner_name,
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
