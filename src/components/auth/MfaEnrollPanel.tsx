import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  buildOtpAuthUri,
  generateMfaFriendlyName,
  getUnverifiedTotpFactorIds,
  getVerifiedTotpFactor,
  isMfaFactorAlreadyExistsError,
  mapMfaEnrollError,
  toQrDataUrl,
} from '@/lib/mfaEnroll';

interface MfaEnrollPanelProps {
  onEnrolled: () => void;
}

export function MfaEnrollPanel({ onEnrolled }: MfaEnrollPanelProps) {
  const { user, enrollMfa, verifyMfaEnrollment, listMfaFactors, unenrollMfa } = useAuth();
  const { toast } = useToast();
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollAttempt, setEnrollAttempt] = useState(0);

  const enrollMfaRef = useRef(enrollMfa);
  const listMfaFactorsRef = useRef(listMfaFactors);
  const unenrollMfaRef = useRef(unenrollMfa);
  enrollMfaRef.current = enrollMfa;
  listMfaFactorsRef.current = listMfaFactors;
  unenrollMfaRef.current = unenrollMfa;

  useEffect(() => {
    let cancelled = false;

    const unenrollStaleFactors = async () => {
      const { factors, error: listError } = await listMfaFactorsRef.current();
      if (listError) throw listError;

      const verified = getVerifiedTotpFactor(factors);
      if (verified) {
        return { kind: 'verified' as const, factorId: verified.id };
      }

      const staleIds = getUnverifiedTotpFactorIds(factors);
      for (const id of staleIds) {
        const { error: unenrollError } = await unenrollMfaRef.current(id);
        if (unenrollError) {
          throw unenrollError;
        }
      }

      return { kind: 'enroll' as const };
    };

    const enrollWithRetry = async () => {
      const attemptEnroll = async () => {
        const friendlyName = generateMfaFriendlyName();
        return enrollMfaRef.current(friendlyName);
      };

      let { data, error: enrollError } = await attemptEnroll();
      if (enrollError && isMfaFactorAlreadyExistsError(enrollError)) {
        if (!cancelled) {
          setError(mapMfaEnrollError(enrollError));
        }
        const { factors, error: listError } = await listMfaFactorsRef.current();
        if (listError) throw listError;
        for (const id of getUnverifiedTotpFactorIds(factors)) {
          const { error: unenrollError } = await unenrollMfaRef.current(id);
          if (unenrollError) throw unenrollError;
        }
        ({ data, error: enrollError } = await attemptEnroll());
      }

      if (enrollError || !data) {
        throw enrollError ?? new Error('Failed to start MFA enrollment');
      }

      return data;
    };

    void (async () => {
      setIsLoading(true);
      setError('');
      setFactorId('');
      setQrCode('');
      setSecret('');

      try {
        const state = await unenrollStaleFactors();
        if (cancelled) return;

        if (state.kind === 'verified') {
          setVerifiedFactorId(state.factorId);
          setIsLoading(false);
          return;
        }

        const data = await enrollWithRetry();
        if (cancelled) return;

        setFactorId(data.id);
        setQrCode(data.totp.qr_code ?? '');
        setSecret(data.totp.secret ?? '');
        setError('');
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        const enrollError = err as Error;
        setError(mapMfaEnrollError(enrollError));
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enrollAttempt]);

  const qrDataUrl = toQrDataUrl(qrCode);
  const otpAuthUri =
    secret.trim().length > 0
      ? buildOtpAuthUri({
          secret,
          accountName: user?.email ?? user?.id ?? 'user',
        })
      : '';

  const copyText = async (text: string, title: string, description: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title, description });
  };

  const handleCopy =
    (text: string, title: string, description: string) => (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void copyText(text, title, description);
    };

  const handleEnable = async () => {
    if (verifyCode.length !== 6 || !factorId) return;
    setIsVerifying(true);
    setError('');
    const { error: verifyError } = await verifyMfaEnrollment(factorId, verifyCode);
    setIsVerifying(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    toast({ title: 'Two-factor authentication enabled' });
    onEnrolled();
  };

  const handleDisable = async () => {
    if (!verifiedFactorId) return;
    setIsVerifying(true);
    const { error: unenrollError } = await unenrollMfa(verifiedFactorId);
    setIsVerifying(false);
    if (unenrollError) {
      toast({ variant: 'destructive', title: 'Failed to disable MFA', description: unenrollError.message });
      return;
    }
    setVerifiedFactorId(null);
    toast({ title: 'Two-factor authentication disabled' });
    onEnrolled();
  };

  const canEnable = verifyCode.length === 6 && factorId.length > 0 && !isVerifying;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading MFA settings...
      </div>
    );
  }

  if (verifiedFactorId) {
    return (
      <div className="space-y-4">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Two-factor authentication is enabled on your account. You will be asked for a code when signing in.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={handleDisable} disabled={isVerifying}>
          {isVerifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Disable authenticator app
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Scan the QR code with Google Authenticator, 1Password, or another TOTP app, then enter the 6-digit code to confirm.
      </p>
      {qrDataUrl ? (
        <div className="flex justify-center">
          <img src={qrDataUrl} alt="MFA QR code" className="h-40 w-40 rounded-md border bg-white p-2" />
        </div>
      ) : secret ? (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">
            QR code unavailable. Add this account manually in your authenticator app using the secret or setup link below.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Secret key</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs break-all">{secret}</code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy(
                  secret,
                  'Secret copied',
                  'Paste into your authenticator app if you cannot scan the QR code.',
                )}
                aria-label="Copy secret"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {otpAuthUri && (
            <div className="space-y-1">
              <Label className="text-xs">Setup link (otpauth URI)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-1 text-xs break-all">{otpAuthUri}</code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy(
                    otpAuthUri,
                    'Setup link copied',
                    'Some authenticator apps accept this otpauth URI directly.',
                  )}
                  aria-label="Copy setup link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {secret && qrDataUrl && (
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-2 py-1 text-xs break-all">{secret}</code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy(
              secret,
              'Secret copied',
              'Paste into your authenticator app if you cannot scan the QR code.',
            )}
            aria-label="Copy secret"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="mfa-enroll-code">Verification code</Label>
        <InputOTP
          id="mfa-enroll-code"
          maxLength={6}
          value={verifyCode}
          onChange={setVerifyCode}
          disabled={isVerifying || !factorId}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          {!factorId && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEnrollAttempt((n) => n + 1)}>
              Try again
            </Button>
          )}
        </div>
      )}
      {!factorId && !error && (
        <p className="text-sm text-muted-foreground">
          Finish loading the authenticator setup above before entering your verification code.
        </p>
      )}
      <Button type="button" onClick={handleEnable} disabled={!canEnable}>
        {isVerifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Enable two-factor authentication
      </Button>
    </div>
  );
}
