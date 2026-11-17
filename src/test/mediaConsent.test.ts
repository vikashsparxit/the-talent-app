import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONSENT_COMPANY,
  DEFAULT_CONSENT_FIELDS,
  DEFAULT_CONSENT_PRIVACY_EMAIL,
  DEFAULT_CONSENT_TEMPLATE,
  consentFieldErrors,
  consentVersion,
  decideConsentRecord,
  parseConsentBlocks,
  parseMediaConsentConfig,
  renderConsent,
  resolveMediaConsent,
} from '../../supabase/functions/_shared/mediaConsent.ts';

const values = { company: 'Acme', privacyEmail: 'privacy@acme.test' };

describe('renderConsent', () => {
  it('fills {company} and {privacyEmail} everywhere', () => {
    expect(renderConsent('{company} / {privacyEmail} / {company}', values)).toBe('Acme / privacy@acme.test / Acme');
  });

  it('leaves unknown placeholders as written', () => {
    expect(renderConsent('Hi {candidate}, see {Company} and {company}', values)).toBe('Hi {candidate}, see {Company} and Acme');
  });

  it('does not interpret replacement patterns in the values', () => {
    expect(renderConsent('{company}', { company: '$& $1 $$', privacyEmail: 'x' })).toBe('$& $1 $$');
  });

  it('renders the default template with no placeholders left and no draft label', () => {
    const text = renderConsent(DEFAULT_CONSENT_TEMPLATE, values);
    expect(text).not.toMatch(/\{(company|privacyEmail)\}/);
    expect(text).not.toMatch(/draft|placeholder|to be confirmed/i);
    expect(text).toContain('**privacy@acme.test**');
    expect(text).toContain('HR/admin team at Acme');
  });
});

describe('consentVersion', () => {
  it('is stable for the same fields and ignores surrounding whitespace and CRLF', async () => {
    const a = await consentVersion(DEFAULT_CONSENT_FIELDS);
    const b = await consentVersion({
      company_name: `  ${DEFAULT_CONSENT_FIELDS.company_name} `,
      privacy_email: DEFAULT_CONSENT_FIELDS.privacy_email,
      consent_text: `${DEFAULT_CONSENT_FIELDS.consent_text.replace(/\n/g, '\r\n')}\n`,
    });
    expect(a).toMatch(/^v-[0-9a-f]{16}$/);
    expect(b).toBe(a);
  });

  it.each(['company_name', 'privacy_email', 'consent_text'] as const)('changes when %s changes', async (field) => {
    const base = await consentVersion(DEFAULT_CONSENT_FIELDS);
    const changed = await consentVersion({ ...DEFAULT_CONSENT_FIELDS, [field]: `${DEFAULT_CONSENT_FIELDS[field]}x` });
    expect(changed).not.toBe(base);
  });

  it('does not let text move between fields without changing the version', async () => {
    const a = await consentVersion({ company_name: 'ab', privacy_email: 'c@d.ef', consent_text: 'x' });
    const b = await consentVersion({ company_name: 'a', privacy_email: 'bc@d.ef', consent_text: 'x' });
    expect(a).not.toBe(b);
  });
});

describe('parseMediaConsentConfig / resolveMediaConsent', () => {
  it('uses the defaults when the row is missing or invalid', () => {
    expect(parseMediaConsentConfig(null)).toEqual(DEFAULT_CONSENT_FIELDS);
    expect(parseMediaConsentConfig({ company_name: 'Acme' })).toEqual(DEFAULT_CONSENT_FIELDS);
    expect(
      parseMediaConsentConfig({ company_name: 'Acme', privacy_email: 'not-an-email', consent_text: DEFAULT_CONSENT_TEMPLATE }),
    ).toEqual(DEFAULT_CONSENT_FIELDS);
  });

  it('ignores a stored version and recomputes it from the fields', async () => {
    const stored = { ...DEFAULT_CONSENT_FIELDS, company_name: 'Acme', version: 'v-forged', updated_at: '2026-11-15T00:00:00Z' };
    const current = await resolveMediaConsent(stored);
    expect(current.version).toBe(await consentVersion({ ...DEFAULT_CONSENT_FIELDS, company_name: 'Acme' }));
    expect(current.rendered_text).toContain('HR/admin team at Acme');
    expect(current.rendered_text).toContain(DEFAULT_CONSENT_FIELDS.privacy_email);
  });

  it('requires {privacyEmail} in the text', () => {
    expect(consentFieldErrors({ ...DEFAULT_CONSENT_FIELDS, consent_text: 'x'.repeat(300) }).consent_text).toMatch(/privacyEmail/);
    expect(consentFieldErrors(DEFAULT_CONSENT_FIELDS)).toEqual({});
  });
});

describe('decideConsentRecord', () => {
  it('stores the server version, never the client one', () => {
    expect(decideConsentRecord(null, 'v-current')).toEqual({ ok: true, consentVersion: 'v-current' });
    expect(decideConsentRecord('v-current', 'v-current')).toEqual({ ok: true, consentVersion: 'v-current' });
  });

  it('refuses a version for text the candidate did not see', () => {
    expect(decideConsentRecord('v-old', 'v-current')).toMatchObject({ ok: false, status: 409, code: 'consent_text_changed' });
  });
});

describe('parseConsentBlocks', () => {
  it('splits headings, bullets, paragraphs and bold runs', () => {
    const blocks = parseConsentBlocks('## Title\n\n**Section**\n- one **two** three\n- four\n\nPlain line\nnext line');
    expect(blocks).toEqual([
      { type: 'heading', level: 2, text: 'Title' },
      { type: 'heading', level: 3, text: 'Section' },
      {
        type: 'list',
        items: [
          [
            { text: 'one ', bold: false },
            { text: 'two', bold: true },
            { text: ' three', bold: false },
          ],
          [{ text: 'four', bold: false }],
        ],
      },
      { type: 'paragraph', lines: [[{ text: 'Plain line', bold: false }], [{ text: 'next line', bold: false }]] },
    ]);
  });

  it('keeps markup-looking text as plain text', () => {
    const blocks = parseConsentBlocks('<img src=x onerror=alert(1)>');
    expect(blocks).toEqual([{ type: 'paragraph', lines: [[{ text: '<img src=x onerror=alert(1)>', bold: false }]] }]);
  });
});

describe('consent config migration', () => {
  const sql = readFileSync(
    path.resolve(__dirname, '../../supabase/migrations/20261114000005_assessment_media_consent_config.sql'),
    'utf8',
  );

  it('seeds exactly the default wording with its version', async () => {
    const seeded = /\$consent\$([\s\S]*?)\$consent\$/.exec(sql)?.[1];
    expect(seeded).toBe(DEFAULT_CONSENT_TEMPLATE);
    expect(sql).toContain(`'company_name', '${DEFAULT_CONSENT_COMPANY}'`);
    expect(sql).toContain(`'privacy_email', '${DEFAULT_CONSENT_PRIVACY_EMAIL}'`);
    expect(sql).toContain(`'version', '${await consentVersion(DEFAULT_CONSENT_FIELDS)}'`);
    expect(sql).toContain('ON CONFLICT (config_key) DO NOTHING');
  });

  it('keeps the row admin-only and is a manual migration', () => {
    expect(sql).toMatch(/Run manually after review/);
    expect(sql).toMatch(/AS RESTRICTIVE[\s\S]*config_key <> 'assessment_media_consent'[\s\S]*has_role\(auth\.uid\(\), 'admin'/);
  });
});
