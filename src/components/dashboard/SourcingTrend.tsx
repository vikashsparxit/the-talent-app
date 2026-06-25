import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { startOfWeek, subWeeks, format, parseISO } from 'date-fns';

interface WeekPoint {
  week: string;
  count: number;
}

async function fetchSourcingTrend(): Promise<WeekPoint[]> {
  const { data, error } = await supabase.rpc('get_sourcing_trend', { p_weeks: 8 });
  if (!error && Array.isArray(data)) {
    const rows = data as { week_start: string; count: number }[];
    const now = new Date();
    return rows.map((row, idx) => {
      const weekStart = parseISO(row.week_start);
      const weeksFromEnd = rows.length - 1 - idx;
      const label = weeksFromEnd === 0
        ? 'This week'
        : weeksFromEnd === 1
          ? 'Last week'
          : format(weekStart, 'MMM d');
      return { week: label, count: row.count ?? 0 };
    });
  }

  const eightWeeksAgo = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7);
  const { data: fallback } = await supabase
    .from('candidates')
    .select('created_at')
    .gte('created_at', eightWeeksAgo.toISOString());

  const buckets: WeekPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const count = (fallback || []).filter((c) => {
      const d = parseISO(c.created_at);
      return d >= weekStart && d < subWeeks(weekStart, -1);
    }).length;
    buckets.push({
      week: i === 0 ? 'This week' : i === 1 ? 'Last week' : format(weekStart, 'MMM d'),
      count,
    });
  }
  return buckets;
}

export function SourcingTrend() {
  const { data: points = [], isLoading } = useQuery<WeekPoint[]>({
    queryKey: ['sourcing-trend'],
    staleTime: 300_000,
    queryFn: fetchSourcingTrend,
  });

  const total = points.reduce((a, p) => a + p.count, 0);
  const thisWeek = points[points.length - 1]?.count ?? 0;
  const lastWeek = points[points.length - 2]?.count ?? 0;
  const trend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <TrendingUp className="h-4 w-4" />
            Sourcing Trend
          </CardTitle>
          {!isLoading && trend !== null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend >= 0
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {trend >= 0 ? '+' : ''}{trend}% vs last week
            </span>
          )}
        </div>
        {!isLoading && (
          <p className="text-xs text-muted-foreground pt-0.5">
            {total.toLocaleString()} candidates added in the last 8 weeks
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-1">
        {isLoading ? (
          <Skeleton className="flex-1 min-h-[260px] rounded-lg" />
        ) : (
          <div className="flex-1 min-h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [value, 'Candidates']}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
