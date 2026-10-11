import { useMemo } from 'react';
import { Link } from 'react-router';
import { SectionCard } from '@/components/ui/section-card';
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecruiterPerformance } from '@/hooks/useRecruiterPerformance';
import { format, subDays } from 'date-fns';

interface Props {
  period: 'week' | 'month';
}

export function RecruiterLeaderboard({ period }: Props) {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const start = useMemo(
    () => format(subDays(new Date(), period === 'week' ? 6 : 29), 'yyyy-MM-dd'),
    [period],
  );

  const { data: stats = [], isLoading } = useRecruiterPerformance(start, today);
  const top5 = stats.slice(0, 5);

  return (
    <SectionCard
      title="Recruiter performance"
      description={`Hires from sourced candidates, last ${period === 'week' ? '7' : '30'} days`}
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-medium text-foreground outline outline-1 -outline-offset-1 outline-black/10">
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
