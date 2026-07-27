import { useMemo } from 'react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ArrowRight } from 'lucide-react';
import { useRecruiterPerformance } from '@/hooks/useRecruiterPerformance';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';

interface Props {
  period: 'week' | 'month';
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const avatarColor = (rank: number) =>
  rank === 1
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    : rank === 2
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    : rank === 3
    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
    : 'bg-muted text-muted-foreground';

export function RecruiterLeaderboard({ period }: Props) {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const start = useMemo(
    () => format(subDays(new Date(), period === 'week' ? 6 : 29), 'yyyy-MM-dd'),
    [period],
  );

  const { data: stats = [], isLoading } = useRecruiterPerformance(start, today);
  const top5 = stats.slice(0, 5);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          Recruiter Performance
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
          </div>
        ) : top5.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            No recruiter activity this {period}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="flex items-center text-[10px] text-muted-foreground font-medium mb-1.5 px-1">
              <span className="flex-1" />
              <span className="w-12 text-center">Sourced</span>
              <span className="w-5 text-center" />
              <span className="w-12 text-center">Hired</span>
            </div>

            <div className="space-y-1.5">
              {top5.map(r => (
                <div
                  key={r.recruiter_id}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                  {/* Medal or rank number */}
                  <div className="w-5 text-center shrink-0">
                    {MEDAL[r.rank]
                      ? <span className="text-base leading-none">{MEDAL[r.rank]}</span>
                      : <span className="text-xs text-muted-foreground font-mono">{r.rank}</span>
                    }
                  </div>

                  {/* Avatar */}
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                    avatarColor(r.rank),
                  )}>
                    {r.initials}
                  </div>

                  {/* Name */}
                  <span className="flex-1 text-sm font-medium truncate">{r.recruiter_name}</span>

                  {/* Sourced */}
                  <span className="w-12 text-center text-sm tabular-nums text-muted-foreground">
                    {r.sourced}
                  </span>

                  {/* Arrow */}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />

                  {/* Hired */}
                  <span className={cn(
                    'w-12 text-center text-sm tabular-nums font-semibold',
                    r.hired > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                  )}>
                    {r.hired > 0 ? r.hired : '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer link */}
            <p className="text-[11px] text-muted-foreground mt-auto pt-3 text-center">
              <Link to="/reports" className="hover:text-primary hover:underline transition-colors">
                View full report →
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
