import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session, AuthMfaEnrollResponse, Factor } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import { LoadingScreen } from '@/components/LoadingScreen';
import {
  APPLICANT_DASHBOARD_PATH,
  APPLICANT_LOGIN_VERIFY_PATH,
  isApplicantPortalUserMetadata,
  isApplicantUser,
  isInternalStaffRole,
  isStaffUser,
  isEmailSignupConfirmation,
} from '@/lib/publicRoutes';
import { generateMfaFriendlyName } from '@/lib/mfaEnroll';

type AppRole = 'admin' | 'hr' | 'recruiter' | 'interviewer';
type ApplicantProfileStatus = 'present' | 'absent' | 'unknown';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isAdminOrHR: boolean;
  isRecruiter: boolean;
  isInterviewer: boolean;
  isSuperAdmin: boolean;
  isApplicant: boolean;
  isStaff: boolean;
  identityResolved: boolean;
  applicantPortalSynced: boolean;
  syncApplicantProfile: (hasProfile: boolean) => void;
  markApplicantPortalSynced: () => void;
  mfaPending: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; mfaRequired: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; session: Session | null }>;
  signInWithSSO: (options: { domain?: string; providerId?: string }) => Promise<{ error: Error | null }>;
  verifyMfaLogin: (code: string) => Promise<{ error: Error | null }>;
  enrollMfa: (friendlyName?: string) => Promise<{ data: AuthMfaEnrollResponse['data'] | null; error: Error | null }>;
  verifyMfaEnrollment: (factorId: string, code: string) => Promise<{ error: Error | null }>;
  unenrollMfa: (factorId: string) => Promise<{ error: Error | null }>;
  listMfaFactors: () => Promise<{ factors: Factor[]; error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasApplicantProfile, setHasApplicantProfile] = useState(false);
  const [identityResolved, setIdentityResolved] = useState(false);
  const [applicantPortalSynced, setApplicantPortalSynced] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const resolvedUserIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  const checkMfaRequired = async (): Promise<boolean> => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === 'aal2' && data.currentLevel === 'aal1';
  };

  const syncApplicantProfile = useCallback((hasProfile: boolean) => {
    setHasApplicantProfile(hasProfile);
  }, []);

  const markApplicantPortalSynced = useCallback(() => {
    setApplicantPortalSynced(true);
  }, []);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error('Request timed out'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  };

  const fetchIsApplicant = async (userId: string): Promise<ApplicantProfileStatus> => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('applicant_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle(),
        8000,
      );
      if (error) {
        console.error('Error fetching applicant profile:', error);
        return 'unknown';
      }
      return data ? 'present' : 'absent';
    } catch {
      return 'unknown';
    }
  };

  const resolveUserIdentity = async (
    userId: string,
    options?: { background?: boolean; userMetadata?: Record<string, unknown> },
  ) => {
    const background = options?.background ?? false;
    const userMetadata = options?.userMetadata;
    if (!background) {
      setIdentityResolved(false);
    }
    const [roleResult, applicantStatus, superAdmin] = await Promise.all([
      fetchUserRole(userId),
      fetchIsApplicant(userId),
      fetchSuperAdminStatus(userId),
    ]);
    const fetchedRole = roleResult.role;
    const staffRoleDetected = isInternalStaffRole(fetchedRole);
    const applicantDetected = applicantStatus === 'present';
    const applicantUnknown = applicantStatus === 'unknown';
    const applicantPortalUser = isApplicantPortalUserMetadata(userMetadata);
    const hasDeterministicIdentity =
      staffRoleDetected || applicantDetected || (applicantPortalUser && !staffRoleDetected);

    setRole(fetchedRole);
    if (!applicantUnknown) {
      setHasApplicantProfile(applicantDetected);
    }
    setIsSuperAdmin(superAdmin);
    if (applicantDetected || staffRoleDetected || applicantPortalUser) {
      setApplicantPortalSynced(true);
    }
    resolvedUserIdRef.current = userId;
    if (!hasDeterministicIdentity && roleResult.status === 'unknown') {
      // Keep identity unresolved on outages to avoid cross-role misclassification.
      setIdentityResolved(false);
      return;
    }
    setIdentityResolved(hasDeterministicIdentity);
  };

  const fetchUserRole = async (userId: string): Promise<{ role: AppRole | null; status: 'resolved' | 'unknown' }> => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle(),
        8000,
      );

      if (error) {
        console.error('Error fetching role:', error);
        return { role: null, status: 'unknown' };
      }

      return { role: (data?.role as AppRole | null) ?? null, status: 'resolved' };
    } catch (err) {
      console.error('Role fetch error:', err);
      return { role: null, status: 'unknown' };
    }
  };

  const fetchSuperAdminStatus = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('user_id', userId)
        .maybeSingle();
      return (data as any)?.is_super_admin === true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const initialSessionHandledRef = { current: false };

    const finishSessionBootstrap = () => {
      if (initialSessionHandledRef.current) return;
      initialSessionHandledRef.current = true;
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const userId = session.user.id;
          const sameUser = resolvedUserIdRef.current === userId;

          void checkMfaRequired().then(setMfaPending);

          if (
            sameUser &&
            resolvedUserIdRef.current !== null &&
            (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')
          ) {
            finishSessionBootstrap();
            return;
          }

          const needsFullResolve = resolvedUserIdRef.current === null || !sameUser;
          if (!sameUser) {
            setApplicantPortalSynced(false);
          }

          setTimeout(() => {
            void resolveUserIdentity(userId, {
              background: !needsFullResolve,
              userMetadata: session?.user?.user_metadata,
            });
          }, 0);
        } else {
          resolvedUserIdRef.current = null;
          setRole(null);
          setIsSuperAdmin(false);
          setHasApplicantProfile(false);
          setIdentityResolved(true);
          setApplicantPortalSynced(true);
          setMfaPending(false);
        }

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          finishSessionBootstrap();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error, mfaRequired: false };
      }

      const needsMfa = await checkMfaRequired();
      setMfaPending(needsMfa);
      return { error: null, mfaRequired: needsMfa };
    } catch (err) {
      return { error: err as Error, mfaRequired: false };
    }
  };

  const signInWithSSO = async (options: { domain?: string; providerId?: string }) => {
    try {
      const { data, error } = await supabase.auth.signInWithSSO({
        ...(options.providerId
          ? { providerId: options.providerId }
          : { domain: options.domain ?? '' }),
      });
      if (error) return { error };
      if (data?.url) {
        window.location.href = data.url;
      }
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const verifyMfaLogin = async (code: string) => {
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return { error: listError };

      const totpFactor = factors.totp.find((f) => f.status === 'verified') ?? factors.totp[0];
      if (!totpFactor) {
        return { error: new Error('No authenticator factor found on this account.') };
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) return { error: challengeError };

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) return { error: verifyError };

      await supabase.auth.refreshSession();
      setMfaPending(false);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const enrollMfa = async (friendlyName?: string) => {
    try {
      const name = friendlyName?.trim() || generateMfaFriendlyName();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: name,
      });
      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  };

  const verifyMfaEnrollment = async (factorId: string, code: string) => {
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) return { error: challengeError };

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) return { error: verifyError };

      await supabase.auth.refreshSession();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const unenrollMfa = async (factorId: string) => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) return { error };
      await supabase.auth.refreshSession();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const listMfaFactors = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return { factors: [], error };
      return { factors: data.totp, error: null };
    } catch (err) {
      return { factors: [], error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return { error, session: null };
      }

      return { error: null, session: data.session };
    } catch (err) {
      return { error: err as Error, session: null };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    resolvedUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setRole(null);
    setHasApplicantProfile(false);
    setIdentityResolved(true);
    setApplicantPortalSynced(true);
  };

  const isStaff = isStaffUser(role, hasApplicantProfile);

  const value = {
    user,
    session,
    loading,
    role,
    isAdmin: role === 'admin' || role === 'hr',
    isAdminOrHR: role === 'admin' || role === 'hr',
    isRecruiter: role === 'recruiter',
    isInterviewer: role === 'interviewer',
    isSuperAdmin,
    isApplicant: isApplicantUser(role, hasApplicantProfile),
    isStaff,
    identityResolved,
    applicantPortalSynced,
    syncApplicantProfile,
    markApplicantPortalSynced,
    mfaPending,
    signIn,
    signUp,
    signInWithSSO,
    verifyMfaLogin,
    enrollMfa,
    verifyMfaEnrollment,
    unenrollMfa,
    listMfaFactors,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { user, loading, isApplicant, isStaff, identityResolved, applicantPortalSynced, mfaPending } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isApplicantPortalUser = isApplicantPortalUserMetadata(user?.user_metadata);
  // Staff roles always stay in the staff app — ignore leftover portal metadata.
  const mustUseApplicantPortal = !isStaff && (isApplicant || isApplicantPortalUser);

  const identityPending =
    loading ||
    (user && !identityResolved) ||
    (user && identityResolved && isApplicant && !applicantPortalSynced);

  useEffect(() => {
    if (identityPending) {
      return;
    }

    if (!user) {
      navigate('/auth', {
        replace: true,
        state: { from: `${location.pathname}${location.search}` },
      });
      return;
    }

    if (mfaPending) {
      navigate('/auth', {
        replace: true,
        state: { from: `${location.pathname}${location.search}`, mfa: true },
      });
      return;
    }

    if (mustUseApplicantPortal) {
      navigate(
        isApplicant ? APPLICANT_DASHBOARD_PATH : APPLICANT_LOGIN_VERIFY_PATH,
        { replace: true },
      );
    }
  }, [
    user,
    identityPending,
    isApplicant,
    mustUseApplicantPortal,
    navigate,
    location.pathname,
    location.search,
    mfaPending,
  ]);

  if (identityPending) {
    return <LoadingScreen />;
  }

  if (!user || mfaPending || mustUseApplicantPortal) {
    return null;
  }

  return <>{children ?? <Outlet />}</>;
}

export function ApplicantRoute({ children }: { children: ReactNode }) {
  const { user, loading, isStaff, isApplicant, identityResolved, applicantPortalSynced } = useAuth();
  const navigate = useNavigate();

  const identityPending =
    loading ||
    (user && !identityResolved) ||
    (user && identityResolved && isApplicant && !applicantPortalSynced);
  const confirmedStaff = !identityPending && !!user && isStaff;

  useEffect(() => {
    if (confirmedStaff) {
      navigate('/', { replace: true });
    }
  }, [confirmedStaff, navigate]);

  if (identityPending) {
    return <LoadingScreen />;
  }

  if (confirmedStaff) {
    return null;
  }

  if (user && !isApplicant) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

export function RoleRestrictedRoute({
  children,
  blockedRoles,
}: {
  children: ReactNode;
  blockedRoles: AppRole[];
}) {
  const { user, loading, role, identityResolved } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && identityResolved && user && role && blockedRoles.includes(role)) {
      navigate('/');
    }
  }, [user, loading, identityResolved, role, blockedRoles, navigate]);

  if (loading || (user && !identityResolved)) {
    return <LoadingScreen />;
  }

  if (!user || (role && blockedRoles.includes(role))) {
    return null;
  }

  return <>{children}</>;
}
