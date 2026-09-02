import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { LayoutGrid, List } from 'lucide-react';
import { Footer } from '@/components/Footer';
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
  const view: 'board' | 'list' =
    viewParam === 'list' ? 'list' : viewParam === 'board' && canAccessBoard ? 'board' : canAccessBoard ? 'board' : 'list';

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
        next.set('view', canAccessBoard ? 'board' : 'list');
        return next;
      }, { replace: true });
    }
  }, [canAccessBoard, viewParam, setSearchParams]);

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Hiring</h1>
            <p className="text-sm text-muted-foreground">
              {view === 'board' ? 'Kanban pipeline by interview stage' : 'All candidates by job'}
            </p>
          </div>

          {canAccessBoard && (
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(value) => value && setView(value as 'board' | 'list')}
              variant="outline"
              className="self-start shrink-0"
            >
              <ToggleGroupItem value="board" aria-label="Pipeline view" className="gap-1.5 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">PIPELINE</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Candidates view" className="gap-1.5 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">CANDIDATES</span>
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

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