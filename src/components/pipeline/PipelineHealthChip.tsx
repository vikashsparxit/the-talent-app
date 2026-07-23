import { useState } from 'react';
import { differenceInDays, format, parseISO } from 'date-fns';
import { Activity, Loader2, Sparkles } from 'lucide-react';
import {
  computePipelineMetrics,
  useAnalysePipeline,
  usePipelineAnalysis,
} from '@/hooks/usePipelineAnalysis';
import { useJobs } from '@/hooks/useJobs';
import { useRecruitmentTracker } from '@/hooks/useRecruitmentTracker';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PipelineHealthPanel } from '@/components/pipeline/PipelineHealthPanel';
import { cn } from '@/lib/utils';

/** Matches PipelineHealthPanel grade colors (B = teal, not brand primary/coral). */
const GRADE_CHIP_CLASSES: Record<string, string> = {
  A: 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400',
  B: 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/20 dark:border-teal-700 dark:text-teal-400',
  C: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400',
  D: 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-400',
  F: 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400',
};

const STALE_DAYS = 7;

interface PipelineHealthChipProps {
  jobId: string;
}

/** Cache-aware health control — Generate runs analyse; grade opens health drawer. Regenerate lives in the drawer only. */
export function PipelineHealthChip({ jobId }: PipelineHealthChipProps) {
  const { toast } = useToast();
  const { jobs } = useJobs({ summary: true });
  const { data, isLoading } = usePipelineAnalysis(jobId);
  const analysePipeline = useAnalysePipeline();
  const { stages, rows, isLoading: trackerLoading } = useRecruitmentTracker(jobId);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scoring = analysePipeline.isPending;
  const job = (jobs || []).find((j) => j.id === jobId);

  const isStale = data?.generated_at
    ? differenceInDays(new Date(), parseISO(data.generated_at)) > STALE_DAYS
    : false;

  const lastRefreshedLabel = data?.generated_at
    ? `Last refreshed: ${format(parseISO(data.generated_at), "MMM d, yyyy 'at' h:mm a")}`
    : null;

  const handleAnalyse = async (opts?: { openDrawer?: boolean }) => {
    if (scoring || trackerLoading) return;

    if (!job) {
      toast({ title: 'Job not found', variant: 'destructive' });
      return;
    }
    if (rows.length === 0) {
      toast({
        title: 'Nothing to analyse',
        description: 'Add candidates to this pipeline first.',
      });
      return;
    }

    if (opts?.openDrawer) setDrawerOpen(true);

    try {
      await analysePipeline.mutateAsync({
        job: {
          id: job.id,
          title: job.title,
          total_openings: (job as { total_openings?: number | null }).total_openings ?? null,
          application_deadline: job.application_deadline ?? null,
          status: job.status,
        },
        metrics: computePipelineMetrics(
          stages,
          rows,
          job.application_deadline ?? null,
          job.created_at ?? null,
        ),
      });
      if (opts?.openDrawer) setDrawerOpen(true);
    } catch (err) {
      toast({
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const openDrawer = () => setDrawerOpen(true);

  const drawer = (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="right"
        overlayClassName="z-[60]"
        className="z-[60] flex h-full w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <SheetHeader className="space-y-1.5 border-b border-border px-6 py-6 text-left">
          <SheetTitle className="flex items-center gap-2.5 text-lg font-semibold">
            <Activity className="h-5 w-5 text-primary shrink-0" aria-hidden />
            Pipeline Health
          </SheetTitle>
          <SheetDescription className="text-sm truncate">
            {job?.title ?? 'Hiring pipeline analysis'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 p-6 pt-5">
          {scoring && !data ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm">Analysing pipeline…</p>
            </div>
          ) : data ? (
            <PipelineHealthPanel
              analysis={data}
              jobId={jobId}
              scoring={scoring}
              onRegenerate={() => void handleAnalyse()}
              showViewFullReport
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-sm text-muted-foreground">No analysis yet for this job.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/5 hover:text-foreground"
                onClick={() => void handleAnalyse()}
                disabled={scoring || trackerLoading}
              >
                {scoring ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {scoring ? 'Analysing…' : 'Generate Pipeline Health'}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  if (isLoading) {
    return (
      <>
        <Button variant="outline" size="sm" disabled className="h-9 gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Pipeline Health
        </Button>
        {drawer}
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-primary/40 text-primary hover:bg-primary/5 hover:text-foreground"
          onClick={() => void handleAnalyse({ openDrawer: true })}
          disabled={scoring || trackerLoading}
          aria-label="Generate pipeline health"
        >
          {scoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}
          {scoring ? 'Analysing…' : 'Generate Pipeline Health'}
        </Button>
        {drawer}
      </>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Pipeline health grade ${data.grade}. Open health report.`}
            onClick={openDrawer}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 h-9 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-80',
              GRADE_CHIP_CLASSES[data.grade] ?? GRADE_CHIP_CLASSES.C,
              isStale && 'opacity-55',
            )}
          >
            <Activity className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <span>
              Health · <span className="font-bold tabular-nums">{data.grade}</span>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p>{lastRefreshedLabel}</p>
          <p className="text-muted-foreground">{data.grade_label} — click for details</p>
        </TooltipContent>
      </Tooltip>
      {drawer}
    </>
  );
}
