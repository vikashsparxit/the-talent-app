import { SocialDraftsCards } from '@/components/chitra/SocialDraftsCards';
import type { SocialDraftsLatest, SocialTweetDraft } from '@/lib/socialDrafts';

interface SocialDraftCardsProps {
  drafts: SocialTweetDraft[];
  pillars?: SocialDraftsLatest['pillars'];
  compact?: boolean;
}

export function SocialDraftCards({ drafts, pillars, compact }: SocialDraftCardsProps) {
  return (
    <SocialDraftsCards
      compact={compact}
      data={{
        generatedAt: null,
        drafts,
        pillars: pillars ?? [],
        repoUrl: 'https://github.com/vikashsparxit/the-talent-app',
      }}
    />
  );
}
