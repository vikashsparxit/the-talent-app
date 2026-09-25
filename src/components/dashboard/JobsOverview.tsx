import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, Users } from 'lucide-react';
import { Link } from 'react-router';

interface JobRow {
  id: string;
  title: string;
  status: string;
  candidateCount: number;
  primaryRecruiter: string | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral'> = {
  open: 'success',
  paused: 'warning',
};

function displayName(fullName: string | null | undefined, email: string | null | undefined): string {
  const n = (fullName || '').trim();
  if (n && !n.includes('@')) return n;
  if (email?.includes('@')) return email.split('@')[0];
  return '—';
}

interface QueryResult {
  jobs: JobRow[];
  totalOpen: number;
}

export function JobsOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-jobs-overview'],
    staleTime: 300_000,
    queryFn: async (): Promise<QueryResult> => {
      const [{ data: jobRows }, { count: totalOpen }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, status, candidates(count)')
          .in('status', ['open', 'paused'])
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open'),
      ]);

      if (!jobRows?.length) return { jobs: [], totalOpen: totalOpen || 0 };

      const jobIds = jobRows.map(j => j.id);

      const { data: recruiters } = await supabase
        .from('job_recruiters')
        .select('job_id, recruiter_user_id, is_primary')
        .in('job_id', jobIds);

      const recIds = [...new Set((recruiters || []).map((r: { recruiter_user_id: string }) => r.recruiter_user_id))];
      const { data: profileData } = recIds.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', recIds)
        : { data: [] };

      const profileMap = new Map((profileData || []).map((p) => [p.user_id, p]));
      const primaryRecruiterMap = new Map<string, string>();
      (recruiters || []).forEach((r: { job_id: string; recruiter_user_id: string; is_primary: boolean }) => {
        if (r.is_primary) {
          const p = profileMap.get(r.recruiter_user_id);
          primaryRecruiterMap.set(r.job_id, displayName(p?.full_name, p?.email));
        }
      });

      return {
        totalOpen: totalOpen || 0,
        jobs: jobRows.map((j) => {
          const countRow = (j as { candidates?: { count: number }[] }).candidates?.[0];
          return {
            id: j.id,
            title: j.title,
            status: j.status,
            candidateCount: countRow?.count ?? 0,
            primaryRecruiter: primaryRecruiterMap.get(j.id) || null,
          };
        }),
      };
    },
  });

  const jobs = data?.jobs ?? [];
  const totalOpen = data?.totalOpen ?? 0;

  return (
    <SectionCard
      title="Active jobs"
      description={!isLoading && totalOpen > 0 ? `${totalOpen} open` : undefined}
      actions={
        <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-muted-foreground">
          <Link to="/jobs">View all</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-md" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Briefcase className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No active jobs</p>
        </div>
      ) : (
        <ul className="-mx-2 grid gap-0.5 sm:grid-cols-2 sm:gap-x-4">
          {jobs.map(job => (
            <li key={job.id}>
              <Link
                to="/jobs"
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-instant ease-out hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {job.primaryRecruiter ?? 'No primary recruiter'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-caption tabular-nums text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {job.candidateCount}
                </span>
                <Badge variant={STATUS_VARIANT[job.status] ?? 'neutral'} className="shrink-0 capitalize">
                  {job.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
