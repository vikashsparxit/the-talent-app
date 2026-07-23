import {
  Home,
  Users,
  Calendar,
  CalendarCheck,
  ClipboardList,
  BarChart3,
  FileSpreadsheet,
  Briefcase,
  Database,
  Settings,
  LogOut,
  Sparkles,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

export type NavRole = 'admin' | 'hr' | 'recruiter' | 'interviewer';

export interface NavItemConfig {
  label: string;
  href: string;
  roles: NavRole[];
  accessOnly?: boolean;
}

export interface NavLinkItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: NavRole[];
  action?: 'sign-out';
}

export const hiringPaths = ['/hiring', '/candidates', '/pipeline'];

export const mainNavItems: NavItemConfig[] = [
  { label: 'Dashboard', href: '/', roles: ['admin', 'hr', 'recruiter'] },
  { label: 'My Interviews', href: '/my-interviews', roles: [], accessOnly: true },
  { label: 'Hiring', href: '/hiring', roles: ['admin', 'hr', 'recruiter', 'interviewer'] },
  { label: 'Calendar', href: '/calendar', roles: ['admin', 'hr', 'recruiter', 'interviewer'] },
  { label: 'Evaluations', href: '/evaluations', roles: ['admin', 'hr', 'recruiter', 'interviewer'] },
  { label: 'Reports', href: '/reports', roles: ['admin', 'hr', 'recruiter'] },
];

export const evaluationsSubItems: NavLinkItem[] = [
  { label: 'Evaluations', href: '/evaluations', roles: ['admin', 'hr', 'recruiter', 'interviewer'], icon: ClipboardList },
  { label: 'Analytics', href: '/analytics', roles: ['admin', 'hr'], icon: BarChart3 },
  { label: 'Assessments', href: '/assessments', roles: ['admin', 'hr'], icon: FileSpreadsheet },
];

export const evaluationPaths = ['/evaluations', '/analytics', '/assessments'];

export const BOTTOM_NAV_HEIGHT = '4rem';

export function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/hiring') return hiringPaths.some(p => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function canAccessSettings(role: NavRole | null): boolean {
  return role === 'admin' || role === 'hr';
}

export function filterMainNavItems(role: NavRole | null, canAccessMyInterviews: boolean) {
  return mainNavItems.filter(item => {
    if (item.accessOnly) return canAccessMyInterviews;
    return !role || item.roles.includes(role);
  });
}

export function getBottomNavTabs(role: NavRole | null, canAccessMyInterviews: boolean): NavLinkItem[] {
  if (role === 'interviewer') {
    return [
      { label: 'Interviews', href: '/my-interviews', icon: CalendarCheck },
      { label: 'Hiring', href: '/hiring', icon: Users },
      { label: 'Calendar', href: '/calendar', icon: Calendar },
      { label: 'Evaluations', href: '/evaluations', icon: ClipboardList },
    ];
  }

  const tabs: NavLinkItem[] = [
    { label: 'Home', href: '/', icon: Home },
  ];

  if (canAccessMyInterviews) {
    tabs.push({ label: 'Interviews', href: '/my-interviews', icon: CalendarCheck });
  } else {
    tabs.push({ label: 'Calendar', href: '/calendar', icon: Calendar });
  }

  tabs.push({ label: 'Hiring', href: '/hiring', icon: Users });

  return tabs;
}

function isBottomNavHref(pathname: string, href: string) {
  if (href === '/evaluations') {
    return evaluationPaths.some(p => pathname.startsWith(p));
  }
  if (href === '/hiring') {
    return hiringPaths.some(p => pathname.startsWith(p));
  }
  return isNavActive(pathname, href);
}

export function isBottomNavTabActive(pathname: string, href: string) {
  return isBottomNavHref(pathname, href);
}

export function isMoreMenuRoute(pathname: string, role: NavRole | null, canAccessMyInterviews: boolean) {
  return getMoreMenuItems(role, canAccessMyInterviews)
    .some(item => !item.action && isNavActive(pathname, item.href));
}

export function getMoreMenuItems(role: NavRole | null, canAccessMyInterviews: boolean): NavLinkItem[] {
  const items: NavLinkItem[] = [];
  const bottomHrefs = new Set(getBottomNavTabs(role, canAccessMyInterviews).map(t => t.href));
  const canManageCandidates = role && ['admin', 'hr', 'recruiter'].includes(role);

  filterMainNavItems(role, canAccessMyInterviews).forEach(item => {
    if (bottomHrefs.has(item.href)) return;
    if (item.href === '/evaluations') {
      evaluationsSubItems
        .filter(sub => !role || sub.roles?.includes(role))
        .forEach(sub => items.push(sub));
      return;
    }
    const icon =
      item.href === '/my-interviews' ? CalendarCheck
      : item.href === '/reports' ? BarChart3
      : item.href === '/hiring' ? Users
      : item.href === '/calendar' ? Calendar
      : Home;
    items.push({ label: item.label, href: item.href, icon });
  });

  if (canManageCandidates) {
    items.push(
      { label: 'Jobs', href: '/jobs', icon: Briefcase },
      { label: 'Talent Database', href: '/database', icon: Database },
    );
  }

  if (canAccessSettings(role)) {
    items.push({ label: 'Settings', href: '/settings', icon: Settings });
  }

  items.push({ label: 'Help & Guides', href: '/help', icon: BookOpen });
  items.push({ label: 'Features Overview', href: '/features', icon: Sparkles });

  items.push({ label: 'Sign out', href: '#', icon: LogOut, action: 'sign-out' });

  return items;
}
