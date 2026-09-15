import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { applicantEmailIlikePattern, normalizeApplicantEmail } from '@/lib/applicantApplicationEligibility';
import type { Candidate } from '@/types/database';

type CandidateStub = Partial<Candidate> & Pick<Candidate, 'id'>;

const AVATAR_LOOKUP_CHUNK = 100;

interface ApplicantAvatarRow {
  email: string;
  avatar_url: string | null;
}

export function candidateInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function addAvatarRows(map: Map<string, string>, rows: ApplicantAvatarRow[] | null | undefined): void {
  for (const row of rows ?? []) {
    if (!row.avatar_url) continue;
    map.set(normalizeApplicantEmail(row.email), row.avatar_url);
  }
}

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  return error.code === 'PGRST202' || message.includes('could not find the function');
}

async function lookupAvatarsViaProfiles(emails: string[]): Promise<ApplicantAvatarRow[]> {
  const rows: ApplicantAvatarRow[] = [];
  for (let i = 0; i < emails.length; i += AVATAR_LOOKUP_CHUNK) {
    const chunk = emails.slice(i, i + AVATAR_LOOKUP_CHUNK);
    const orFilter = chunk.map((email) => `email.ilike.${applicantEmailIlikePattern(email)}`).join(',');
    const { data, error } = await supabase
      .from('applicant_profiles')
      .select('email, avatar_url')
      .not('avatar_url', 'is', null)
      .or(orFilter);
    if (error) break;
    rows.push(...((data ?? []) as ApplicantAvatarRow[]));
  }
  return rows;
}

/** Staff lookup of portal photos. RPC is staff-only; falls back to applicant_profiles (admin/HR RLS). */
export async function lookupApplicantAvatarUrls(
  emails: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(emails.map((email) => (email ? normalizeApplicantEmail(email) : '')).filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += AVATAR_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + AVATAR_LOOKUP_CHUNK);
    const { data, error } = await supabase.rpc('lookup_applicant_avatars', { p_emails: chunk });
    if (error) {
      if (isMissingRpcError(error) || i === 0) {
        addAvatarRows(map, await lookupAvatarsViaProfiles(unique));
      }
      break;
    }
    addAvatarRows(map, data);
  }

  return map;
}

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

async function hydrateCandidate(stub: CandidateStub, data: Candidate | null): Promise<Candidate> {
  const email = (data ?? stub).email ?? stub.email;
  const avatars = await lookupApplicantAvatarUrls([email]);
  const avatar_url =
    (email ? avatars.get(normalizeApplicantEmail(email)) : undefined) ?? stub.avatar_url ?? null;

  if (!data) {
    if (stub.uploaded_by && !stub.owner_name) {
      const owner_name = await resolveOwnerName(stub.uploaded_by);
      return { ...stub, owner_name, avatar_url } as Candidate;
    }
    return { ...stub, avatar_url } as Candidate;
  }

  const uploadedBy = data.uploaded_by ?? stub.uploaded_by;
  const owner_name = (await resolveOwnerName(uploadedBy)) ?? stub.owner_name ?? null;

  return {
    ...stub,
    ...data,
    skills: Array.isArray(data.skills) ? data.skills.map(String) : stub.skills ?? [],
    job_id: stub.job_id ?? data.job_id,
    owner_name,
    avatar_url,
  } as Candidate;
}

async function loadCandidateRow(id: string): Promise<Candidate | null> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Candidate;
}

/** Merge a list/stub row with a full `select('*')` candidates row for the detail drawer. */
export async function fetchFullCandidate(stub: CandidateStub): Promise<Candidate> {
  return hydrateCandidate(stub, await loadCandidateRow(stub.id));
}

/** True when the opener should skip the shared-link access-denied modal. */
export function canBypassSharedProfileAccessCheck(auth: {
  isAdminOrHR: boolean;
  isSuperAdmin: boolean;
}): boolean {
  return auth.isAdminOrHR || auth.isSuperAdmin;
}

/**
 * Load a candidate by id if RLS allows this user to see the row.
 * Returns null when the row is missing or the user is not allowed to read it.
 */
export async function fetchVisibleCandidateById(id: string): Promise<Candidate | null> {
  const data = await loadCandidateRow(id);
  if (!data) return null;
  return hydrateCandidate(
    { id, name: data.name ?? '', skills: [], created_at: data.created_at ?? '', updated_at: data.updated_at ?? '' },
    data,
  );
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
