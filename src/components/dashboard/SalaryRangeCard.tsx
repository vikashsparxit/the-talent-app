import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { IndianRupee } from 'lucide-react';

function fmt(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
}

interface SalaryBucket {
  label: string;
  count: number;
  minLabel: string;
  maxLabel: string;
  color: string;
}

const BUCKETS = [
  { key: 'entry',  label: 'Entry',  max: 500_000,   color: 'bg-blue-500' },
  { key: 'mid',    label: 'Mid',    max: 1_200_000, color: 'bg-violet-500' },
  { key: 'senior', label: 'Senior', max: 2_500_000, color: 'bg-amber-500' },
  { key: 'lead',   label: 'Lead+',  max: Infinity,  color: 'bg-red-500' },
];

export function SalaryRangeCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-salary-range'],
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('salary_min, salary_max, title')
        .eq('status', 'open')
        .not('salary_min', 'is', null)
        .not('salary_max', 'is', null);

      if (!data?.length) return null;

      const mins = data.map(j => j.salary_min as number);
      const maxs = data.map(j => j.salary_max as number);
      const overallMin = Math.min(...mins);
      const overallMax = Math.max(...maxs);

      let prev = 0;
      const buckets: SalaryBucket[] = BUCKETS.map(b => {
        const inBucket = data.filter(j => (j.salary_max as number) > prev && (j.salary_max as number) <= b.max);
        const bMin = inBucket.length ? Math.min(...inBucket.map(j => j.salary_min as number)) : 0;
        const bMax = inBucket.length ? Math.max(...inBucket.map(j => j.salary_max as number)) : 0;
        prev = b.max === Infinity ? prev : b.max;
        return {
          label: b.label,
          count: inBucket.length,
          minLabel: bMin ? fmt(bMin) : '—',
          maxLabel: bMax ? fmt(bMax) : '—',
          color: b.color,
        };
      }).filter(b => b.count > 0);

      return { overallMin, overallMax, buckets, totalJobs: data.length };
    },
  });

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <IndianRupee className="h-4 w-4" />
          Hiring Salary Range
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-40 rounded" />
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 rounded-lg" />)}
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-8">No salary data for open jobs</p>
        ) : (
          <>
            {/* Overall range headline */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{fmt(data.overallMin)}</span>
              <span className="text-muted-foreground">–</span>
              <span className="text-2xl font-bold">{fmt(data.overallMax)}</span>
              <span className="text-xs text-muted-foreground ml-1">across {data.totalJobs} job{data.totalJobs !== 1 ? 's' : ''}</span>
            </div>

            {/* One row per tier */}
            <div className="space-y-1.5">
              {data.buckets.map((b, i) => {
                const pct = Math.round((b.count / data.totalJobs) * 100);
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    {/* Color dot */}
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${b.color}`} />
                    {/* Tier label */}
                    <span className="text-sm font-medium w-12 shrink-0">{b.label}</span>
                    {/* Salary range */}
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{b.minLabel} – {b.maxLabel}</span>
                    {/* Bar */}
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${b.color} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Count */}
                    <div className="flex items-baseline gap-1 shrink-0 text-right">
                      <span className="text-sm font-bold">{b.count}</span>
                      <span className="text-[11px] text-muted-foreground">job{b.count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
