import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarDays, Video, MapPin, Phone, Loader2, Link, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { CandidateInterview, InterviewMode } from '@/hooks/useInterviewPipeline';
import type { ScheduleInterviewData } from '@/lib/interviewPanelists';
import {
  findPanelistScheduleConflicts,
  summarizeScheduleConflicts,
  type PanelistScheduleConflict,
} from '@/lib/interviewConflicts';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: CandidateInterview | null;
  onSubmit: (data: ScheduleInterviewData) => void;
  isSubmitting?: boolean;
  inline?: boolean;
  prescreenFormIncomplete?: boolean;
}

interface InterviewerOption {
  user_id: string;
  full_name: string;
  email: string;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const MINUTES = [0, 15, 30, 45];
const MAX_PANELISTS = 4;

function formatHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

/** Non-empty http(s) URL for video meeting links. */
function isValidMeetingLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

function meetingLinkValidationMessage(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Meeting link is required for video interviews';
  if (!isValidMeetingLink(trimmed)) {
    return 'Enter a valid meeting URL (https://…)';
  }
  return null;
}

const modeConfig: { value: InterviewMode; label: string; icon: React.ElementType }[] = [
  { value: 'video', label: 'Video Call', icon: Video },
  { value: 'in_person', label: 'In Person', icon: MapPin },
  { value: 'phone', label: 'Phone', icon: Phone },
];

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  interview,
  onSubmit,
  isSubmitting,
  inline,
  prescreenFormIncomplete,
}: ScheduleInterviewDialogProps) {
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [loadingInterviewers, setLoadingInterviewers] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedHour, setSelectedHour] = useState<string>('10');
  const [selectedMinute, setSelectedMinute] = useState<string>('0');
  const [selectedPanelists, setSelectedPanelists] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<InterviewMode>('video');
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingLinkError, setMeetingLinkError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<PanelistScheduleConflict[] | null>(null);
  const [pendingSubmitData, setPendingSubmitData] = useState<ScheduleInterviewData | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && interview) {
      if (interview.scheduled_at) {
        const d = new Date(interview.scheduled_at);
        setSelectedDate(d);
        setSelectedHour(String(d.getHours()));
        setSelectedMinute(String(d.getMinutes()));
      } else {
        setSelectedDate(undefined);
        setSelectedHour('10');
        setSelectedMinute('0');
      }
      setSelectedMode(interview.interview_mode || 'video');
      setMeetingLink(interview.meeting_link || '');
      setMeetingLinkError(null);
      setPendingConflicts(null);
      setPendingSubmitData(null);
    }
  }, [open, interview]);

  useEffect(() => {
    if (!open || !interview?.id) return;
    let cancelled = false;

    (async () => {
      const panelists = (interview as CandidateInterview & { panelists?: { user_id: string }[] }).panelists;
      if (panelists?.length) {
        if (!cancelled) setSelectedPanelists(panelists.map(p => p.user_id));
        return;
      }

      const { data } = await supabase
        .from('candidate_interview_panelists')
        .select('interviewer_user_id')
        .eq('candidate_interview_id', interview.id);

      if (cancelled) return;
      const ids = (data ?? []).map(row => row.interviewer_user_id);
      if (ids.length) {
        setSelectedPanelists(ids);
      } else if (interview.interviewer_user_id) {
        setSelectedPanelists([interview.interviewer_user_id]);
      } else {
        setSelectedPanelists([]);
      }
    })();

    return () => { cancelled = true; };
  }, [open, interview?.id, interview?.interviewer_user_id, interview]);

  useEffect(() => {
    if (!open) return;
    setLoadingInterviewers(true);
    (async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('can_conduct_interviews', true)
        .order('full_name', { ascending: true });
      setInterviewers((profiles || []).map(p => ({
        user_id: p.user_id,
        full_name: p.full_name || p.email,
        email: p.email,
      })));
      setLoadingInterviewers(false);
    })();
  }, [open]);

  const togglePanelist = (userId: string, checked: boolean) => {
    setSelectedPanelists(prev => {
      if (checked) {
        if (prev.includes(userId) || prev.length >= MAX_PANELISTS) return prev;
        return [...prev, userId];
      }
      return prev.filter(id => id !== userId);
    });
  };

  const buildSubmitData = (): ScheduleInterviewData | null => {
    if (selectedPanelists.length === 0) return null;
    let scheduled_at: string | null = null;
    if (selectedDate) {
      const dt = new Date(selectedDate);
      dt.setHours(Number(selectedHour), Number(selectedMinute), 0, 0);
      scheduled_at = dt.toISOString();
    }
    return {
      scheduled_at,
      interviewer_user_ids: selectedPanelists,
      interview_mode: selectedMode,
      meeting_link: selectedMode === 'video' ? meetingLink.trim() : undefined,
    };
  };

  const handleModeChange = (mode: InterviewMode) => {
    setSelectedMode(mode);
    if (mode !== 'video') setMeetingLinkError(null);
  };

  const handleMeetingLinkChange = (value: string) => {
    setMeetingLink(value);
    if (meetingLinkError) {
      setMeetingLinkError(meetingLinkValidationMessage(value));
    }
  };

  const handleSubmit = async () => {
    const data = buildSubmitData();
    if (!data) return;

    if (selectedMode === 'video') {
      const linkError = meetingLinkValidationMessage(meetingLink);
      if (linkError) {
        setMeetingLinkError(linkError);
        toast({ title: 'Meeting link required', description: linkError, variant: 'destructive' });
        return;
      }
      setMeetingLinkError(null);
    }

    if (!data.scheduled_at) {
      onSubmit(data);
      return;
    }

    setCheckingConflicts(true);
    try {
      const conflicts = await findPanelistScheduleConflicts({
        panelistUserIds: data.interviewer_user_ids,
        scheduledAt: data.scheduled_at,
        excludeInterviewId: interview?.id,
        excludeCandidateId: interview?.candidate_id,
        excludeStageId: interview?.job_interview_stage_id,
      });
      if (conflicts.length > 0) {
        setPendingSubmitData(data);
        setPendingConflicts(conflicts);
        return;
      }
      onSubmit(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not check for scheduling conflicts';
      toast({ title: 'Conflict check failed', description: message, variant: 'destructive' });
    } finally {
      setCheckingConflicts(false);
    }
  };

  const confirmScheduleDespiteConflicts = () => {
    if (!pendingSubmitData) return;
    onSubmit(pendingSubmitData);
    setPendingConflicts(null);
    setPendingSubmitData(null);
  };

  const candidateName = interview?.candidate?.name || 'Candidate';
  const stageName = interview?.job_interview_stage?.stage_name || 'Interview';
  const isRescheduling = !!interview?.scheduled_at;
  const videoLinkOk = selectedMode !== 'video' || isValidMeetingLink(meetingLink);
  const canSubmit = selectedPanelists.length >= 1 && videoLinkOk;

  const Header = inline ? 'div' : DialogHeader;
  const Title = inline
    ? ({ className, children }: { className?: string; children: React.ReactNode }) => (
        <div className={cn('text-lg font-semibold leading-none tracking-tight', className)}>{children}</div>
      )
    : DialogTitle;
  const Desc = inline
    ? ({ children }: { children: React.ReactNode }) => (
        <p className="text-sm text-muted-foreground">{children}</p>
      )
    : DialogDescription;
  const Footer = inline
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">{children}</div>
      )
    : DialogFooter;

  const formInner = (
    <>
      <Header>
        <Title className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          {isRescheduling ? 'Reschedule Interview' : 'Schedule Interview'}
        </Title>
        <Desc>
          {candidateName} — <span className="font-medium text-foreground">{stageName}</span>
        </Desc>
      </Header>

      {prescreenFormIncomplete && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          This candidate has not completed the digital job application form yet.
        </div>
      )}

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label>Date <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !selectedDate && 'text-muted-foreground')}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setCalendarOpen(false); }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {selectedDate && <div className="space-y-2">
            <Label>Time</Label>
            <div className="flex gap-2">
              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map(h => (
                    <SelectItem key={h} value={String(h)}>{formatHour(h)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map(m => (
                    <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>}

          <div className="space-y-2">
            <Label>
              Panelists <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal text-xs ml-1">
                (1–{MAX_PANELISTS})
              </span>
            </Label>
            {loadingInterviewers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading interviewers...
              </div>
            ) : interviewers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No interviewers found. Enable &quot;Can Interview&quot; for users in Settings.</p>
            ) : (
              <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
                {interviewers.map(iv => {
                  const checked = selectedPanelists.includes(iv.user_id);
                  const atMax = selectedPanelists.length >= MAX_PANELISTS && !checked;
                  return (
                    <label
                      key={iv.user_id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors',
                        atMax && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={atMax}
                        onCheckedChange={(value) => togglePanelist(iv.user_id, value === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{iv.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{iv.email}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedPanelists.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedPanelists.length} panelist{selectedPanelists.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Interview Mode</Label>
            <div className="flex gap-2">
              {modeConfig.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleModeChange(value)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border-2 text-xs font-medium transition-all',
                    selectedMode === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground/40 text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {selectedMode === 'video' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5" htmlFor="schedule-meeting-link">
                <Link className="h-3.5 w-3.5 text-muted-foreground" />
                Meeting Link <span className="text-destructive">*</span>
              </Label>
              <Input
                id="schedule-meeting-link"
                placeholder="https://meet.google.com/... or https://teams.microsoft.com/..."
                value={meetingLink}
                onChange={(e) => handleMeetingLinkChange(e.target.value)}
                aria-invalid={!!meetingLinkError}
                aria-describedby={meetingLinkError ? 'schedule-meeting-link-error' : undefined}
                className={cn(meetingLinkError && 'border-destructive focus-visible:ring-destructive')}
              />
              {meetingLinkError ? (
                <p id="schedule-meeting-link-error" className="text-xs text-destructive">
                  {meetingLinkError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Required for video interviews
                </p>
              )}
            </div>
          )}
        </div>

        <Footer>
          {!inline && <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>}
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || isSubmitting || checkingConflicts}
            className="btn-gradient text-primary-foreground"
          >
            {isSubmitting || checkingConflicts ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {checkingConflicts ? 'Checking…' : 'Saving...'}</>
            ) : (
              <><CalendarDays className="h-4 w-4 mr-2" />{isRescheduling ? 'Reschedule' : 'Schedule'}</>
            )}
          </Button>
        </Footer>
    </>
  );

  const conflictConfirm = (
    <AlertDialog
      open={!!pendingConflicts?.length}
      onOpenChange={(next) => {
        if (!next) {
          setPendingConflicts(null);
          setPendingSubmitData(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Scheduling conflict
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                One or more panelists already have an interview that overlaps this slot.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 whitespace-pre-line">
                {summarizeScheduleConflicts(pendingConflicts ?? [])}
              </div>
              <p>Schedule anyway only if this overlap is intentional.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={confirmScheduleDespiteConflicts}>
            Schedule anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (inline) {
    return (
      <>
        {formInner}
        {conflictConfirm}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          {formInner}
        </DialogContent>
      </Dialog>
      {conflictConfirm}
    </>
  );
}
