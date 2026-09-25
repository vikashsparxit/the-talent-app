import { useEffect, useState, lazy, Suspense, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Footer } from '@/components/Footer';
import { StatCard } from '@/components/ui/stat-card';
import { UpcomingInterviews } from '@/components/dashboard/UpcomingInterviews';
import { ActionItems } from '@/components/dashboard/ActionItems';
import { useDashboardMetrics } from '@/hooks/useCandidates';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useStaffHeaderConfig } from '@/contexts/StaffHeaderContext';

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

const ENTRANCE_KEY = 'dashboard-entrance-played';

function useFirstVisitEntrance() {
  const [play] = useState(() => !sessionStorage.getItem(ENTRANCE_KEY));
  useEffect(() => {
    sessionStorage.setItem(ENTRANCE_KEY, '1');
  }, []);
  return (delayMs: number): { className?: string; style?: CSSProperties } =>
    play ? { className: 'animate-enter-up', style: { animationDelay: `${delayMs}ms` } } : {};
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
    <div role="group" aria-label="Period" className={cn('flex items-center rounded-lg bg-muted p-1 shrink-0', className)}>
      {(['week', 'month'] as const).map(p => (
        <button
          key={p}
          type="button"
          aria-pressed={period === p}
          onClick={() => onChange(p)}
          className={cn(
            'h-7 rounded-sm px-3 text-label transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            period === p
              ? 'bg-card text-foreground shadow-border'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {p === 'week' ? 'This week' : 'This month'}
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
  const enter = useFirstVisitEntrance();
  const periodLabel = period === 'week' ? 'week' : 'month';

  useStaffHeaderConfig({
    onAddCandidate: canAddCandidate ? () => navigate('/database?action=add') : undefined,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    await queryClient.invalidateQueries({ queryKey: ['upcoming-interviews'] });
    await queryClient.invalidateQueries({ queryKey: ['action-items'] });
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    await queryClient.invalidateQueries({ queryKey: ['candidates'] });
  };

  return (
    <div className="flex flex-col flex-1">
      <PullToRefresh onRefresh={handleRefresh}>
        <main className="container mx-auto px-4 sm:px-6 py-4 md:py-6 lg:py-8 space-y-4 md:space-y-6 lg:space-y-8 pb-safe">
        <div {...enter(0)}>
          <PageHeader
            title="Dashboard"
            subtitle={
              isInterviewer
                ? 'Your upcoming interviews and interview stages'
                : 'Your recruitment pipeline at a glance'
            }
            actions={!isInterviewer ? (
              <PeriodToggle period={period} onChange={setPeriod} className="hidden lg:flex mt-1" />
            ) : undefined}
            className={!isInterviewer ? 'max-lg:mb-4' : undefined}
          />

          {!isInterviewer && (
            <div className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-background border-b lg:hidden">
              <PeriodToggle period={period} onChange={setPeriod} className="w-full justify-center" />
            </div>
          )}
        </div>

        {/* KPI Cards — interviewers skip these; they use Upcoming Interviews + Interview Stages */}
        {!isInterviewer && (
          <section
            aria-label="Key metrics"
            className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4', enter(100).className)}
            style={enter(100).style}
          >
            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 sm:h-44 rounded-xl" />)
            ) : (
              <>
                <StatCard
                  label="Talent pool"
                  value={(metrics?.totalCandidates ?? 0).toLocaleString()}
                  hint={metrics?.newThisPeriod ? `+${metrics.newThisPeriod.toLocaleString()} this ${periodLabel}` : `None new this ${periodLabel}`}
                  trend={metrics?.newThisPeriodTrend !== undefined && (metrics?.newThisPeriod ?? 0) > 0 ? {
                    value: Math.abs(metrics.newThisPeriodTrend),
                    isPositive: metrics.newThisPeriodTrend >= 0,
                  } : undefined}
                  href="/database"
                />

                <StatCard
                  label="Active candidates"
                  value={(metrics?.activeCandidates ?? 0).toLocaleString()}
                  total={metrics?.totalCandidates ?? 0}
                  hint={`of ${(metrics?.totalCandidates ?? 0).toLocaleString()} in the pool`}
                  series={2}
                  href="/hiring"
                />

                <StatCard
                  label="Open jobs"
                  value={(metrics?.openJobs ?? 0).toLocaleString()}
                  hint={`${(metrics?.openPositions ?? 0).toLocaleString()} open positions`}
                  href="/jobs"
                />

                <StatCard
                  label={`Hires this ${periodLabel}`}
                  value={(metrics?.hiresThisPeriod ?? 0).toLocaleString()}
                  hint="Candidates selected"
                />
              </>
            )}
          </section>
        )}

        {/* Interviewer layout */}
        {isInterviewer ? (
          <section
            className={cn('grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4', enter(200).className)}
            style={enter(200).style}
          >
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
          <section
            className={cn('grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4', enter(200).className)}
            style={enter(200).style}
          >
            <div className="order-5 lg:order-none lg:col-span-2">
              <Suspense fallback={<WidgetSkeleton />}>
                <SourcingTrend />
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
            <div className="order-2 lg:order-none">
              <ActionItems />
            </div>
            <div className="order-3 lg:order-none">
              <Suspense fallback={<WidgetSkeleton />}>
                <RecruiterLeaderboard period={period} />
              </Suspense>
            </div>
            <div className="order-6 lg:order-none lg:col-span-3">
              <Suspense fallback={<WidgetSkeleton />}>
                <JobsOverview />
              </Suspense>
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
