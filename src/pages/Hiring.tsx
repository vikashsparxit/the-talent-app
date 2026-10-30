import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { LayoutGrid, List } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { PageHeader } from '@/components/PageHeader';
import { useStaffHeaderConfig } from '@/contexts/StaffHeaderContext';
import { HiringJobPicker } from '@/components/HiringJobPicker';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import Pipeline from '@/pages/Pipeline';
import Candidates from '@/pages/Candidates';

export function HiringLegacyRedirect({ view }: { view: 'board' | 'list' }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (!params.has('view')) {
    params.set('view', view);
  }
  return <Navigate to={`/hiring?${params.toString()}`} replace />;
}

export default function Hiring() {
  usePageTitle('Hiring');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  // Interviewers/panel members get Pipeline for jobs they're assigned to (RLS-scoped).
  const canAccessBoard = !!role && ['admin', 'hr', 'recruiter', 'interviewer'].includes(role);

  const viewParam = searchParams.get('view');
  const hasProfileLink = searchParams.has('profile');
  const view: 'board' | 'list' =
    viewParam === 'list' || (hasProfileLink && viewParam !== 'board')
      ? 'list'
      : viewParam === 'board' && canAccessBoard ? 'board'
      : canAccessBoard ? 'board'
      : 'list';

  useEffect(() => {
    const current = searchParams.get('view');
    if (!canAccessBoard && current !== 'list') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', 'list');
        return next;
      }, { replace: true });
      return;
    }
    if (!current) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', hasProfileLink || !canAccessBoard ? 'list' : 'board');
        return next;
      }, { replace: true });
    }
  }, [canAccessBoard, viewParam, hasProfileLink, setSearchParams]);

  const setView = (nextView: 'board' | 'list') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', nextView);
      return next;
    }, { replace: true });
  };

  useStaffHeaderConfig({
    onAddCandidate: () => navigate('/hiring?view=list&action=add'),
  });

  return (
    <div className="flex flex-col flex-1 min-w-0 max-w-full">
      <main
        className={cn(
          'container mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6 pb-safe min-w-0 max-w-full',
          view === 'board' && canAccessBoard && 'flex-1',
        )}
      >
        <PageHeader
          title="Hiring"
          subtitle={view === 'board' ? 'Kanban pipeline by interview stage' : 'All candidates by job'}
          actions={canAccessBoard ? (
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(value) => value && setView(value as 'board' | 'list')}
              aria-label="Hiring view"
              className="gap-0 rounded-lg bg-muted p-1"
            >
              {([
                { value: 'board', label: 'Board', icon: LayoutGrid },
                { value: 'list', label: 'List', icon: List },
              ] as const).map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={`${label} view`}
                  className="h-7 gap-1.5 rounded-sm px-3 text-label text-muted-foreground transition-colors duration-fast ease-out hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-border"
                >
                  <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                  <span className="hidden sm:inline">{label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : undefined}
        />

        <HiringJobPicker showAllJobs={view === 'list'} />

        <div
          className={cn(
            'min-w-0 max-w-full',
            view === 'board' && canAccessBoard && 'flex flex-1 flex-col min-h-0',
          )}
        >
          {view === 'board' && canAccessBoard ? (
            <Pipeline embedded />
          ) : (
            <Candidates mode="pipeline" embedded />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}