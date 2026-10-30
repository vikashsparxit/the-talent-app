// Settings is a single page; tabs are addressed with ?tab=<value>.
// Path-style links such as /settings/security are redirected to that form.

const ADMIN_ONLY_TABS = ['security', 'compliance', 'business', 'email', 'assessments', 'scorecards'] as const;

const SHARED_TABS = [
  'certifications',
  'colleges',
  'domains',
  'teams',
  'vendors',
  'application-questions',
  'announcements',
  'red-flag-rules',
] as const;

export interface SettingsTabAccess {
  role: string | null;
  isSuperAdmin: boolean;
  extensionTabValues?: string[];
}

/** Tab values the caller can see, in display order. */
export function visibleSettingsTabs({ role, isSuperAdmin, extensionTabValues = [] }: SettingsTabAccess): string[] {
  if (role !== 'admin' && role !== 'hr') return [];
  const isAdmin = role === 'admin';
  return [
    ...(isAdmin ? ['security', 'compliance'] : []),
    ...(isAdmin ? ['users'] : []),
    ...(isAdmin ? ADMIN_ONLY_TABS.filter((t) => t !== 'security' && t !== 'compliance') : []),
    ...SHARED_TABS,
    ...(isSuperAdmin ? ['chitra'] : []),
    ...extensionTabValues,
  ];
}

export function defaultSettingsTab(role: string | null): string {
  return role === 'hr' ? 'certifications' : 'users';
}

/** The tab to open for a ?tab= value, falling back to the role default when it is missing or not visible. */
export function resolveSettingsTab(requested: string | null | undefined, access: SettingsTabAccess): string {
  if (requested && visibleSettingsTabs(access).includes(requested)) return requested;
  return defaultSettingsTab(access.role);
}

export function settingsTabPath(tab?: string | null): string {
  return tab ? `/settings?tab=${encodeURIComponent(tab)}` : '/settings';
}
