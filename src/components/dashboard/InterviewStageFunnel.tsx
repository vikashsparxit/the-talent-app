import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, List, BarChart2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface StageRow {
  key: string;
  stage_name: string;
  short_name: string;
  order_index: number;
  entered: number;
  proceeded: number;
  conversion_pct: number;
}

function convColor(pct: number): string {
  if (pct >= 60) return 'hsl(var(--chart-2, 142 76% 36%))'; // emerald
  if (pct >= 30) return 'hsl(var(--chart-4, 45 93% 47%))';  // amber
  return 'hsl(var(--destructive))';                           // red
}

function convTailwind(pct: number): string {
  if (pct >= 60) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500';
}

function shortName(name: string): string {
  if (name.length <= 8) return name;
  return name.replace(/round/i, '').replace(/interview/i, '').trim().slice(0, 8);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConvLabel({ x, y, width, value }: any) {
  if (!value && value !== 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
      {value}%
    </text>
  );
}

export function InterviewStageFunnel() {
  const { isInterviewer, user } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState<'chart' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'chart',
  );

  useEffect(() => {
    if (isMobile) setView('list');
  }, [isMobile]);

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

  const maxEntered = Math.max(...stageRows.map(s => s.entered), 1);
  const total = stageRows.reduce((a, s) => a + s.entered, 0);

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Layers className="h-4 w-4" />
            {isInterviewer ? 'My Interview Stages' : 'Interview Stage Funnel'}
          </CardTitle>
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setView('chart')}
              className={`p-1 rounded transition-colors ${view === 'chart' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label="Chart view"
            >
              <BarChart2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1 rounded transition-colors ${view === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className={`flex-1 flex flex-col ${view === 'chart' ? 'pt-0' : 'space-y-1.5'}`}>
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-11 rounded-lg" />)}
          </div>
        ) : stageRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No interview data yet</p>
        ) : view === 'chart' ? (
          /* ── Chart view ─────────────────────────────────────────── */
          <div className="flex-1 min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stageRows}
              margin={{ top: 20, right: 8, left: -24, bottom: 48 }}
              barCategoryGap="30%"
            >
              <XAxis
                dataKey="short_name"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, _: string, props: { payload?: StageRow }) => {
                  const row = props.payload;
                  return [
                    `${value} candidates (${row?.conversion_pct ?? 0}% proceeded)`,
                    row?.stage_name ?? '',
                  ];
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey="entered" radius={[4, 4, 0, 0]}>
                {stageRows.map(row => (
                  <Cell key={row.key} fill={convColor(row.conversion_pct)} fillOpacity={0.85} />
                ))}
                <LabelList dataKey="conversion_pct" content={<ConvLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : (
          /* ── List view ──────────────────────────────────────────── */
          <>
            <div className="flex items-center gap-3 px-3 pb-1">
              <div className="w-5 shrink-0" />
              <span className="w-24 shrink-0 text-[11px] text-muted-foreground uppercase tracking-wide">Stage</span>
              <div className="flex-1" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-8 text-right">In</span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide w-10 text-right">Conv.</span>
            </div>

            {stageRows.map((stage, idx) => {
              const barWidth = Math.max((stage.entered / maxEntered) * 100, 3);
              return (
                <div
                  key={stage.key}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <span className="w-24 shrink-0 text-sm text-foreground/80 truncate">{stage.stage_name}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-base font-bold leading-none w-8 text-right">{stage.entered}</span>
                  <span className={`text-xs font-semibold w-10 text-right ${convTailwind(stage.conversion_pct)}`}>
                    {stage.conversion_pct}%
                  </span>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-3 border-t mt-1 px-3">
              <span className="text-xs text-muted-foreground">Total interviews</span>
              <span className="text-sm font-bold">{total.toLocaleString()}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
