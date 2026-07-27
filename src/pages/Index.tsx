import { useState, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Users, Briefcase, Database, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MetricCard } from '@/components/MetricCard';
import { UpcomingInterviews } from '@/components/dashboard/UpcomingInterviews';
import { ActionItems } from '@/components/dashboard/ActionItems';
import { useDashboardMetrics } from '@/hooks/useCandidates';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/PullToRefresh';

const RecruiterLeaderboard = lazy(() =>
  import('@/components/dashboard/RecruiterLeaderboard').then(m => ({ default: m.RecruiterLeaderboard })),
);
const InterviewStageFunnel = lazy(() =>
  import('@/components/dashboard/InterviewStageFunnel').then(m => ({ default: m.InterviewStageFunnel })),
);
const SourcingTrend = lazy(() =>
  import('@/components/dashboard/SourcingTrend').then(m => ({ default: m.SourcingTrend })),
);
const JobsOverview = lazy(() =>
  import('@/components/dashboard/JobsOverview').then(m => ({ default: m.JobsOverview })),
);

function WidgetSkeleton() {
  return <Skeleton className="h-full min-h-[280px] rounded-xl" />;
}

function PeriodToggle({
  period,
  onChange,
  className,
}: {
  period: 'week' | 'month';
  onChange: (period: 'week' | 'month') => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center rounded-lg border bg-muted/40 p-0.5 shrink-0', className)}>
      {(['week', 'month'] as const).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            period === p
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {p === 'week' ? 'This Week' : 'This Month'}
        </button>
      ))}
    </div>
  );
}

const Index = () => {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const { data: metrics, isLoading } = useDashboardMetrics(period);
  const { isInterviewer, isAdminOrHR, isRecruiter } = useAuth();
  const canAddCandidate = isAdminOrHR || isRecruiter;

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    await queryClient.invalidateQueries({ queryKey: ['upcoming-interviews'] });
    await queryClient.invalidateQueries({ queryKey: ['action-items'] });
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    await queryClient.invalidateQueries({ queryKey: ['candidates'] });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onAddCandidate={canAddCandidate ? () => navigate('/database?action=add') : undefined} />

      <PullToRefresh onRefresh={handleRefresh}>
        <main className="container mx-auto px-4 sm:px-6 py-4 md:py-6 lg:py-8 space-y-4 md:space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isInterviewer
                ? 'Your upcoming interviews and interview stages'
                : 'Your recruitment pipeline at a glance'}
            </p>
          </div>
          {!isInterviewer && (
            <PeriodToggle period={period} onChange={setPeriod} className="hidden lg:flex mt-1" />
          )}
        </div>

        {!isInterviewer && (
          <div className="sticky top-14 z-30 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b lg:hidden">
            <PeriodToggle period={period} onChange={setPeriod} className="w-full justify-center" />
          </div>
        )}

        {/* KPI Cards — interviewers skip these; they use Upcoming Interviews + Interview Stages */}
        {!isInterviewer && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 md:h-28 rounded-xl" />)
            ) : (
              <>
                <MetricCard
                  title="Talent Pool"
                  value={(metrics?.totalCandidates ?? 0).toLocaleString()}
                  icon={Database}
                  color="violet"
                  subtitle={metrics?.newThisPeriod ? `+${metrics.newThisPeriod} this ${period}` : undefined}
                  trend={metrics?.newThisPeriodTrend !== undefined && (metrics?.newThisPeriod ?? 0) > 0 ? {
                    value: Math.abs(metrics.newThisPeriodTrend),
                    isPositive: metrics.newThisPeriodTrend >= 0,
                  } : undefined}
                />

                <MetricCard
                  title="Active Candidates"
                  value={(metrics?.activeCandidates ?? 0).toLocaleString()}
                  icon={Users}
                  color="blue"
                  subtitle="in pipeline"
                />

                <MetricCard
                  title="Open Jobs"
                  value={metrics?.openJobs ?? 0}
                  icon={Briefcase}
                  color="emerald"
                  subtitle={`${metrics?.openPositions ?? 0} positions`}
                />

                <MetricCard
                  title={`Hires This ${period === 'week' ? 'Week' : 'Month'}`}
                  value={metrics?.hiresThisPeriod ?? 0}
                  icon={Trophy}
                  color="amber"
                  subtitle="selected"
                />
              </>
            )}
          </section>
        )}

        {/* Interviewer layout */}
        {isInterviewer ? (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-5">
            <div className="order-2 lg:order-none">
              <Suspense fallback={<WidgetSkeleton />}>
                <InterviewStageFunnel />
              </Suspense>
            </div>
            <div className="order-1 lg:order-none">
              <UpcomingInterviews />
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-5">
            <div className="order-3 lg:order-none">
              <Suspense fallback={<WidgetSkeleton />}>
                <RecruiterLeaderboard period={period} />
              </Suspense>
            </div>
            <div className="order-4 lg:order-none">
              <Suspense fallback={<WidgetSkeleton />}>
                <InterviewStageFunnel />
              </Suspense>
            </div>
            <div className="order-1 lg:order-none">
              <UpcomingInterviews />
            </div>
            <div className="order-5 lg:order-none">
              <Suspense fallback={<WidgetSkeleton />}>
                <SourcingTrend />
              </Suspense>
            </div>
            <div className="order-6 lg:order-none">
              <Suspense fallback={<WidgetSkeleton />}>
                <JobsOverview />
              </Suspense>
            </div>
            <div className="order-2 lg:order-none">
              <ActionItems />
            </div>
          </section>
        )}
        </main>
      </PullToRefresh>

      <Footer />
    </div>
  );
};

export default Index;
