import { format } from 'date-fns';
import { Trophy } from 'lucide-react';
import { SectionCard } from '@/components/ui/section-card';
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecruiterOfMonth } from '@/hooks/useRecruiterOfMonth';
import {
  RECRUITER_SCORE_LABELS,
  RECRUITER_SCORE_WEIGHTS,
  type RecruiterScoreKey,
} from '@/lib/recruiterOfMonth';

const BREAKDOWN: { key: RecruiterScoreKey; series: 1 | 2 | 3 | 5 }[] = [
  { key: 'hires', series: 1 },
  { key: 'advances', series: 2 },
  { key: 'onTimeFeedback', series: 3 },
  { key: 'sourced', series: 5 },
];

function initials(name: string): string {
  return name.split(/\s+/).map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2) || '?';
}

export function RecruiterSpotlight() {
  const { data, isLoading, isError } = useRecruiterOfMonth();
  const monthLabel = format(new Date(), 'MMMM yyyy');

  return (
    <SectionCard
      title="Recruiter of the month"
      description={`${monthLabel} · scored on activity`}
      actions={<Trophy className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
      className="flex h-full flex-col"
      contentClassName="flex flex-1 flex-col"
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 rounded-md" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
          Couldn't load this month's activity
        </div>
      ) : !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No recruiter activity yet this month</p>
          <p className="max-w-[28ch] text-caption text-pretty text-muted-foreground">
            Hires, stage moves, on-time feedback and sourcing will rank the team here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 outline-solid outline-1 -outline-offset-1 outline-black/10">
              {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt="" /> : null}
              <AvatarFallback className="text-sm font-medium text-foreground">{initials(data.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-title" title={data.name}>{data.name}</p>
              <p className="text-caption text-muted-foreground">{data.role === 'hr' ? 'HR' : 'Recruiter'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-kpi tabular-nums">{data.score.total.toLocaleString()}</p>
              <p className="text-caption text-muted-foreground">points</p>
            </div>
          </div>

          <ul className="space-y-2.5" aria-label="Score breakdown">
            {BREAKDOWN.map(({ key, series }) => (
              <li key={key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-caption">
                  <span className="text-foreground">{RECRUITER_SCORE_LABELS[key]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {data.score.counts[key]} × {RECRUITER_SCORE_WEIGHTS[key]} ={' '}
                    <span className="font-medium text-foreground">{data.score.points[key]}</span>
                  </span>
                </div>
                <SegmentedProgress
                  value={data.score.points[key]}
                  total={data.score.total}
                  ticks={48}
                  size="sm"
                  series={series}
                  label={`${RECRUITER_SCORE_LABELS[key]}: ${data.score.points[key]} of ${data.score.total} points`}
                  className="h-4 gap-0.5"
                />
              </li>
            ))}
          </ul>

          <p className="mt-auto text-caption text-pretty text-muted-foreground">
            {data.runnerUpTotal === null
              ? 'Only recruiter with activity this month.'
              : data.runnerUpTotal === data.score.total
                ? `Tied on points; ahead on hires and stage moves · ${data.rankedCount} ranked.`
                : `Leads the next recruiter by ${(data.score.total - data.runnerUpTotal).toLocaleString()} points · ${data.rankedCount} ranked.`}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
