import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Clock,
  Timer,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useTimeVelocityMetrics,
  periodDelta,
  type TimeVelocityMetrics,
} from '@/hooks/useTimeVelocityMetrics';

function shortJobTitle(title: string): string {
  return title.length > 22 ? `${title.slice(0, 20)}…` : title;
}

function formatDays(value: number | null): string {
  if (value === null) return '—';
  return `${value}d`;
}

function DeltaBadge({ delta, invert }: { delta: number | null; invert?: boolean }) {
  if (delta === null) return null;
  const improved = invert ? delta < 0 : delta > 0;
  const worsened = invert ? delta > 0 : delta < 0;
  if (delta === 0) {
    return <span className="text-xs text-muted-foreground ml-1">no change vs prior period</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium ml-1',
        improved && 'text-emerald-600 dark:text-emerald-400',
        worsened && 'text-orange-600 dark:text-orange-400',
      )}
    >
      {improved ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
      {delta > 0 ? '+' : ''}{delta}d vs prior
    </span>
  );
}

function KpiCard({
  title,
  value,
  description,
  sample,
  delta,
  invertDelta,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  sample: number;
  delta: number | null;
  invertDelta?: boolean;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
          {sample > 0 && <span className="ml-1">· n={sample}</span>}
          <DeltaBadge delta={delta} invert={invertDelta} />
        </p>
      </CardContent>
    </Card>
  );
}

function Charts({ metrics }: { metrics: TimeVelocityMetrics }) {
  const jobHireData = metrics.per_job
    .filter(j => j.avg_time_to_hire !== null)
    .slice(0, 12)
    .map(j => ({
      name: shortJobTitle(j.job_title),
      fullTitle: j.job_title,
      days: j.avg_time_to_hire as number,
      hired: j.hired_count,
    }));

  const jobFirstIvData = metrics.per_job
    .filter(j => j.avg_time_to_first_interview !== null)
    .slice(0, 12)
    .map(j => ({
      name: shortJobTitle(j.job_title),
      fullTitle: j.job_title,
      days: j.avg_time_to_first_interview as number,
    }));

  const stageData = metrics.stage_durations.map(s => ({
    name: s.stage_name.length > 14 ? `${s.stage_name.slice(0, 12)}…` : s.stage_name,
    fullName: s.stage_name,
    days: s.avg_days,
    sample: s.sample_size,
  }));

  const barColors = [
    'hsl(var(--primary))',
    'hsl(217 91% 60%)',
    'hsl(142 76% 36%)',
    'hsl(45 93% 47%)',
    'hsl(280 65% 60%)',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time to Hire by Job</CardTitle>
          <CardDescription>Average days from candidate created to hired (current period)</CardDescription>
        </CardHeader>
        <CardContent>
          {jobHireData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No hires in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={jobHireData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} unit="d" width={36} />
                <Tooltip
                  formatter={(value: number) => [`${value} days`, 'Avg time to hire']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle ?? ''}
                />
                <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                  {jobHireData.map((_, i) => (
                    <Cell key={i} fill={barColors[i % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time to First Interview by Job</CardTitle>
          <CardDescription>Average days from candidate created to first scheduled interview</CardDescription>
        </CardHeader>
        <CardContent>
          {jobFirstIvData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No interviews scheduled in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={jobFirstIvData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} unit="d" width={36} />
                <Tooltip
                  formatter={(value: number) => [`${value} days`, 'Avg time to 1st interview']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle ?? ''}
                />
                <Bar dataKey="days" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {stageData.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Average Days per Stage
            </CardTitle>
            <CardDescription>
              Time from previous milestone to each stage&apos;s scheduled interview (current period)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(220, stageData.length * 36)}>
              <BarChart data={stageData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip
                  formatter={(value: number, _name, item) => [
                    `${value} days (n=${(item?.payload as { sample?: number })?.sample ?? '—'})`,
                    'Avg in stage',
                  ]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                />
                <Bar dataKey="days" fill="hsl(142 76% 36%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-32" /></CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-48" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[340px] w-full rounded-xl" />
        <Skeleton className="h-[340px] w-full rounded-xl" />
      </div>
    </div>
  );
}

export function TimeVelocitySection() {
  const [periodDays, setPeriodDays] = useState('30');
  const days = parseInt(periodDays, 10);
  const { data: metrics, isLoading, isError, error, refetch } = useTimeVelocityMetrics(days);

  const firstIvDelta = metrics
    ? periodDelta(metrics.current.avg_time_to_first_interview, metrics.previous.avg_time_to_first_interview)
    : null;
  const hireDelta = metrics
    ? periodDelta(metrics.current.avg_time_to_hire, metrics.previous.avg_time_to_hire)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">
          Hiring velocity metrics derived from candidate creation, interview scheduling, and explicit hire signals
          (candidates.hired_at or legacy shortlisted status).
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-muted-foreground">Period:</span>
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <AlertTriangle className="h-10 w-10 text-destructive opacity-80" />
          <div>
            <p className="font-medium text-foreground">Could not load time & velocity metrics</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {error instanceof Error ? error.message : 'Unknown error'}
              {' '}— ensure the database migration has been applied.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KpiCard
              title="Avg Time to First Interview"
              value={formatDays(metrics.current.avg_time_to_first_interview)}
              description={`First interviews scheduled in last ${days} days`}
              sample={metrics.current.first_iv_sample}
              delta={firstIvDelta}
              invertDelta
              icon={Timer}
            />
            <KpiCard
              title="Avg Time to Hire"
              value={formatDays(metrics.current.avg_time_to_hire)}
              description={`Hires completed in last ${days} days`}
              sample={metrics.current.hired_sample}
              delta={hireDelta}
              invertDelta
              icon={Clock}
            />
          </div>

          <Charts metrics={metrics} />

          {metrics.per_job.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-Job Summary</CardTitle>
                <CardDescription>All jobs with hiring activity in the current period</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t border-border overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[640px]">
                    <thead>
                      <tr className="bg-muted border-b border-border">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Job</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Activity</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Hired</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Avg → 1st IV</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Avg → Hire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.per_job.map(job => (
                        <tr key={job.job_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">{job.job_title}</td>
                          <td className="px-4 py-2.5 text-center">{job.activity_count}</td>
                          <td className="px-4 py-2.5 text-center">
                            {job.hired_count > 0
                              ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{job.hired_count}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">{formatDays(job.avg_time_to_first_interview)}</td>
                          <td className="px-4 py-2.5 text-center">{formatDays(job.avg_time_to_hire)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}