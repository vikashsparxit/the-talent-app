import { useId, useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ConsentText } from '@/components/portal/ConsentText';
import type { MediaConsentCurrent } from '@/lib/mediaConsent';

interface MediaConsentScreenProps {
  /** The text and version from the server (assessment-media consent-status). */
  consent: MediaConsentCurrent;
  /** Called with the version of the text the candidate agreed to. */
  onAccept: (consentVersion: string) => void;
  isSubmitting?: boolean;
}

export function MediaConsentScreen({ consent, onAccept, isSubmitting = false }: MediaConsentScreenProps) {
  const [agreed, setAgreed] = useState(false);
  const checkboxId = useId();

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Video className="h-5 w-5" />
          Camera and microphone recording
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConsentText text={consent.rendered_text} className="max-h-[60vh] overflow-y-auto pr-1" />
        <div className="flex items-start gap-2">
          <Checkbox id={checkboxId} checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
          <Label htmlFor={checkboxId} className="text-sm leading-snug">
            I have read this and I agree to be recorded during this assessment.
          </Label>
        </div>
      </CardContent>
      <CardFooter>
        <Button type="button" disabled={!agreed || isSubmitting} onClick={() => onAccept(consent.version)}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          I agree, start
        </Button>
      </CardFooter>
    </Card>
  );
}
