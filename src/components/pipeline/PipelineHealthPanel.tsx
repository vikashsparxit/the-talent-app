import { Fragment, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { PipelineScore } from '@/hooks/usePipelineAnalysis';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Letter-grade colors — brand primary is coral/red, so B must not use primary. */
const GRADE_BADGE_BG: Record<string, string> = {
  A: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700',
  B: 'bg-teal-50 border-teal-300 dark:bg-teal-900/20 dark:border-teal-700',
  C: 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700',
  D: 'bg-orange-50 border-orange-300 dark:bg-orange-900/20 dark:border-orange-700',
  F: 'bg-rose-50 border-rose-300 dark:bg-rose-900/20 dark:border-rose-700',
};

const GRADE_LETTER: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-teal-700 dark:text-teal-400',
  C: 'text-amber-700 dark:text-amber-400',
  D: 'text-orange-700 dark:text-orange-400',
  F: 'text-rose-700 dark:text-rose-400',
};

/**
 * Highlight scannable stats in AI bullet text: scores, %, day/candidate counts,
 * stage names, and key risk phrases. Deterministic regex — no NLP.
 */
const HEALTH_STAT_RE =
  /(\d+(?:\.\d+)?%|\d+\s*\/\s*\d+|\d+(?:\.\d+)?\s+(?:days?|hours?|weeks?|candidates?)|\d+\s+out\s+of\s+\d+|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+out\s+of\s+\d+|L\d+\s+Round|conversion(?:\s+rate)?|no-shows?)/gi;

function highlightHealthText(
  text: string,
  variant: 'default' | 'risk' = 'default',
): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(HEALTH_STAT_RE.source, HEALTH_STAT_RE.flags);

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={`${match.index}-${match[0]}`}
        className={cn(
          'inline rounded-md px-1 py-0.5 font-semibold tabular-nums whitespace-nowrap',
          variant === 'risk'
            ? 'bg-amber-500/15 text-amber-950 dark:bg-amber-400/20 dark:text-amber-100'
            : 'bg-muted/80 text-foreground',
        )}
      >
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

export interface PipelineHealthPanelProps {
  analysis: PipelineScore;
  jobId: string;
  scoring?: boolean;
  onRegenerate: () => void;
  /** When true, show "View full report" CTA (drawer). Reports page omits it. */
  showViewFullReport?: boolean;
  className?: string;
}

/** Shared pipeline health score card — used by Reports and Pipeline Health drawer. */
export function PipelineHealthPanel({
  analysis,
  jobId,
  scoring = false,
  onRegenerate,
  showViewFullReport = false,
  className,
}: PipelineHealthPanelProps) {
  const navigate = useNavigate();

  return (
    <div className={cn('relative rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm', className)}>
      {/* Score strip — grade + metrics in one compact baseline */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div
          className={cn(
            'flex items-baseline gap-1.5 shrink-0 rounded-md border px-2 py-1',
            GRADE_BADGE_BG[analysis.grade] ?? GRADE_BADGE_BG.C,
          )}
        >
          <span
            className={cn(
              'text-xl font-bold leading-none tabular-nums',
              GRADE_LETTER[analysis.grade] ?? GRADE_LETTER.C,
            )}
          >
            {analysis.grade}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground leading-none">
            {analysis.grade_label}
          </span>
        </div>

        <div className="flex flex-1 min-w-0 items-baseline gap-0 divide-x divide-border">
          <div className="pr-3 sm:pr-4 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground leading-none mb-0.5">
              Overall
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground leading-none">
              {analysis.overall_score}
              <span className="text-[11px] font-medium text-muted-foreground">/100</span>
            </p>
          </div>

          <div className="px-3 sm:px-4 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground leading-none mb-0.5">
              Speed
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground leading-none">
              {analysis.speed_score}%
            </p>
          </div>

          <div className="pl-3 sm:pl-4 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground leading-none mb-0.5">
              Health
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground leading-none">
              {analysis.health_score}%
            </p>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="mt-5 space-y-2.5">
        <h3 className="text-sm font-semibold text-foreground">Insights</h3>
        <ul className="space-y-2.5">
          {analysis.insights.map((ins, i) => (
            <li
              key={i}
              className="text-sm text-foreground/90 leading-relaxed pl-3 border-l-2 border-border"
            >
              {highlightHealthText(ins)}
            </li>
          ))}
        </ul>
      </div>

      {/* Risks */}
      {analysis.risks.length > 0 && (
        <div className="mt-5 rounded-lg bg-amber-500/8 border border-amber-200 dark:border-amber-800 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Risks</p>
              <ul className="space-y-2">
                {analysis.risks.map((risk, i) => (
                  <li
                    key={i}
                    className="text-sm text-amber-950/85 dark:text-amber-100/85 leading-relaxed"
                  >
                    {highlightHealthText(risk, 'risk')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Recommendation — short next step; Action Queue owns execution CTAs */}
      <div className="mt-4 rounded-lg bg-muted/40 border border-border px-4 py-3.5">
        <p className="text-sm font-semibold text-foreground mb-1.5">Recommendation</p>
        <p className="text-sm text-foreground/90 leading-relaxed">
          {highlightHealthText(analysis.recommendation)}
        </p>
        <button
          type="button"
          className="mt-2 text-xs font-medium text-primary hover:underline"
          onClick={() => navigate(`/pipeline?job=${jobId}`)}
        >
          See actions on Pipeline
        </button>
      </div>

      {/* Footer actions */}
      <div className="mt-6 pt-4 border-t border-border space-y-3">
        <p className="text-xs text-muted-foreground">
          Last generated{' '}
          {formatDistanceToNow(parseISO(analysis.generated_at), { addSuffix: true })}
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {showViewFullReport && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 btn-gradient text-primary-foreground"
              onClick={() => navigate(`/reports?job=${jobId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              View full report
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onRegenerate}
            disabled={scoring}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', scoring && 'animate-spin')} aria-hidden />
            Regenerate
          </Button>
        </div>
      </div>
    </div>
  );
}
