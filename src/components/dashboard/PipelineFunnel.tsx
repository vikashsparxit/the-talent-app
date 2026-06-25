import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitMerge } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

interface StageConfig {
  key: string;
  label: string;
  bar: string;
  dot: string;
  text: string;
}

const STAGES: StageConfig[] = [
  { key: 'new',         label: 'New',       bar: 'bg-blue-500',    dot: 'bg-blue-500',    text: 'text-blue-700' },
  { key: 'reviewing',   label: 'Reviewing', bar: 'bg-yellow-500',  dot: 'bg-yellow-500',  text: 'text-yellow-700' },
  { key: 'shortlisted', label: 'Hired',  bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  { key: 'hold',        label: 'On Hold',   bar: 'bg-orange-400',  dot: 'bg-orange-400',  text: 'text-orange-700' },
  { key: 'rejected',    label: 'Rejected',  bar: 'bg-red-400',     dot: 'bg-red-400',     text: 'text-red-700' },
  { key: 'backout',     label: 'Backout',   bar: 'bg-slate-400',   dot: 'bg-slate-400',   text: 'text-slate-600' },
];

export function PipelineFunnel() {
  const navigate = useNavigate();
  const { isInterviewer, user } = useAuth();

  const { data: counts = {}, isLoading } = useQuery({
    queryKey: ['pipeline-funnel', isInterviewer, user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      let data: { candidate_status: string | null }[] | null = null;

      if (isInterviewer) {
        // Scope to this interviewer's assigned candidates only (RLS handles it)
        const { data: rows } = await supabase
          .from('candidates')
          .select('candidate_status');
        data = rows;
      } else {
        // Active pipeline: candidates mapped to an open job
        const { data: openJobs } = await supabase.from('jobs').select('id').eq('status', 'open');
        const openJobIds = (openJobs || []).map(j => j.id);
        if (!openJobIds.length) return {};

        const { data: rows } = await supabase
          .from('candidates')
          .select('candidate_status')
          .in('job_id', openJobIds);
        data = rows;
      }

      const map: Record<string, number> = {};
      (data || []).forEach(c => {
        const s = (c.candidate_status || 'new').toLowerCase();
        map[s] = (map[s] || 0) + 1;
      });
      return map;
    },
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const maxCount = Math.max(...STAGES.map(s => counts[s.key] || 0), 1);

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <GitMerge className="h-4 w-4" />
          {isInterviewer ? 'My Candidates' : 'Candidate Pipeline'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {STAGES.map(s => <div key={s.key} className="h-11 bg-muted rounded-lg" />)}
          </div>
        ) : (
          <>
            {STAGES.map(stage => {
              const count = counts[stage.key] || 0;
              const pct = Math.round((count / total) * 100);
              const barWidth = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 3 : 0) : 0;
              return (
                <button
                  key={stage.key}
                  onClick={() => navigate(`/hiring?view=list&status=${stage.key}`)}
                  className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  {/* Dot */}
                  <div className={`h-2 w-2 rounded-full shrink-0 ${stage.dot}`} />

                  {/* Label */}
                  <span className="w-20 shrink-0 text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                    {stage.label}
                  </span>

                  {/* Bar */}
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stage.bar} transition-all duration-500`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* Count + pct */}
                  <div className="flex items-baseline gap-1 w-16 justify-end shrink-0">
                    <span className={`text-base font-bold leading-none ${count > 0 ? stage.text : 'text-muted-foreground'}`}>
                      {count}
                    </span>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                </button>
              );
            })}

            {/* Footer total */}
            <div className="flex items-center justify-between pt-3 border-t mt-1 px-3">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-bold">{total.toLocaleString()}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
