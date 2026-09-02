export type SocialPillar = 'feature' | 'oss' | 'cta';

export interface SocialTweetDraft {
  pillar?: SocialPillar;
  label: string;
  text: string;
  charCount: number;
  posted?: boolean;
}

export interface SocialDraftsLatest {
  generatedAt: string | null;
  pillars?: { pillar: SocialPillar; label: string; topic: { id: string; title: string } }[];
  drafts: SocialTweetDraft[];
  repoUrl: string;
}

export interface SocialDraftsHistoryRun extends SocialDraftsLatest {
  id?: string;
}

export interface SocialDraftsHistory {
  entries: SocialDraftsHistoryRun[];
}

const DEFAULT_REPO = 'https://github.com/vikashsparxit/the-talent-app';

export const EMPTY_SOCIAL_DRAFTS_LATEST: SocialDraftsLatest = {
  generatedAt: null,
  pillars: [],
  drafts: [],
  repoUrl: DEFAULT_REPO,
};

export const EMPTY_SOCIAL_DRAFTS_HISTORY: SocialDraftsHistory = {
  entries: [],
};

/** system_config key — daily cron auto-generation on/off (default on). */
export const SOCIAL_DRAFTS_ENABLED_KEY = 'chitra_social_drafts_enabled';

export const DEFAULT_SOCIAL_DRAFTS_ENABLED = { enabled: true as boolean };

export function parseSocialDraftsEnabled(raw: unknown): boolean {
  if (raw === false) return false;
  if (raw === true) return true;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const enabled = (raw as { enabled?: unknown }).enabled;
    if (enabled === false) return false;
    if (enabled === true) return true;
  }
  // Missing row / unknown shape → keep current prod behavior (auto on)
  return true;
}

export function parseSocialDraftsLatest(raw: unknown): SocialDraftsLatest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { generatedAt: null, drafts: [], repoUrl: DEFAULT_REPO };
  }
  const o = raw as Partial<SocialDraftsLatest>;
  return {
    generatedAt: typeof o.generatedAt === 'string' ? o.generatedAt : null,
    pillars: Array.isArray(o.pillars) ? o.pillars : [],
    drafts: Array.isArray(o.drafts)
      ? o.drafts.map((d) => {
          if (!d || typeof d !== 'object') return d as SocialTweetDraft;
          const draft = d as Partial<SocialTweetDraft>;
          return {
            ...draft,
            posted: draft.posted === true,
          } as SocialTweetDraft;
        })
      : [],
    repoUrl: typeof o.repoUrl === 'string' ? o.repoUrl : DEFAULT_REPO,
  };
}

export function parseSocialDraftsHistory(raw: unknown): SocialDraftsHistory {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entries: [] };
  }
  const o = raw as Record<string, unknown>;
  const entries = Array.isArray(o.entries)
    ? o.entries
    : Array.isArray(o.runs)
      ? o.runs
      : [];
  return {
    entries: entries.map((entry) => parseSocialDraftsLatest(entry)),
  };
}

export function isSocialDraftNotification(n: {
  title?: string | null;
  link?: string | null;
}): boolean {
  return (
    (n.title?.startsWith('TTA Social Drafts') ?? false) ||
    (n.link?.includes('tab=social') ?? false)
  );
}

export const SOCIAL_PILLAR_STYLES: Record<SocialPillar, { badge: string; hint: string }> = {
  feature: {
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    hint: 'Feature spotlight',
  },
  oss: {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    hint: 'Dev / OSS / self-host',
  },
  cta: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    hint: 'Hiring tip / GitHub CTA',
  },
};
