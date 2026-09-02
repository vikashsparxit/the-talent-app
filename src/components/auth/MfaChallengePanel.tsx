import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface MfaChallengePanelProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function MfaChallengePanel({ onSuccess, onCancel }: MfaChallengePanelProps) {
  const { verifyMfaLogin } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setIsLoading(true);
    const { error: verifyError } = await verifyMfaLogin(code);
    setIsLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Enter the code from your authenticator app to finish signing in.</span>
      </div>
      <div className="space-y-2">
        <Label htmlFor="mfa-login-code">Authentication code</Label>
        <InputOTP
          id="mfa-login-code"
          maxLength={6}
          value={code}
          onChange={setCode}
          disabled={isLoading}
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="w-full"
          disabled={isLoading || code.length !== 6}
          onClick={handleVerify}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify'
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isLoading}>
          Use a different account
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Lost your device? Contact your administrator to reset MFA on your account.
      </p>
    </div>
  );
}
