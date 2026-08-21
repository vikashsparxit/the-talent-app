import { useEffect, useState, type ReactNode } from 'react';
import { Info, Radar, X } from 'lucide-react';
import type { PipelineClosePlan } from '@/lib/pipelineClosePlan';
import { useOptionalChitra } from '@/components/ChitraWidget';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const RADAR_INFO =
  'Do = next clicks (Approve / Schedule / Chase). Radar = weekly volume + funnel strategy.';

const PEOPLE_IN_PLAY_INFO =
  'Non-rejected, excluding no-shows. Aim ≈ 4× openings.';

export interface PipelineRadarProps {
  plan: PipelineClosePlan;
  /** Active job title from Pipeline — primary panel heading. */
  jobTitle?: string | null;
  className?: string;
}

function StatusRow({
  label,
  value,
  emphasize,
  labelAddon,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  labelAddon?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shrink-0">
        {label}
        {labelAddon}
      </span>
      <span
        className={cn(
          'text-xs tabular-nums text-right leading-snug',
          emphasize ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ActionCue({ verb, detail }: { verb: string; detail?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-teal-500 bg-teal-600 px-3.5 py-3',
        'shadow-md shadow-teal-600/25 dark:border-teal-400 dark:bg-teal-600',
      )}
    >
      <p className="text-sm font-bold text-white leading-snug tracking-tight">{verb}</p>
      {detail ? (
        <p className="text-xs text-teal-50/90 mt-1 leading-snug font-medium">{detail}</p>
      ) : null}
    </div>
  );
}

function PeopleInPlayInfo() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex p-0.5 rounded text-muted-foreground/70 hover:text-foreground transition-colors"
          aria-label="About people in play"
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[220px] text-xs leading-snug">
        {PEOPLE_IN_PLAY_INFO}
      </TooltipContent>
    </Tooltip>
  );
}

function RadarPanelBody({ plan }: { plan: PipelineClosePlan }) {
  const shortlist = plan.lines.find((l) => l.id === 'shortlist');
  const stagePass = plan.lines.find((l) => l.id === 'stage_pass');
  const rejectMix = plan.lines.find((l) => l.id === 'reject_mix');
  const noshow = plan.lines.find((l) => l.id === 'noshow');
  const noteLines = [stagePass, noshow, rejectMix].filter(Boolean) as Array<{ id: string; text: string }>;

  const showWeekly =
    !plan.healthy && ((plan.weeklyAdd > 0 && plan.openingsLeft > 0) || Boolean(shortlist));

  const peopleInPlayValue = `${plan.cleanActive} still in play (aim ~${plan.funnelTarget})`;

  const shortlistCue = (() => {
    if (!shortlist) return null;
    const emDash = shortlist.text.split(' — ');
    if (emDash.length > 1) {
      return { verb: emDash[0]!.trim(), detail: emDash.slice(1).join(' — ').trim() };
    }
    const semi = shortlist.text.split(';');
    if (semi.length > 1) {
      return { verb: semi[0]!.trim(), detail: semi.slice(1).join(';').trim() };
    }
    return { verb: shortlist.text, detail: undefined as string | undefined };
  })();

  return (
    <div className="space-y-3.5">
      <p className="text-xs text-foreground/90 leading-snug rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
        {plan.summary}
      </p>

      {!plan.healthy ? (
        <>
          {showWeekly ? (
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300 px-0.5">
                Do this week
              </p>
              <div className="space-y-2">
                {plan.weeklyAdd > 0 && plan.openingsLeft > 0 ? (
                  <ActionCue
                    verb={`Add ${plan.weeklyAdd}`}
                    detail={
                      plan.nearDeadline && plan.deadlineLabel
                        ? `candidates by ${plan.deadlineLabel}`
                        : 'candidates this week'
                    }
                  />
                ) : null}
                {shortlistCue ? (
                  <ActionCue verb={shortlistCue.verb} detail={shortlistCue.detail} />
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
              Status
            </p>
            <div className="space-y-1">
              {plan.openingsLeft > 0 ? (
                <StatusRow label="Openings left" value={String(plan.openingsLeft)} emphasize />
              ) : null}
              {plan.openingsLeft > 0 ? (
                <StatusRow
                  label="People in play"
                  value={peopleInPlayValue}
                  emphasize={plan.cleanActive < plan.funnelTarget}
                  labelAddon={<PeopleInPlayInfo />}
                />
              ) : null}
              {plan.deadlineLabel ? (
                <StatusRow
                  label="Deadline"
                  value={plan.deadlineLabel}
                  emphasize={plan.nearDeadline || plan.deadlineOverdue}
                />
              ) : null}
              {plan.openingsLeft <= 0 && plan.noShowCount > 0 ? (
                <StatusRow
                  label="No-shows"
                  value={String(plan.noShowCount)}
                  emphasize
                />
              ) : null}
            </div>
          </section>

          {noteLines.length > 0 ? (
            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
                Funnel notes
              </p>
              <ul className="space-y-1">
                {noteLines.map((line) => (
                  <li
                    key={line.id}
                    className="text-[11px] text-muted-foreground leading-snug rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5"
                  >
                    {line.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Animated radar glyph for closed FAB / toolbar; pauses when open or reduced-motion. */
function RadarGlyph({
  className,
  animate,
  size = 'fab',
}: {
  className?: string;
  animate: boolean;
  size?: 'fab' | 'sm';
}) {
  const iconSize = size === 'fab' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span className={cn('relative inline-flex items-center justify-center', iconSize, className)}>
      {animate ? (
        <>
          <span
            className="pointer-events-none absolute inset-[-5px] rounded-full border border-current opacity-40 motion-safe:animate-radar-ring motion-reduce:hidden"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-[-2px] rounded-full border border-current/50 opacity-30 motion-safe:animate-radar-ring motion-reduce:hidden [animation-delay:1.1s]"
            aria-hidden
          />
        </>
      ) : null}
      <Radar
        className={cn(
          'relative z-[1]',
          iconSize,
          animate && 'motion-safe:animate-radar-soft motion-reduce:animate-none',
        )}
        aria-hidden
      />
    </span>
  );
}

/**
 * Pipeline Radar — floating close-plan UX (ops volume + strategy).
 * Desktop: FAB stacked above Chitra. Mobile: toolbar trigger → sheet (no second corner FAB).
 */
export function PipelineRadar({ plan, jobTitle, className }: PipelineRadarProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const chitra = useOptionalChitra();
  const showUrgentBadge = !plan.healthy;
  const animateIcon = !open;

  // Mutual exclusion with Chitra
  useEffect(() => {
    if (chitra?.isOpen && open) setOpen(false);
  }, [chitra?.isOpen, open]);

  const openRadar = () => {
    chitra?.close();
    setOpen(true);
  };

  const toggleRadar = () => {
    if (open) {
      setOpen(false);
      return;
    }
    openRadar();
  };

  const heading = jobTitle?.trim() || 'Radar';
  const subtitle = plan.healthy
    ? 'Radar · maintain / improve'
    : 'Radar · weekly strategy';

  const infoTooltip = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="p-1 rounded-md text-teal-100/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="About Radar"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-[240px] text-xs leading-snug">
        {RADAR_INFO}
      </TooltipContent>
    </Tooltip>
  );

  const panelHeader = (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-teal-600 dark:bg-teal-700 shrink-0">
      <div className="p-1 rounded-full bg-white/20">
        <Radar className="h-4 w-4 text-white" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-tight truncate" title={heading}>
          {heading}
        </p>
        <p className="text-[10px] text-teal-100 leading-tight">{subtitle}</p>
      </div>
      {infoTooltip}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="p-1 rounded-md text-teal-100 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close Radar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const launcherClass = cn(
    'pointer-events-auto relative h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200',
    'bg-teal-600 hover:bg-teal-700 active:scale-95',
    'ring-2 ring-white dark:ring-background',
  );

  return (
    <>
      {/* Mobile: toolbar icon — Chitra already owns the corner */}
      <button
        type="button"
        onClick={toggleRadar}
        className={cn(
          'relative md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 shadow-sm',
          open
            ? 'border-teal-500 bg-teal-600 text-white shadow-md'
            : 'border-teal-300/80 bg-teal-50 text-teal-700 hover:bg-teal-100 hover:border-teal-400 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-200 dark:hover:bg-teal-900/60',
          className,
        )}
        aria-label={open ? 'Close Radar' : 'Open Radar'}
        aria-pressed={open}
      >
        {open ? (
          <X className="h-4 w-4" aria-hidden />
        ) : (
          <RadarGlyph animate={animateIcon} size="sm" className="text-current" />
        )}
        {showUrgentBadge && !open && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background" />
        )}
      </button>

      {/* Desktop: FAB stacked above Chitra (bottom-right) */}
      {!isMobile && (
        <div className="fixed z-50 bottom-[5.5rem] right-5 flex flex-col items-end gap-3 pointer-events-none">
          {open && (
            <div
              className="pointer-events-auto w-[340px] rounded-2xl shadow-2xl border border-teal-200 dark:border-teal-800 bg-background overflow-hidden flex flex-col opacity-100 transition-all duration-200"
              role="dialog"
              aria-label="Radar"
            >
              {panelHeader}
              <div className="px-4 py-3 max-h-[360px] overflow-y-auto">
                <RadarPanelBody plan={plan} />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleRadar}
            className={launcherClass}
            aria-label={open ? 'Close Radar' : 'Open Radar'}
            aria-pressed={open}
          >
            {open ? (
              <X className="h-5 w-5 text-white" aria-hidden />
            ) : (
              <RadarGlyph animate={animateIcon} className="text-white" />
            )}
            {showUrgentBadge && !open && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white dark:ring-background" />
            )}
          </button>
        </div>
      )}

      {/* Mobile sheet */}
      <Sheet open={open && isMobile} onOpenChange={(next) => (next ? openRadar() : setOpen(false))}>
        <SheetContent
          side="bottom"
          hideCloseButton
          className="rounded-t-2xl px-0 pb-safe max-h-[70vh] flex flex-col gap-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{heading}</SheetTitle>
            <SheetDescription>Pipeline Radar for the selected job</SheetDescription>
          </SheetHeader>
          {panelHeader}
          <div className="px-4 py-3 overflow-y-auto">
            <RadarPanelBody plan={plan} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
