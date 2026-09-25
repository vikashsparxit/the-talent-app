import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  BarChart,
  Bar,
  Cell,
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

  const now = new Date();
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
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const { data: points = [], isLoading } = useQuery<WeekPoint[]>({
    queryKey: ['sourcing-trend'],
    staleTime: 300_000,
    queryFn: fetchSourcingTrend,
  });

  const total = points.reduce((a, p) => a + p.count, 0);
  const thisWeek = points[points.length - 1]?.count ?? 0;
  const lastWeek = points[points.length - 2]?.count ?? 0;
  const trend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const highlighted = hovered ?? points.length - 1;

  return (
    <SectionCard
      title="Candidates added"
      description={isLoading ? 'Per week, last 8 weeks' : `${total.toLocaleString()} added in the last 8 weeks`}
      padding="6"
      actions={!isLoading && trend !== null ? (
        <Badge variant={trend >= 0 ? 'success' : 'danger'} className="tabular-nums">
          {trend >= 0 ? '+' : ''}{trend}% vs last week
        </Badge>
      ) : undefined}
      className="flex h-full flex-col"
      contentClassName="flex flex-1 flex-col"
    >
      {isLoading ? (
        <Skeleton className="flex-1 min-h-[240px] rounded-lg" />
      ) : (
        <div
          className="flex-1 min-h-[240px]"
          role="img"
          aria-label={`Candidates added per week: ${points.map(p => `${p.week} ${p.count}`).join(', ')}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 8, right: 0, left: -20, bottom: 0 }}
              onMouseLeave={() => setHovered(null)}
            >
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickCount={3}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: 'none',
                  borderRadius: '10px',
                  boxShadow: 'var(--shadow-popover)',
                  fontSize: '12px',
                  fontVariantNumeric: 'tabular-nums',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
                itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
                formatter={(value: number) => [value, 'Candidates']}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={!reducedMotion}
                animationDuration={600}
                animationEasing="ease-out"
                onMouseEnter={(_, index) => setHovered(index)}
              >
                {points.map((p, i) => (
                  <Cell
                    key={p.week}
                    fill={i === highlighted ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-muted))'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
