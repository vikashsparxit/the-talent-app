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
import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { cn } from '@/lib/utils';

const GRADE_DOT_CLASSES: Record<string, string> = {
  A: 'bg-success',
  B: 'bg-chart-3',
  C: 'bg-warning',
  D: 'bg-chart-4',
  F: 'bg-destructive',
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
        overlayClassName="z-60"
        className="z-60 flex h-full w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
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
          className="h-9 gap-1.5"
          onClick={() => void handleAnalyse({ openDrawer: true })}
          disabled={scoring || trackerLoading}
          aria-label="Generate pipeline health"
        >
          {scoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
          )}
          {scoring ? 'Analysing…' : 'Generate pipeline health'}
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
            aria-label={`Pipeline health grade ${data.grade}, ${data.grade_label}${isStale ? ', stale' : ''}. Open health report.`}
            onClick={openDrawer}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full bg-card px-3 text-label whitespace-nowrap shadow-border',
              'transition-[box-shadow,transform] duration-fast ease-out hover:shadow-border-hover active:scale-[0.96]',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <span
              className={cn('size-2 shrink-0 rounded-full', GRADE_DOT_CLASSES[data.grade] ?? GRADE_DOT_CLASSES.C, isStale && 'opacity-50')}
              aria-hidden
            />
            <span className="text-foreground">
              Health <span className="tabular-nums">{data.grade}</span>
            </span>
            <span className="hidden text-muted-foreground lg:inline">
              {isStale ? 'Stale' : data.grade_label}
            </span>
            <SegmentedProgress
              value={data.overall_score}
              total={100}
              ticks={16}
              size="sm"
              series={3}
              className="hidden h-3 w-12 gap-0.5 sm:flex"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p>{lastRefreshedLabel}</p>
          <p className="text-background/70">{data.grade_label} — click for details</p>
        </TooltipContent>
      </Tooltip>
      {drawer}
    </>
  );
}
