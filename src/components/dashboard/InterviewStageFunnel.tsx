import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface StageRow {
  key: string;
  stage_name: string;
  short_name: string;
  order_index: number;
  entered: number;
  proceeded: number;
  conversion_pct: number;
}

const STAGE_COLORS = ['bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-foreground/30', 'bg-foreground/15'];

function stageColor(index: number): string {
  return STAGE_COLORS[index % STAGE_COLORS.length];
}

function conversionVariant(pct: number): 'success' | 'warning' | 'danger' {
  if (pct >= 60) return 'success';
  if (pct >= 30) return 'warning';
  return 'danger';
}

function shortName(name: string): string {
  if (name.length <= 8) return name;
  return name.replace(/round/i, '').replace(/interview/i, '').trim().slice(0, 8);
}

export function InterviewStageFunnel() {
  const { isInterviewer, user } = useAuth();

  const { data: stageRows = [], isLoading } = useQuery<StageRow[]>({
    queryKey: ['interview-stage-funnel', isInterviewer, user?.id],
    staleTime: 300_000,
    queryFn: async () => {
      const interviewerId = isInterviewer ? user?.id : null;
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_interview_stage_funnel', {
        p_interviewer_user_id: interviewerId,
      });

      if (!rpcError && Array.isArray(rpcData)) {
        return (rpcData as { order_index: number; stage_name: string; entered: number; proceeded: number }[])
          .filter((row) => row.entered > 0)
          .map((row) => ({
            key: `order_${row.order_index}`,
            stage_name: row.stage_name,
            short_name: shortName(row.stage_name),
            order_index: row.order_index,
            entered: row.entered,
            proceeded: row.proceeded,
            conversion_pct: row.entered > 0 ? Math.round((row.proceeded / row.entered) * 100) : 0,
          }));
      }

      type IvRow = { job_interview_stage_id: string | null; verdict: string | null };
      type StageInfo = { id: string; stage_name: string; order_index: number };

      let interviews: IvRow[] = [];
      let stages: StageInfo[] = [];

      if (isInterviewer) {
        const { data } = await supabase
          .from('candidate_interviews')
          .select('job_interview_stage_id, verdict')
          .eq('interviewer_user_id', user!.id)
          .is('removed_from_pipeline_at', null);
        interviews = data || [];

        const stageIds = [...new Set(interviews.map(iv => iv.job_interview_stage_id).filter(Boolean))] as string[];
        if (stageIds.length) {
          const { data: stageData } = await supabase
            .from('job_interview_stages')
            .select('id, stage_name, order_index')
            .in('id', stageIds);
          stages = stageData || [];
        }
      } else {
        const { data: openJobs } = await supabase.from('jobs').select('id').eq('status', 'open');
        const openJobIds = (openJobs || []).map(j => j.id);
        if (!openJobIds.length) return [];

        const { data: stageData } = await supabase
          .from('job_interview_stages')
          .select('id, stage_name, order_index')
          .in('job_id', openJobIds)
          .order('order_index');
        stages = stageData || [];

        const stageIds = stages.map(s => s.id);
        if (!stageIds.length) return [];

        const batchSize = 100;
        for (let i = 0; i < stageIds.length; i += batchSize) {
          const { data } = await supabase
            .from('candidate_interviews')
            .select('job_interview_stage_id, verdict')
            .in('job_interview_stage_id', stageIds.slice(i, i + batchSize))
            .is('removed_from_pipeline_at', null);
          if (data) interviews.push(...data);
        }
      }

      const byStage = new Map<string, { entered: number; proceeded: number }>();
      for (const iv of interviews) {
        if (!iv.job_interview_stage_id) continue;
        const existing = byStage.get(iv.job_interview_stage_id) || { entered: 0, proceeded: 0 };
        existing.entered++;
        if (iv.verdict === 'proceeded') existing.proceeded++;
        byStage.set(iv.job_interview_stage_id, existing);
      }

      const byOrder = new Map<number, { firstName: string; entered: number; proceeded: number }>();
      for (const s of stages) {
        const counts = byStage.get(s.id) || { entered: 0, proceeded: 0 };
        const existing = byOrder.get(s.order_index);
        if (existing) {
          existing.entered += counts.entered;
          existing.proceeded += counts.proceeded;
        } else {
          byOrder.set(s.order_index, { firstName: s.stage_name, ...counts });
        }
      }

      return Array.from(byOrder.entries())
        .sort((a, b) => a[0] - b[0])
        .filter(([, d]) => d.entered > 0)
        .map(([order_index, d]) => ({
          key: `order_${order_index}`,
          stage_name: d.firstName,
          short_name: shortName(d.firstName),
          order_index,
          entered: d.entered,
          proceeded: d.proceeded,
          conversion_pct: d.entered > 0 ? Math.round((d.proceeded / d.entered) * 100) : 0,
        }));
    },
  });

  const total = stageRows.reduce((a, s) => a + s.entered, 0);

  return (
    <SectionCard
      title={isInterviewer ? 'My interview stages' : 'Interview stages'}
      description={!isLoading && stageRows.length > 0
        ? `${total.toLocaleString()} interviews across ${stageRows.length} stage${stageRows.length === 1 ? '' : 's'}`
        : undefined}
      className="flex h-full flex-col"
      contentClassName="flex flex-1 flex-col"
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 rounded-full" />
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 rounded-md" />)}
        </div>
      ) : stageRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No interview data yet</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`Interviews by stage: ${stageRows.map(s => `${s.stage_name} ${s.entered}`).join(', ')}`}
            className="flex h-3 w-full gap-0.5"
          >
            {stageRows.map((stage, idx) => (
              <span
                key={stage.key}
                className={cn('h-full min-w-1 basis-0 first:rounded-l-full last:rounded-r-full', stageColor(idx))}
                style={{ flexGrow: stage.entered }}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3 px-2 pb-1 text-caption text-muted-foreground">
            <span className="size-2.5 shrink-0" aria-hidden />
            <span className="flex-1">Stage</span>
            <span className="w-16 text-right">Interviews</span>
            <span className="w-[4.5rem] text-center">Proceeded</span>
          </div>
          <ul className="flex-1 space-y-0.5">
            {stageRows.map((stage, idx) => (
              <li
                key={stage.key}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-instant ease-out hover:bg-accent/60"
              >
                <span className={cn('size-2.5 shrink-0 rounded-full', stageColor(idx))} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={stage.stage_name}>
                  {stage.stage_name}
                </span>
                <span className="w-16 text-right text-sm font-medium tabular-nums">{stage.entered.toLocaleString()}</span>
                <span className="flex w-[4.5rem] justify-center">
                  <Badge variant={conversionVariant(stage.conversion_pct)} className="tabular-nums">
                    {stage.conversion_pct}%
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
