import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, Loader2, RotateCcw, Save } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConsentText } from '@/components/portal/ConsentText';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import {
  CONSENT_LIMITS,
  DEFAULT_CONSENT_TEMPLATE,
  MEDIA_CONSENT_CONFIG_KEY,
  buildMediaConsentConfigValue,
  consentTextWarnings,
  consentVersion,
  readMediaConsentConfig,
  renderConsent,
  validateMediaConsentForm,
  type MediaConsentFields,
} from '@/lib/mediaConsent';

function useConsentVersion(fields: MediaConsentFields): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void consentVersion(fields).then((v) => {
      if (!cancelled) setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, [fields]);
  return version;
}

/**
 * Settings → Assessments → Recording consent (admins only; RLS also limits
 * system_config.assessment_media_consent to admins). Candidates get the
 * rendered text from assessment-media, which recomputes the version.
 */
export function MediaConsentSettings() {
  const { configValue, isLoading, updateAsync, isUpdating } = useSystemConfig(MEDIA_CONSENT_CONFIG_KEY);
  const saved = useMemo(() => readMediaConsentConfig(configValue), [configValue]);
  const [form, setForm] = useState<MediaConsentFields>(saved.fields);

  useEffect(() => {
    setForm(saved.fields);
  }, [saved]);

  const savedVersion = useConsentVersion(saved.fields);
  const errors = validateMediaConsentForm(form);
  const warnings = consentTextWarnings(form.consent_text);
  const isValid = Object.keys(errors).length === 0;
  const isDirty =
    form.company_name.trim() !== saved.fields.company_name ||
    form.privacy_email.trim() !== saved.fields.privacy_email ||
    form.consent_text.replace(/\r\n?/g, '\n').trim() !== saved.fields.consent_text;
  const preview = renderConsent(form.consent_text, {
    company: form.company_name.trim(),
    privacyEmail: form.privacy_email.trim(),
  });

  const save = async () => {
    await updateAsync(await buildMediaConsentConfigValue(form, new Date())).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recording consent...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Assessment recording consent</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shown to every candidate before the online assessment, which records their camera and microphone. Use{' '}
          <code className="text-xs">{'{company}'}</code> and <code className="text-xs">{'{privacyEmail}'}</code> in the
          text; they are filled in from the fields below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Current version: <Badge variant="outline" className="font-mono">{savedVersion ?? '…'}</Badge>
        </span>
        <span>Last updated: {saved.updatedAt ? new Date(saved.updatedAt).toLocaleString() : 'never (default wording)'}</span>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Saving a change to the company name, contact email or text creates a new version. Candidates who agreed to
          an earlier version are asked to read and agree again the next time they start or resume an assessment.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="consent-company">Company name</Label>
            <Input
              id="consent-company"
              value={form.company_name}
              maxLength={CONSENT_LIMITS.companyName.max}
              onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
              aria-invalid={!!errors.company_name}
            />
            {errors.company_name && <p className="text-xs text-destructive">{errors.company_name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="consent-email">Privacy contact email</Label>
            <Input
              id="consent-email"
              type="email"
              value={form.privacy_email}
              onChange={(e) => setForm((prev) => ({ ...prev, privacy_email: e.target.value }))}
              aria-invalid={!!errors.privacy_email}
            />
            {errors.privacy_email && <p className="text-xs text-destructive">{errors.privacy_email}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="consent-text">Consent text</Label>
            <Textarea
              id="consent-text"
              rows={18}
              className="font-mono text-xs"
              value={form.consent_text}
              maxLength={CONSENT_LIMITS.consentText.max}
              onChange={(e) => setForm((prev) => ({ ...prev, consent_text: e.target.value }))}
              aria-invalid={!!errors.consent_text}
            />
            <p className="text-xs text-muted-foreground">
              {form.consent_text.trim().length} / {CONSENT_LIMITS.consentText.max} characters. Use a line starting with{' '}
              <code>## </code> or a line in <code>**bold**</code> for a heading, <code>- </code> for a bullet, and a blank
              line between paragraphs.
            </p>
            {errors.consent_text && <p className="text-xs text-destructive">{errors.consent_text}</p>}
            {warnings.map((w) => (
              <p key={w} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {w}
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={!isDirty || !isValid || isUpdating}>
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save consent
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm((prev) => ({ ...prev, consent_text: DEFAULT_CONSENT_TEMPLATE }))}
              disabled={form.consent_text === DEFAULT_CONSENT_TEMPLATE}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to default wording
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Preview (what candidates see)</p>
          <div className="rounded-md border bg-muted/20 p-4" data-testid="consent-preview">
            <ConsentText text={preview} />
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Followed by the required checkbox “I have read this and I agree to be recorded during this assessment.”
              and the “I agree, start” button.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
