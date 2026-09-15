const PUBLIC_PATH_PREFIXES = [
  '/auth',
  '/reset-password',
  '/careers',
  '/exam',
  '/applicant',
];

const INTERNAL_STAFF_ROLES = ['admin', 'hr', 'recruiter', 'interviewer'] as const;

export type InternalStaffRole = (typeof INTERNAL_STAFF_ROLES)[number];

export const APPLICANT_DASHBOARD_PATH = '/applicant/dashboard';
export const APPLICANT_LOGIN_VERIFY_PATH = '/applicant/login?verified=1';

export function isSafeApplicantRedirect(redirect: string | null | undefined): redirect is string {
  return !!redirect && redirect.startsWith('/applicant') && !redirect.startsWith('//');
}

export function applicantLoginPath(redirect?: string | null): string {
  if (isSafeApplicantRedirect(redirect)) {
    return `/applicant/login?redirect=${encodeURIComponent(redirect)}`;
  }
  return '/applicant/login';
}

export function applicantEmailRedirectUrl(origin: string, redirect?: string | null): string {
  const params = new URLSearchParams({ verified: '1' });
  if (isSafeApplicantRedirect(redirect)) {
    params.set('redirect', redirect);
  }
  return `${origin}/applicant/login?${params.toString()}`;
}

export function isApplicantPortalUserMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.portal === 'applicant';
}

export function isEmailSignupConfirmation(): boolean {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  const type = hashParams.get('type') ?? queryParams.get('type');
  return type === 'signup';
}

/** Supabase email-verify / magic-link callback tokens in the URL. */
export function isAuthCallbackInUrl(): boolean {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  return (
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    queryParams.has('code')
  );
}

export function isApplicantLoginVerifiedPath(pathname: string, search: string): boolean {
  return pathname === '/applicant/login' && new URLSearchParams(search).get('verified') === '1';
}

/** Applicant signup email verify landed with session tokens (any route). */
export function shouldRedirectApplicantEmailConfirm(
  metadata: Record<string, unknown> | null | undefined,
  pathname: string,
  search: string,
): boolean {
  if (!isApplicantPortalUserMetadata(metadata)) return false;
  if (isApplicantLoginVerifiedPath(pathname, search)) return false;
  return isEmailSignupConfirmation() || isAuthCallbackInUrl();
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isInternalStaffRole(role: string | null | undefined): role is InternalStaffRole {
  return !!role && (INTERNAL_STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * Applicant portal user — applicant_profiles row is the source of truth,
 * but any internal staff role (including interviewer) always wins so panel
 * members are never routed to the applicant portal.
 */
export function isApplicantUser(
  role: string | null | undefined,
  hasApplicantProfile: boolean,
): boolean {
  if (!hasApplicantProfile) return false;
  if (isInternalStaffRole(role)) return false;
  return true;
}

/** Internal staff — any staff role counts, even if an applicant_profiles row also exists. */
export function isStaffUser(
  role: string | null | undefined,
  _hasApplicantProfile?: boolean,
): boolean {
  return isInternalStaffRole(role);
}
