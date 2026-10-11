import { cn, safeExternalUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Star, ThumbsUp, ThumbsDown, Pause, UserX, ArrowRight, GripVertical, CalendarDays,
  ExternalLink, AlertTriangle, Check, X as XIcon, MoreHorizontal, UserMinus, RefreshCw,
  UserCheck, ClipboardCheck, Clock, Ban,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateTimeInTz } from '@/lib/formatTz';
import type { InterviewVerdict, HolisticInterview } from '@/hooks/useInterviewPipeline';
import { ApplicationFormStatusBadge } from '@/components/candidates/JobApplicationFormSection';
import { AssessmentStatusBadge } from '@/components/candidates/AssessmentSection';
import type { PipelineAssessmentStatus } from '@/hooks/useJobAssessment';
import type { CandidateRecruiterInfo } from '@/hooks/useCandidateAssignees';

/** Shared chip chrome for fit + status badges (same height/padding/weight). */
const CHIP_BASE =
  'inline-flex items-center gap-1 shrink-0 rounded-full px-1.5 py-0.5 text-caption font-medium leading-none';

const CHIP_TONE = {
  success: 'bg-[hsl(var(--chip-success-bg))] text-[hsl(var(--chip-success-text))]',
  warning: 'bg-[hsl(var(--chip-warning-bg))] text-[hsl(var(--chip-warning-text))]',
  danger: 'bg-[hsl(var(--chip-danger-bg))] text-[hsl(var(--chip-danger-text))]',
  neutral: 'bg-[hsl(var(--chip-neutral-bg))] text-[hsl(var(--chip-neutral-text))]',
} as const;

const KANBAN_CARD_CHROME =
  'rounded-md border-0 bg-card shadow-border transition-shadow duration-fast ease-out hover:shadow-border-hover';

const COLUMN_COUNT_PILL =
  'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-track px-1.5 text-caption tabular-nums text-muted-foreground';

const CHIP_ICON = 'w-2.5 h-2.5 shrink-0';

const verdictColors: Record<InterviewVerdict, string> = {
  proceeded: CHIP_TONE.success,
  rejected: CHIP_TONE.danger,
  hold: CHIP_TONE.warning,
  no_show: CHIP_TONE.neutral,
};

const verdictIcons: Record<InterviewVerdict, typeof ThumbsUp> = {
  proceeded: ThumbsUp,
  rejected: ThumbsDown,
  hold: Pause,
  no_show: UserX,
};

/** Cards stay neutral; the status chip carries state. Closed-out cards recede. */
const CARD_SURFACE = {
  rejected: 'bg-surface-subtle',
  hold: '',
  proceeded: '',
  no_show: '',
  declined: 'bg-surface-subtle opacity-60',
  backout: 'bg-surface-subtle opacity-60',
} as const;

const PIPELINE_TERMINAL_STATUSES = new Set(['shortlisted', 'rejected', 'backout']);

function isOutOfActivePipeline(
  candidate: { candidate_status?: string; hired_at?: string | null } | null | undefined,
): boolean {
  if (!candidate) return false;
  if (candidate.hired_at) return true;
  return PIPELINE_TERMINAL_STATUSES.has(candidate.candidate_status ?? '');
}

function panelistInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Muted, non-danger palette — hash from name so the same person keeps the same color. */
const AVATAR_OUTLINE = 'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10';

const PERSON_AVATAR_PALETTE = [
  'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
] as const;

function personAvatarClass(name: string): string {
  let hash = 0;
  const key = name.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return PERSON_AVATAR_PALETTE[Math.abs(hash) % PERSON_AVATAR_PALETTE.length];
}

function fitScoreBadgeClass(score: number): string {
  if (score >= 70) return CHIP_TONE.success;
  if (score >= 40) return CHIP_TONE.warning;
  return CHIP_TONE.danger;
}

function FitBadge({ score }: { score: number }) {
  return (
    <span className={cn(CHIP_BASE, fitScoreBadgeClass(score))}>
      <span className="tabular-nums">{score}%</span> fit
    </span>
  );
}

type PersonChip = { key: string; name: string };

/** Recruiters always; when scheduled, add this-round panelists. Dedupe by name. */
function buildPeopleChips(
  recruiters: CandidateRecruiterInfo[] | undefined,
  scheduledPanelists: { full_name?: string | null }[],
): PersonChip[] {
  const seen = new Set<string>();
  const out: PersonChip[] = [];
  const add = (name: string, key: string) => {
    const label = name.trim();
    if (!label) return;
    const norm = label.toLowerCase();
    if (seen.has(norm)) return;
    seen.add(norm);
    out.push({ key, name: label });
  };
  for (const r of recruiters ?? []) {
    add(r.recruiter_name, `r:${r.recruiter_email || r.recruiter_name}`);
  }
  for (const p of scheduledPanelists) {
    if (p.full_name) add(p.full_name, `p:${p.full_name}`);
  }
  return out;
}

function PeopleAvatarRow({ people }: { people: PersonChip[] }) {
  if (people.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {people.map((p) => (
        <span key={p.key} title={p.name} className="inline-flex">
          <Avatar className={cn('h-5 w-5', AVATAR_OUTLINE)}>
            <AvatarFallback
              className={cn('text-[8px] font-semibold', personAvatarClass(p.name))}
            >
              {panelistInitials(p.name)}
            </AvatarFallback>
          </Avatar>
        </span>
      ))}
    </div>
  );
}

function CardOverflowMenu({
  canManage,
  canAdminAction,
  assessmentEnabled,
  onAssignAssessment,
  isRejected,
  onReopen,
  onRemove,
}: {
  canManage: boolean;
  canAdminAction: boolean;
  assessmentEnabled?: boolean;
  onAssignAssessment?: () => void;
  isRejected: boolean;
  onReopen?: () => void;
  onRemove: () => void;
}) {
  if (!canManage) return null;
  const hasItems =
    (assessmentEnabled && !!onAssignAssessment)
    || (isRejected && !!onReopen)
    || canAdminAction;
  if (!hasItems) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Card actions" className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast ease-out">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-sm" onClick={e => e.stopPropagation()}>
        {assessmentEnabled && onAssignAssessment && (
          <DropdownMenuItem onClick={onAssignAssessment} className="gap-2">
            <ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground" /> Assign Assessment
          </DropdownMenuItem>
        )}
        {isRejected && onReopen && (
          <DropdownMenuItem onClick={onReopen} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Re-open Candidate
          </DropdownMenuItem>
        )}
        {canAdminAction && (
          <DropdownMenuItem onClick={onRemove} className="gap-2 text-destructive focus:text-destructive">
            <UserMinus className="w-3.5 h-3.5" /> Remove from Pipeline
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DraggablePipelineCard({
  interview,
  canManage,
  canAdminAction,
  allStages,
  recruiter,
  onFeedback,
  onAdvance,
  onSchedule,
  onCancel,
  onCardClick,
  onRemove,
  onReopen,
  onMarkHired,
  isMarkingHired,
  applicationFormStatus,
  assessmentStatus,
  assessmentEnabled,
  onAssignAssessment,
}: {
  interview: HolisticInterview;
  canManage: boolean;
  canAdminAction: boolean;
  allStages: { id: string; job_id?: string; order_index: number }[];
  recruiter?: CandidateRecruiterInfo[];
  onFeedback: () => void;
  onAdvance: () => void;
  onSchedule: () => void;
  onCancel?: () => void;
  onCardClick: () => void;
  onRemove: () => void;
  onReopen?: () => void;
  onMarkHired: () => void;
  isMarkingHired: boolean;
  applicationFormStatus?: 'pending' | 'submitted' | 'none';
  assessmentStatus?: PipelineAssessmentStatus;
  assessmentEnabled?: boolean;
  onAssignAssessment?: () => void;
}) {
  const userTimezone = useUserTimezone();
  const isNewlyApproved = !!interview.enrolled_at &&
    new Date(interview.enrolled_at).getTime() > Date.now() - 24 * 60 * 60 * 1000;
  const candidateStatus = interview.candidate?.candidate_status;
  const isBackout = candidateStatus === 'backout';
  const isRejected = interview.verdict === 'rejected';
  const isLocked = isBackout || isRejected;
  const canDrag = canManage && !isLocked;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: interview.id,
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const candidate = interview.candidate;
  const VerdictIcon = interview.verdict ? verdictIcons[interview.verdict] : null;
  const fitScore = (interview.candidate as { suitability_score?: number | null } | undefined)?.suitability_score;

  const jobStages = allStages
    .filter(s => s.job_id === interview.job_interview_stage?.job_id)
    .sort((a, b) => a.order_index - b.order_index);
  const isLastStage = jobStages.length > 0 && jobStages[jobStages.length - 1]?.id === interview.job_interview_stage_id;

  const isFeedbackOverdue = !interview.verdict && !!interview.scheduled_at &&
    new Date(interview.scheduled_at).getTime() < Date.now() - 30 * 60 * 1000;

  const formPending = applicationFormStatus === 'pending';
  // One primary status signal: Form pending > NEW (overdue uses card tint, not name-row pill)
  const primarySignal: 'form_pending' | 'new' | null = formPending
    ? 'form_pending'
    : isNewlyApproved
      ? 'new'
      : null;

  const showAssessmentBadge = assessmentEnabled
    && assessmentStatus
    && (
      assessmentStatus === 'pending'
      || assessmentStatus === 'awaiting_review'
      || assessmentStatus === 'failed'
      || assessmentStatus === 'expired'
    )
    && primarySignal === null
    && !isFeedbackOverdue;

  const scheduledPanelists = interview.scheduled_at
    ? (interview.panelists?.length
      ? interview.panelists
      : interview.interviewer
        ? [{ full_name: interview.interviewer.full_name }]
        : [])
    : [];

  const people = buildPeopleChips(recruiter, scheduledPanelists);

  const meetingHref = safeExternalUrl(interview.meeting_link);
  const hasMeetingLink = !!meetingHref;
  const isScheduled = !!interview.scheduled_at;
  const hasVerdict = !!interview.verdict;
  const cancelButton = canManage && isScheduled && !hasVerdict && onCancel ? (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs flex-1 text-destructive hover:text-destructive"
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <Ban className="w-3 h-3 mr-1" /> Cancel
    </Button>
  ) : null;

  const cardTint = isBackout
    ? CARD_SURFACE.backout
    : isRejected
      ? CARD_SURFACE.rejected
      : interview.verdict === 'hold' || isFeedbackOverdue
        ? CARD_SURFACE.hold
        : interview.verdict === 'proceeded'
          ? CARD_SURFACE.proceeded
          : interview.verdict === 'no_show'
            ? CARD_SURFACE.no_show
            : '';

  if (isLocked) {
    return (
      <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-40 z-50' : ''}>
        <Card
          className={cn(
            KANBAN_CARD_CHROME,
            'cursor-default',
            isBackout ? CARD_SURFACE.backout : cardTint,
          )}
          onClick={onCardClick}
        >
          <CardContent className="px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-4 shrink-0" />
              <p className={cn(
                'font-medium text-sm truncate flex-1 min-w-0',
                isBackout && 'line-through text-muted-foreground',
              )}>
                {candidate?.name || 'Unknown'}
              </p>
              {fitScore != null && <FitBadge score={fitScore} />}
              {isBackout ? (
                <span className={cn(CHIP_BASE, CHIP_TONE.neutral)}>
                  <UserX className={CHIP_ICON} /> Withdrawn
                </span>
              ) : (
                <span className={cn(CHIP_BASE, verdictColors.rejected)}>
                  <ThumbsDown className={CHIP_ICON} /> Rejected
                </span>
              )}
              <CardOverflowMenu
                canManage={canManage}
                canAdminAction={canAdminAction}
                assessmentEnabled={assessmentEnabled}
                onAssignAssessment={onAssignAssessment}
                isRejected={isRejected}
                onReopen={onReopen}
                onRemove={onRemove}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Primary CTA: overdue Feedback > Join > Schedule. Everything else outline.
  const primaryAction: 'feedback_overdue' | 'join' | 'schedule' | null = isFeedbackOverdue
    ? 'feedback_overdue'
    : !hasVerdict && isScheduled && hasMeetingLink
      ? 'join'
      : !hasVerdict && !isScheduled && canManage
        ? 'schedule'
        : null;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-40 z-50' : ''}>
      <Card className={cn(KANBAN_CARD_CHROME, 'cursor-default', cardTint)} onClick={onCardClick}>
        <CardContent className="p-3 space-y-2">
          {/* Row 1: drag + name + score/menu */}
          <div className="flex items-start gap-2">
            {canDrag ? (
              <div
                {...attributes}
                {...listeners}
                className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-4 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="font-medium text-sm truncate min-w-0">{candidate?.name || 'Unknown'}</p>
                <div className="flex items-center gap-1 shrink-0">
                  {interview.overall_score != null && (
                    <Badge variant="neutral" className="h-5 gap-0.5 px-1.5 tabular-nums">
                      <Star className="w-3 h-3" /> {interview.overall_score}/5
                    </Badge>
                  )}
                  <CardOverflowMenu
                    canManage={canManage}
                    canAdminAction={canAdminAction}
                    assessmentEnabled={assessmentEnabled}
                    onAssignAssessment={onAssignAssessment}
                    isRejected={isRejected}
                    onReopen={onReopen}
                    onRemove={onRemove}
                  />
                </div>
              </div>

              {/* Row 2: fit + status (verdict / overdue / NEW / form / assessment) */}
              {(fitScore != null
                || interview.verdict
                || isFeedbackOverdue
                || primarySignal
                || showAssessmentBadge) && (
                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {fitScore != null && <FitBadge score={fitScore} />}
                  {interview.verdict && (
                    <span className={cn(CHIP_BASE, verdictColors[interview.verdict])}>
                      {VerdictIcon && <VerdictIcon className={CHIP_ICON} />}
                      {interview.verdict === 'proceeded' ? 'Proceeded'
                        : interview.verdict === 'rejected' ? 'Rejected'
                          : interview.verdict === 'hold' ? 'On Hold'
                            : 'No Show'}
                    </span>
                  )}
                  {!interview.verdict && isFeedbackOverdue && (
                    <span className={cn(CHIP_BASE, CHIP_TONE.warning)}>
                      <AlertTriangle className={CHIP_ICON} />
                      Feedback overdue
                    </span>
                  )}
                  {primarySignal === 'new' && (
                    <span className={cn(CHIP_BASE, 'bg-accent text-accent-foreground')}>
                      NEW
                    </span>
                  )}
                  {primarySignal === 'form_pending' && (
                    <ApplicationFormStatusBadge status="pending" />
                  )}
                  {showAssessmentBadge && assessmentStatus && (
                    <AssessmentStatusBadge status={assessmentStatus} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: datetime (left) + people avatars (right) */}
          {(isScheduled || people.length > 0) && (
            <div className={cn(
              'flex items-center gap-2 ml-6 min-w-0',
              isScheduled && people.length > 0 && 'justify-between',
            )}>
              {isScheduled && (
                <span className="flex items-center gap-1 text-caption tabular-nums text-muted-foreground truncate min-w-0">
                  <CalendarDays className="w-3 h-3 shrink-0" />
                  {formatDateTimeInTz(interview.scheduled_at!, userTimezone)}
                </span>
              )}
              <PeopleAvatarRow people={people} />
            </div>
          )}

          {/* Row 4: actions — horizontal wrap; Mark Hired / Advance stay in the same flex row */}
          <div className="flex flex-row flex-wrap gap-1.5 pt-0.5 ml-6">
            {hasVerdict ? (
              <>
                {canManage && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1 min-w-[7rem]" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                    <CalendarDays className="w-3 h-3 mr-1" />
                    {isScheduled ? 'Reschedule' : 'Schedule'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1 min-w-[7rem]"
                  onClick={(e) => { e.stopPropagation(); onFeedback(); }}
                >
                  <Star className="w-3 h-3 mr-1" /> Edit Feedback
                </Button>
              </>
            ) : isFeedbackOverdue ? (
              <>
                {canManage && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                    <CalendarDays className="w-3 h-3 mr-1" /> Reschedule
                  </Button>
                )}
                {cancelButton}
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    'h-7 text-xs flex-1',
                    primaryAction === 'feedback_overdue' &&
                      'border-transparent bg-[hsl(var(--chip-warning-bg))] text-[hsl(var(--chip-warning-text))] hover:bg-[hsl(var(--chip-warning-bg))]/80 hover:text-[hsl(var(--chip-warning-text))]',
                  )}
                  onClick={(e) => { e.stopPropagation(); onFeedback(); }}
                >
                  <Star className="w-3 h-3 mr-1" /> Feedback
                </Button>
                {hasMeetingLink && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" asChild>
                    <a href={meetingHref!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="w-3 h-3 mr-1" /> Join
                    </a>
                  </Button>
                )}
              </>
            ) : isScheduled && hasMeetingLink ? (
              <>
                <Button
                  size="sm"
                  className={cn(
                    'h-7 text-xs flex-1',
                  )}
                  variant={primaryAction === 'join' ? 'default' : 'outline'}
                  asChild
                >
                  <a href={meetingHref!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="w-3 h-3 mr-1" /> Join
                  </a>
                </Button>
                {canManage && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                    <CalendarDays className="w-3 h-3 mr-1" /> Reschedule
                  </Button>
                )}
                {cancelButton}
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onFeedback(); }}>
                  <Star className="w-3 h-3 mr-1" /> Feedback
                </Button>
              </>
            ) : !isScheduled ? (
              <>
                {canManage && (
                  <Button
                    size="sm"
                    className={cn(
                      'h-7 text-xs flex-1',
                    )}
                    variant={primaryAction === 'schedule' ? 'default' : 'outline'}
                    onClick={(e) => { e.stopPropagation(); onSchedule(); }}
                  >
                    <CalendarDays className="w-3 h-3 mr-1" /> Schedule
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onFeedback(); }}>
                  <Star className="w-3 h-3 mr-1" /> Feedback
                </Button>
              </>
            ) : (
              <>
                {canManage && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                    <CalendarDays className="w-3 h-3 mr-1" /> Reschedule
                  </Button>
                )}
                {cancelButton}
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onFeedback(); }}>
                  <Star className="w-3 h-3 mr-1" /> Feedback
                </Button>
              </>
            )}

            {interview.verdict === 'proceeded' && !interview.advanced_at && canManage && !isLastStage && (
              <Button size="sm" className="h-7 text-xs flex-1 min-w-[7rem]" onClick={(e) => { e.stopPropagation(); onAdvance(); }}>
                <ArrowRight className="w-3 h-3 mr-1" /> Advance
              </Button>
            )}
            {interview.verdict === 'proceeded' && isLastStage && canManage && !isOutOfActivePipeline(interview.candidate) && (
              <Button
                size="sm"
                className="h-7 text-xs flex-1 min-w-[7rem] bg-success text-success-foreground hover:bg-success/90"
                disabled={isMarkingHired}
                onClick={(e) => { e.stopPropagation(); onMarkHired(); }}
              >
                <UserCheck className="w-3 h-3 mr-1" /> Mark as Hired
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PendingApprovalColumn({
  candidates,
  onApprove,
  onDecline,
  onCardClick,
  isApproving,
  canApprove = true,
  applicationFormStatuses,
}: {
  candidates: Array<{
    id: string;
    name?: string;
    email?: string;
    role_applied?: string;
    candidate_status?: string;
    suitability_score?: number | null;
    pending_approval_decline_reason?: string | null;
  }>;
  onApprove: (id: string) => void;
  onDecline: (c: { id: string; name?: string }) => void;
  onCardClick: (c: { id: string }) => void;
  isApproving: boolean;
  /** Admin/HR/recruiter, or interview-pool interviewers — Approve/Decline CTAs */
  canApprove?: boolean;
  applicationFormStatuses?: Map<string, 'pending' | 'submitted' | 'none'>;
}) {
  return (
    <div className="w-[300px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="h-2 w-2 rounded-full shrink-0 bg-violet-500" aria-hidden />
        <h3 className="text-label text-foreground">Pending Approval</h3>
        <span className={COLUMN_COUNT_PILL}>{candidates.length}</span>
      </div>
      <div className="space-y-2 min-h-[200px] rounded-xl p-1 bg-surface-subtle">
        {candidates.length === 0 ? (
          <p className="text-caption text-muted-foreground text-center py-8">No pending candidates</p>
        ) : (
          candidates.map((c) => {
            const isDeclined = c.candidate_status === 'rejected';
            const formStatus = c.email ? applicationFormStatuses?.get(c.email) : undefined;
            const showFormPending = !isDeclined && formStatus === 'pending';

            if (isDeclined) {
              const declineReason = c.pending_approval_decline_reason?.trim() || null;
              return (
                <Card
                  key={c.id}
                  className={cn(KANBAN_CARD_CHROME, 'cursor-default', CARD_SURFACE.declined)}
                >
                  <CardContent className="px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-medium text-sm truncate flex-1 min-w-0 line-through text-muted-foreground">
                        {c.name}
                      </p>
                      {c.suitability_score != null && <FitBadge score={c.suitability_score} />}
                      <span className={cn(CHIP_BASE, CHIP_TONE.danger)}>
                        Declined
                      </span>
                    </div>
                    {declineReason && (
                      <p
                        className="text-caption text-muted-foreground italic line-clamp-2"
                        title={declineReason}
                      >
                        “{declineReason}”
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card
                key={c.id}
                className={cn(KANBAN_CARD_CHROME, 'cursor-pointer')}
                onClick={() => onCardClick(c)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      {showFormPending && <ApplicationFormStatusBadge status="pending" />}
                      <p className="font-medium text-sm truncate">{c.name}</p>
                    </div>
                    {c.suitability_score != null && <FitBadge score={c.suitability_score} />}
                  </div>
                  {canApprove && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1 bg-success text-success-foreground hover:bg-success/90"
                      disabled={isApproving}
                      onClick={(e) => { e.stopPropagation(); onApprove(c.id); }}
                    >
                      <Check className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDecline(c); }}
                    >
                      <XIcon className="w-3 h-3 mr-1" /> Decline
                    </Button>
                  </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

export function PipelineCardContent({ interview }: { interview: HolisticInterview }) {
  const candidate = interview.candidate;
  const fitScore = (interview.candidate as { suitability_score?: number | null } | undefined)?.suitability_score;
  return (
    <Card className={cn(KANBAN_CARD_CHROME, 'shadow-popover hover:shadow-popover scale-[1.02]')}>
      <CardContent className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="font-medium text-sm truncate flex-1 min-w-0">{candidate?.name || 'Unknown'}</p>
          {fitScore != null && <FitBadge score={fitScore} />}
          {interview.overall_score != null && (
            <Badge variant="neutral" className="h-5 shrink-0 gap-0.5 px-1.5 tabular-nums">
              <Star className="w-3 h-3" /> {interview.overall_score}/5
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
