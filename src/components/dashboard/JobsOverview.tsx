import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Users, Crown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';

interface JobRow {
  id: string;
  title: string;
  status: string;
  candidateCount: number;
  primaryRecruiter: string | null;
}

const statusStyle: Record<string, { badge: string; dot: string }> = {
  open:   { badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  paused: { badge: 'bg-amber-500/10 text-amber-700 border-amber-200',       dot: 'bg-amber-500' },
  closed: { badge: 'bg-muted text-muted-foreground border-border',          dot: 'bg-slate-400' },
  draft:  { badge: 'bg-muted text-muted-foreground border-border',          dot: 'bg-slate-300' },
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
  const navigate = useNavigate();

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
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Briefcase className="h-4 w-4" />
            Active Jobs
          </span>
          {!isLoading && totalOpen > 0 && (
            <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5">
              {totalOpen} open
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-muted rounded-lg" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center gap-2">
            <div className="p-3 rounded-full bg-muted">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No active jobs</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            <div className="space-y-1 flex-1">
              {jobs.map(job => {
                const st = statusStyle[job.status] || statusStyle.draft;
                return (
                  <button
                    key={job.id}
                    onClick={() => navigate('/jobs')}
                    className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    {/* Status dot */}
                    <div className={`h-2 w-2 rounded-full shrink-0 ${st.dot}`} />

                    {/* Title + recruiter */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {job.title}
                      </p>
                      {job.primaryRecruiter && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Crown className="h-2.5 w-2.5 text-amber-500 fill-amber-400 shrink-0" />
                          {job.primaryRecruiter}
                        </p>
                      )}
                    </div>

                    {/* Candidates count */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Users className="h-3 w-3" />
                      <span className="font-medium">{job.candidateCount}</span>
                    </div>

                    {/* Status badge */}
                    <Badge variant="outline" className={`text-xs px-2 py-0.5 shrink-0 ${st.badge}`}>
                      {job.status}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* View all */}
            <button
              onClick={() => navigate('/jobs')}
              className="mt-3 pt-3 border-t w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View all jobs
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
