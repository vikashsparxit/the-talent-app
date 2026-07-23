import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  buildFullName,
  splitFullName,
  buildApplicantEnrichmentFromCandidate,
  profileNeedsCandidateEnrichment,
  type CandidateEnrichmentSource,
} from '@/lib/applicantProfile';
import { normalizeApplicantEmail, applicantEmailIlikePattern } from '@/lib/applicantApplicationEligibility';
import { applicantEmailRedirectUrl, isApplicantPortalUserMetadata } from '@/lib/publicRoutes';

export interface ApplicantProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone: string | null;
  emergency_phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  avatar_url: string | null;
  dob_actual: string | null;
  dob_documented: string | null;
  gender: string | null;
  marital_status: string | null;
  blood_group: string | null;
  work_experience: any[] | null;
  education: any[] | null;
  skills: string[] | null;
  notification_prefs: Record<string, boolean> | null;
  documents: unknown[] | null;
  created_at: string;
  updated_at: string;
}

interface ApplicantAuthContextType {
  user: User | null;
  session: Session | null;
  profile: ApplicantProfile | null;
  isLoading: boolean;
  isApplicant: boolean;
  signUp: (email: string, password: string, fullName: string, postAuthRedirect?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  ensureProfile: () => Promise<void>;
  updateProfile: (updates: Record<string, any>) => Promise<{ error: Error | null; skippedFields?: string[] }>;
}

const ApplicantAuthContext = createContext<ApplicantAuthContextType | undefined>(undefined);

const NEW_PROFILE_COLUMNS = [
  'skills',
  'notification_prefs',
  'documents',
  'first_name',
  'last_name',
  'middle_name',
  'dob_actual',
  'dob_documented',
  'gender',
  'marital_status',
  'blood_group',
  'emergency_phone',
] as const;

function isMissingNewColumnError(error: { message?: string }): boolean {
  const message = error.message ?? '';
  return (
    message.includes('schema cache') ||
    (message.includes('Could not find') && NEW_PROFILE_COLUMNS.some((col) => message.includes(col)))
  );
}

function stripNewProfileColumns(payload: Record<string, unknown>): {
  stripped: Record<string, unknown>;
  removed: string[];
} {
  const removed: string[] = [];
  const stripped = { ...payload };
  for (const key of NEW_PROFILE_COLUMNS) {
    if (key in stripped) {
      removed.push(key);
      delete stripped[key];
    }
  }
  return { stripped, removed };
}

export function ApplicantAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileUserIdRef = useRef<string | null>(null);
  const { toast } = useToast();
  const { syncApplicantProfile, markApplicantPortalSynced } = useAuth();

  const applyProfile = (nextProfile: ApplicantProfile | null, userId?: string) => {
    setProfile(nextProfile);
    syncApplicantProfile(!!nextProfile);
    markApplicantPortalSynced();
    profileUserIdRef.current = userId ?? nextProfile?.user_id ?? null;
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('applicant_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching applicant profile:', error);
      return null;
    }
    return data as ApplicantProfile | null;
  };

  const fetchMatchingCandidate = async (email: string): Promise<CandidateEnrichmentSource | null> => {
    const { data: candidateRow } = await supabase
      .from('candidates')
      .select('name, phone, resume_url, linkedin_url, work_experience, education, skills, skills_tags')
      .ilike('email', applicantEmailIlikePattern(email))
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return candidateRow;
  };

  const ensureApplicantProfile = async (authUser: User, fallbackEmail?: string) => {
    const email = normalizeApplicantEmail(authUser.email ?? fallbackEmail ?? '');
    const fullName = String(authUser.user_metadata?.full_name ?? email.split('@')[0] ?? 'Applicant');
    const nameParts = splitFullName(fullName);
    const existingProfile = await fetchProfile(authUser.id);

    if (existingProfile) {
      const authEmail = email;
      if (authEmail && normalizeApplicantEmail(existingProfile.email) !== authEmail) {
        await supabase
          .from('applicant_profiles')
          .update({ email: authEmail })
          .eq('user_id', authUser.id);
        const synced = await fetchProfile(authUser.id);
        applyProfile(synced, authUser.id);
        return;
      }

      if (authEmail) {
        const candidateRow = await fetchMatchingCandidate(authEmail);
        if (candidateRow && profileNeedsCandidateEnrichment(existingProfile, candidateRow)) {
          const enrichment = buildApplicantEnrichmentFromCandidate(existingProfile, candidateRow, {
            fullName,
            firstName: nameParts.first_name,
            lastName: nameParts.last_name,
            middleName: nameParts.middle_name,
          });
          if (Object.keys(enrichment).length > 0) {
            await supabase
              .from('applicant_profiles')
              .update(enrichment)
              .eq('user_id', authUser.id);
            const enriched = await fetchProfile(authUser.id);
            applyProfile(enriched, authUser.id);
            return;
          }
        }
      }

      applyProfile(existingProfile, authUser.id);
      return;
    }

    const candidateRow = email ? await fetchMatchingCandidate(email) : null;
    const enrichment = candidateRow
      ? buildApplicantEnrichmentFromCandidate(null, candidateRow, {
          fullName,
          firstName: nameParts.first_name,
          lastName: nameParts.last_name,
          middleName: nameParts.middle_name,
        })
      : {};

    await supabase.from('applicant_profiles').insert({
      user_id: authUser.id,
      email,
      full_name: (enrichment.full_name as string | undefined) || candidateRow?.name || fullName,
      first_name: (enrichment.first_name as string | undefined) || nameParts.first_name || candidateRow?.name || fullName,
      last_name: (enrichment.last_name as string | undefined) ?? nameParts.last_name ?? null,
      middle_name: (enrichment.middle_name as string | undefined) ?? nameParts.middle_name,
      phone: (enrichment.phone as string | undefined) ?? candidateRow?.phone ?? null,
      resume_url: (enrichment.resume_url as string | undefined) ?? candidateRow?.resume_url ?? null,
      linkedin_url: (enrichment.linkedin_url as string | undefined) ?? candidateRow?.linkedin_url ?? null,
      work_experience: (enrichment.work_experience as unknown[] | undefined) ?? candidateRow?.work_experience ?? undefined,
      education: (enrichment.education as unknown[] | undefined) ?? candidateRow?.education ?? undefined,
      skills: (enrichment.skills as string[] | undefined) ?? undefined,
    });
    const newProfile = await fetchProfile(authUser.id);
    applyProfile(newProfile, authUser.id);
  };

  useEffect(() => {
    const initialSessionHandledRef = { current: false };

    const finishSessionBootstrap = () => {
      if (initialSessionHandledRef.current) return;
      initialSessionHandledRef.current = true;
      setIsLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const userId = currentSession.user.id;
          const sameUser = profileUserIdRef.current === userId;

          if (event === 'SIGNED_IN' && isApplicantPortalUserMetadata(currentSession.user.user_metadata)) {
            void ensureApplicantProfile(currentSession.user);
          }

          if ((event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && sameUser) {
            if (event === 'INITIAL_SESSION') {
              finishSessionBootstrap();
            }
            return;
          }

          setTimeout(() => {
            void fetchProfile(userId).then((p) => {
              applyProfile(p, userId);
            });
          }, 0);
        } else {
          profileUserIdRef.current = null;
          setProfile(null);
          syncApplicantProfile(false);
          markApplicantPortalSynced();
        }

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          finishSessionBootstrap();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string, postAuthRedirect?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: applicantEmailRedirectUrl(window.location.origin, postAuthRedirect),
          data: {
            full_name: fullName,
            portal: 'applicant',
          },
        },
      });

      if (error) return { error };

      if (data.user && data.session) {
        await ensureApplicantProfile(data.user, email);
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };

      if (data.user) {
        await ensureApplicantProfile(data.user, email);
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    profileUserIdRef.current = null;
    applyProfile(null);
  };

  const ensureProfile = async () => {
    if (!user) return;
    await ensureApplicantProfile(user);
  };

  const updateProfile = async (updates: Record<string, any>) => {
    if (!user) {
      return { error: new Error('Not authenticated') };
    }

    const payload: Record<string, unknown> = {};
    const allowedFields = [
      'full_name',
      'first_name',
      'last_name',
      'middle_name',
      'phone',
      'emergency_phone',
      'linkedin_url',
      'resume_url',
      'avatar_url',
      'dob_actual',
      'dob_documented',
      'gender',
      'marital_status',
      'blood_group',
      'work_experience',
      'education',
      'skills',
      'notification_prefs',
      'documents',
    ];
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        payload[key] = updates[key];
      }
    }

    if (
      updates.first_name !== undefined ||
      updates.middle_name !== undefined ||
      updates.last_name !== undefined
    ) {
      const firstName = String(updates.first_name ?? profile?.first_name ?? '');
      const middleName = updates.middle_name !== undefined
        ? updates.middle_name
        : profile?.middle_name;
      const lastName = String(updates.last_name ?? profile?.last_name ?? '');
      payload.full_name = buildFullName(firstName, middleName, lastName);
    }

    if (Object.keys(payload).length === 0) {
      return { error: new Error('No profile fields to update') };
    }

    let { error } = await supabase
      .from('applicant_profiles')
      .update(payload)
      .eq('user_id', user.id);

    let skippedFields: string[] | undefined;

    if (error && isMissingNewColumnError(error)) {
      const { stripped, removed } = stripNewProfileColumns(payload);
      if (removed.length > 0 && Object.keys(stripped).length > 0) {
        const retry = await supabase
          .from('applicant_profiles')
          .update(stripped)
          .eq('user_id', user.id);

        if (!retry.error) {
          error = null;
          skippedFields = removed;
        } else {
          error = retry.error;
        }
      } else if (removed.length > 0) {
        return {
          error: new Error(
            'Some profile fields are not available yet. Core profile fields can still be saved.',
          ),
          skippedFields: removed,
        };
      }
    }

    if (error) {
      return { error: error as Error, skippedFields };
    }

    const updated = await fetchProfile(user.id);
    applyProfile(updated, user.id);

    return { error: null, skippedFields };
  };

  const value: ApplicantAuthContextType = {
    user,
    session,
    profile,
    isLoading,
    isApplicant: !!profile,
    signUp,
    signIn,
    signOut,
    ensureProfile,
    updateProfile,
  };

  return (
    <ApplicantAuthContext.Provider value={value}>
      {children}
    </ApplicantAuthContext.Provider>
  );
}

export function useApplicantAuth() {
  const context = useContext(ApplicantAuthContext);
  if (context === undefined) {
    throw new Error('useApplicantAuth must be used within an ApplicantAuthProvider');
  }
  return context;
}