import { Check, Copy, Twitter } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SOCIAL_PILLAR_STYLES,
  type SocialDraftsLatest,
  type SocialTweetDraft,
} from '@/lib/socialDrafts';

interface SocialDraftsCardsProps {
  data: SocialDraftsLatest;
  compact?: boolean;
  onTogglePosted?: (draftIndex: number) => void;
  togglingPostedIndex?: number | null;
}

export function SocialDraftsCards({
  data,
  compact = false,
  onTogglePosted,
  togglingPostedIndex = null,
}: SocialDraftsCardsProps) {
  const { drafts, pillars } = data;

  const copyDraft = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('Tweet copied to clipboard');
  };

  if (drafts.length === 0) return null;

  return (
    <div className={cn('space-y-2', compact ? 'mt-2' : 'space-y-4')}>
      {drafts.map((draft: SocialTweetDraft, i: number) => {
        const pillar = draft.pillar ?? pillars?.[i]?.pillar;
        const pillarStyle = pillar ? SOCIAL_PILLAR_STYLES[pillar] : null;
        const charCount = draft.charCount || draft.text.length;
        const overLimit = charCount > 280;
        const isPosted = draft.posted === true;
        const isToggling = togglingPostedIndex === i;

        return (
          <div
            key={`${draft.label}-${i}`}
            className={cn(
              'rounded-lg border bg-background/80 p-2.5 space-y-2 transition-opacity',
              compact && 'text-[11px]',
              isPosted && 'opacity-60 border-muted',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <Twitter className={cn('h-3 w-3 shrink-0', isPosted ? 'text-muted-foreground' : 'text-sky-500')} />
                {pillarStyle && pillar && (
                  <Badge className={cn('text-[9px] shrink-0 border-0 px-1.5 py-0', pillarStyle.badge)}>
                    {draft.label || pillars?.[i]?.label}
                  </Badge>
                )}
                {isPosted && (
                  <Badge className="text-[9px] shrink-0 border-0 px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <Check className="h-2.5 w-2.5 mr-0.5" />
                    Posted
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn('text-[9px] shrink-0', overLimit && 'border-destructive text-destructive')}
                >
                  {charCount}/280
                </Badge>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onTogglePosted && (
                  <Button
                    variant={isPosted ? 'secondary' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-7 px-2 text-[10px]',
                      isPosted && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300',
                    )}
                    disabled={isToggling}
                    onClick={() => onTogglePosted(i)}
                  >
                    <Check className={cn('h-3 w-3 mr-1', isPosted && 'opacity-100')} />
                    {isPosted ? 'Posted' : 'Mark posted'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => copyDraft(draft.text)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
            <p
              className={cn(
                'whitespace-pre-wrap leading-relaxed',
                compact ? 'text-[11px]' : 'text-sm',
                isPosted
                  ? 'text-muted-foreground line-through decoration-muted-foreground/60'
                  : 'text-foreground',
              )}
            >
              {draft.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
