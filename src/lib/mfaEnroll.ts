export const MFA_FRIENDLY_NAME_PREFIX = 'Authenticator';

export function generateMfaFriendlyName(now = Date.now()): string {
  return `${MFA_FRIENDLY_NAME_PREFIX} ${now}`;
}

export function getUnverifiedTotpFactorIds(
  factors: ReadonlyArray<{ id: string; status: string }>,
): string[] {
  return factors.filter((factor) => factor.status === 'unverified').map((factor) => factor.id);
}

export function getVerifiedTotpFactor<T extends { id: string; status: string }>(
  factors: ReadonlyArray<T>,
): T | undefined {
  return factors.find((factor) => factor.status === 'verified');
}

export function isMfaFactorAlreadyExistsError(
  error: Pick<Error, 'message'> | null | undefined,
): boolean {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return message.includes('already exists') || message.includes('friendly name');
}

export function mapMfaEnrollError(error: Pick<Error, 'message'> | null | undefined): string {
  if (!error?.message) return 'Failed to start MFA enrollment';
  if (isMfaFactorAlreadyExistsError(error)) {
    return 'A previous setup was incomplete. Resetting…';
  }
  return error.message;
}

export function toQrDataUrl(qrCode: string | null | undefined): string {
  if (!qrCode?.trim()) return '';
  const trimmed = qrCode.trim();
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('<')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export function buildOtpAuthUri(options: {
  secret: string;
  issuer?: string;
  accountName?: string;
}): string {
  const issuer = options.issuer ?? 'SparxTalent';
  const account = options.accountName ?? 'user';
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: options.secret.replace(/\s/g, ''),
    issuer,
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
