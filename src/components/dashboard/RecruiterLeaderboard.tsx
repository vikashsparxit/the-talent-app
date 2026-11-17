import { useMemo } from 'react';
import { Link } from 'react-router';
import { SectionCard } from '@/components/ui/section-card';
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecruiterPerformance } from '@/hooks/useRecruiterPerformance';
import { useAppTimezone } from '@/hooks/useSystemConfig';
import { FALLBACK_TIMEZONE, reportDateRange } from '@/lib/dashboardPeriod';

interface Props {
  period: 'week' | 'month';
}

export function RecruiterLeaderboard({ period }: Props) {
  // Same window as the dashboard's "Hires this week/month" card.
  const { data: appTimezone, isError: appTimezoneError } = useAppTimezone();
  const timezone = appTimezone ?? (appTimezoneError ? FALLBACK_TIMEZONE : null);
  const { start, end } = useMemo(
    () => (timezone ? reportDateRange(period === 'week' ? 'week' : '30', new Date(), timezone) : { start: '', end: '' }),
    [period, timezone],
  );

  const { data: stats = [], isLoading } = useRecruiterPerformance(start, end);
  const top5 = stats.slice(0, 5);

  return (
    <SectionCard
      title="Recruiter performance"
      description={period === 'week' ? 'Hires this week' : 'Hires, last 30 days'}
      actions={
        <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-muted-foreground">
          <Link to="/reports">Full report</Link>
        </Button>
      }
      className="flex h-full flex-col"
      contentClassName="flex flex-1 flex-col"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 rounded-md" />)}
        </div>
      ) : top5.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
          No recruiter activity this {period}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 px-2 pb-1 text-caption text-muted-foreground">
            <span className="flex-1">Recruiter</span>
            <span className="w-20 text-right">Hired / sourced</span>
          </div>
          <ol className="space-y-0.5">
            {top5.map(r => (
              <li
                key={r.recruiter_id}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-instant ease-out hover:bg-accent/60"
              >
                <span className="w-4 shrink-0 text-right text-caption tabular-nums text-muted-foreground">{r.rank}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-medium text-foreground outline-solid outline-1 -outline-offset-1 outline-black/10">
                  {r.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={r.recruiter_name}>{r.recruiter_name}</p>
                  <p className="text-caption tabular-nums text-muted-foreground">{r.in_pipeline} in pipeline</p>
                </div>
                <div className="w-20 shrink-0 space-y-1 text-right">
                  <p className="text-sm font-medium tabular-nums">
                    {r.hired}
                    <span className="text-muted-foreground">/{r.sourced}</span>
                  </p>
                  <SegmentedProgress
                    value={r.hired}
                    total={r.sourced}
                    ticks={12}
                    size="sm"
                    series={3}
                    label={`${r.hired} of ${r.sourced} hired`}
                    className="h-3"
                  />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </SectionCard>
  );
}
