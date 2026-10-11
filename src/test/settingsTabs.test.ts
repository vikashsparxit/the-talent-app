import { describe, it, expect } from 'vitest';
import { resolveSettingsTab, settingsTabPath, visibleSettingsTabs } from '@/lib/settingsTabs';

describe('settings tabs', () => {
  it('builds query-string links for a tab', () => {
    expect(settingsTabPath('security')).toBe('/settings?tab=security');
    expect(settingsTabPath('application-questions')).toBe('/settings?tab=application-questions');
    expect(settingsTabPath()).toBe('/settings');
  });

  it('opens the Security tab for admins', () => {
    expect(resolveSettingsTab('security', { role: 'admin', isSuperAdmin: false })).toBe('security');
  });

  it('falls back to the role default for tabs the caller cannot see', () => {
    expect(resolveSettingsTab('security', { role: 'hr', isSuperAdmin: false })).toBe('certifications');
    expect(resolveSettingsTab('chitra', { role: 'admin', isSuperAdmin: false })).toBe('users');
    expect(resolveSettingsTab('nope', { role: 'admin', isSuperAdmin: false })).toBe('users');
    expect(resolveSettingsTab(null, { role: 'hr', isSuperAdmin: false })).toBe('certifications');
  });

  it('includes super-admin and extension tabs only when allowed', () => {
    expect(resolveSettingsTab('chitra', { role: 'admin', isSuperAdmin: true })).toBe('chitra');
    expect(
      resolveSettingsTab('social', { role: 'admin', isSuperAdmin: true, extensionTabValues: ['social'] }),
    ).toBe('social');
  });

  it('shows nothing to roles without Settings access', () => {
    expect(visibleSettingsTabs({ role: 'recruiter', isSuperAdmin: false })).toEqual([]);
    expect(visibleSettingsTabs({ role: 'admin', isSuperAdmin: false }).slice(0, 3)).toEqual([
      'security',
      'compliance',
      'users',
    ]);
  });
});
