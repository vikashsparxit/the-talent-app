import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const updateAsync = vi.fn();
let configValue: unknown = null;
vi.mock('@/hooks/useSystemConfig', () => ({
  useSystemConfig: () => ({ configValue, isLoading: false, updateAsync, isUpdating: false }),
}));

import { MediaConsentSettings } from '@/components/settings/MediaConsentSettings';
import {
  DEFAULT_CONSENT_FIELDS,
  DEFAULT_CONSENT_TEMPLATE,
  consentTextWarnings,
  consentVersion,
  validateMediaConsentForm,
} from '@/lib/mediaConsent';

beforeEach(() => {
  updateAsync.mockReset();
  updateAsync.mockResolvedValue(undefined);
  configValue = null;
});

describe('validateMediaConsentForm', () => {
  it('accepts the defaults', () => {
    expect(validateMediaConsentForm(DEFAULT_CONSENT_FIELDS)).toEqual({});
    expect(consentTextWarnings(DEFAULT_CONSENT_TEMPLATE)).toEqual([]);
  });

  it('checks the company name length', () => {
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, company_name: '   ' }).company_name).toBeTruthy();
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, company_name: 'x'.repeat(101) }).company_name).toBeTruthy();
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, company_name: 'x'.repeat(100) })).toEqual({});
  });

  it('requires a valid email', () => {
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, privacy_email: 'privacy' }).privacy_email).toBeTruthy();
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, privacy_email: '' }).privacy_email).toBeTruthy();
  });

  it('checks the text length and requires {privacyEmail}', () => {
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, consent_text: 'Short {privacyEmail}' }).consent_text).toMatch(/at least 200/);
    expect(
      validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, consent_text: `${'x'.repeat(8000)}{privacyEmail}` }).consent_text,
    ).toMatch(/at most 8000/);
    expect(
      validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, consent_text: 'x'.repeat(300) }).consent_text,
    ).toMatch(/\{privacyEmail\}/);
  });

  it('only warns when {company} is missing', () => {
    const text = `${'x'.repeat(300)} {privacyEmail}`;
    expect(validateMediaConsentForm({ ...DEFAULT_CONSENT_FIELDS, consent_text: text })).toEqual({});
    expect(consentTextWarnings(text)).toHaveLength(1);
  });
});

describe('MediaConsentSettings', () => {
  it('previews the default wording with the placeholders filled in', async () => {
    render(<MediaConsentSettings />);
    const preview = screen.getByTestId('consent-preview');
    expect(preview).toHaveTextContent('HR/admin team at Your Company');
    expect(preview).toHaveTextContent('privacy@example.com');
    expect(preview).not.toHaveTextContent('{privacyEmail}');
    expect(screen.getByText(/never \(default wording\)/)).toBeInTheDocument();
    expect(await screen.findByText(await consentVersion(DEFAULT_CONSENT_FIELDS))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save consent/i })).toBeDisabled();
  });

  it('saves the edited fields with their new version', async () => {
    render(<MediaConsentSettings />);
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Acme' } });
    expect(screen.getByTestId('consent-preview')).toHaveTextContent('HR/admin team at Acme');

    fireEvent.click(screen.getByRole('button', { name: /save consent/i }));
    await waitFor(() => expect(updateAsync).toHaveBeenCalledTimes(1));
    const saved = updateAsync.mock.calls[0][0];
    const fields = { ...DEFAULT_CONSENT_FIELDS, company_name: 'Acme' };
    expect(saved).toMatchObject({ ...fields, version: await consentVersion(fields) });
    expect(saved.version).not.toBe(await consentVersion(DEFAULT_CONSENT_FIELDS));
    expect(typeof saved.updated_at).toBe('string');
  });

  it('blocks saving invalid input and can reset the wording', () => {
    configValue = { ...DEFAULT_CONSENT_FIELDS, company_name: 'Acme', updated_at: '2026-11-15T10:00:00Z' };
    render(<MediaConsentSettings />);
    const text = screen.getByLabelText('Consent text');
    fireEvent.change(text, { target: { value: 'Too short' } });
    expect(screen.getByText(/at least 200 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save consent/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /reset to default wording/i }));
    expect((text as HTMLTextAreaElement).value).toBe(DEFAULT_CONSENT_TEMPLATE);
    expect(screen.getByLabelText('Company name')).toHaveValue('Acme');
    expect(updateAsync).not.toHaveBeenCalled();
  });
});
