import hiringSequenceMd from '../../docs/guides/hiring-sequence.md?raw';
import adminMd from '../../docs/guides/admin.md?raw';
import hrMd from '../../docs/guides/hr.md?raw';
import recruiterMd from '../../docs/guides/recruiter.md?raw';
import interviewerMd from '../../docs/guides/interviewer.md?raw';
import applicantMd from '../../docs/guides/applicant.md?raw';
import ossSelfHostMd from '../../docs/guides/oss-self-host.md?raw';

export type GuideId =
  | 'hiring-sequence'
  | 'admin'
  | 'hr'
  | 'recruiter'
  | 'interviewer'
  | 'applicant'
  | 'oss-self-host';

type StaffRole = 'admin' | 'hr' | 'recruiter' | 'interviewer';

export interface Guide {
  id: GuideId;
  title: string;
  description: string;
  audience: string;
  /** Empty = all staff. Admin always sees every guide. */
  roles: StaffRole[];
  content: string;
}

export const GUIDES: Guide[] = [
  {
    id: 'hiring-sequence',
    title: 'Hiring sequence',
    description: 'End-to-end flow from apply to hire — handoffs, failure paths, and key surfaces.',
    audience: 'All staff',
    roles: [],
    content: hiringSequenceMd,
  },
  {
    id: 'admin',
    title: 'Admin playbook',
    description: 'Settings tabs, users, email, assessments builder, and system configuration.',
    audience: 'Admin',
    roles: ['admin'],
    content: adminMd,
  },
  {
    id: 'hr',
    title: 'HR playbook',
    description: 'Full pipeline, eval overrides, assessment gating, and limited Settings access.',
    audience: 'HR',
    roles: ['admin', 'hr'],
    content: hrMd,
  },
  {
    id: 'recruiter',
    title: 'Recruiter playbook',
    description: 'Assigned jobs, pipeline actions, assessments, pre-screen, and interviews.',
    audience: 'Recruiter',
    roles: ['admin', 'hr', 'recruiter'],
    content: recruiterMd,
  },
  {
    id: 'interviewer',
    title: 'Interviewer playbook',
    description: 'My Interviews, feedback gate, calendar, and read-only assessment status.',
    audience: 'Interviewer',
    roles: ['admin', 'hr', 'interviewer'],
    content: interviewerMd,
  },
  {
    id: 'applicant',
    title: 'Applicant playbook',
    description: 'Careers apply, portal, digital form, exam portal, and notification prefs (reference).',
    audience: 'Candidate',
    roles: ['admin'],
    content: applicantMd,
  },
  {
    id: 'oss-self-host',
    title: 'OSS self-host quickstart',
    description: 'Supabase, edge secrets, role seeding, and smoke-test pointers for deployers.',
    audience: 'Deployer',
    roles: ['admin'],
    content: ossSelfHostMd,
  },
];

export function getGuide(id: string): Guide | undefined {
  return GUIDES.find(g => g.id === id);
}

export function getVisibleGuides(role: StaffRole | null): Guide[] {
  if (!role) return [];
  if (role === 'admin') return GUIDES;
  return GUIDES.filter(g => g.roles.length === 0 || g.roles.includes(role));
}

export const GUIDE_ROLE_COLORS: Record<string, string> = {
  'All staff': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Admin: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  HR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Recruiter: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Interviewer: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  Candidate: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Deployer: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};
