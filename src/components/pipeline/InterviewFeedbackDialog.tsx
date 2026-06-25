import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Star, ThumbsUp, ThumbsDown, Pause, UserX, CalendarDays, X, AlertTriangle, Paperclip, Link2, ExternalLink, Upload, Trash2, Loader2, NotebookPen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import type { InterviewVerdict, InterviewMode, RatingCategories, CandidateInterview, InterviewArtifact } from '@/hooks/useInterviewPipeline';
import { useScorecardTemplate } from '@/hooks/useScorecardTemplate';
import { useInterviewKit, useGenerateInterviewKit } from '@/hooks/useInterviewKit';
import { defaultRatingsForCriteria } from '@/lib/scorecardTemplates';
import { InterviewKitPanel } from '@/components/pipeline/InterviewKitPanel';
import { isPastInterview } from '@/lib/interviewKit';

interface InterviewFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: CandidateInterview | null;
  onSubmit: (data: {
    verdict: InterviewVerdict;
    overall_score: number | null;
    rating_categories: RatingCategories | null;
    feedback: string;
    artifacts: InterviewArtifact[];
    interview_mode?: InterviewMode;
    completed_at: string;
    rejection_reason?: string | null;
  }) => void;
  isSubmitting?: boolean;
  // Forced mode props
  forced?: boolean;
  pendingCount?: number;
  onNoShow?: () => void;
  onReschedule?: () => void;
  onCancelled?: () => void;
  // Inline mode — render form content without a dialog wrapper (for queue panel)
  inline?: boolean;
  // Optional: clicking the candidate name opens the detail drawer
  onCandidateClick?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const verdictConfig: { value: InterviewVerdict; label: string; icon: React.ComponentType<{ className?: string }>; className: string }[] = [
  { value: 'proceeded', label: 'Proceed', icon: ThumbsUp, className: 'border-green-500 bg-green-500/10 text-green-700 hover:bg-green-500/20' },
  { value: 'rejected', label: 'Reject', icon: ThumbsDown, className: 'border-red-500 bg-red-500/10 text-red-700 hover:bg-red-500/20' },
  { value: 'hold', label: 'Hold', icon: Pause, className: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20' },
  { value: 'no_show', label: 'No-show', icon: UserX, className: 'border-muted bg-muted/50 text-muted-foreground hover:bg-muted' },
];

// Legacy fallback — replaced by scorecard template criteria when available

// Non-dismissable dialog content — no X button, blocks Escape and backdrop clicks
function ForcedDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <DialogPortal>
      <DialogOverlay className="bg-black/60" />
      <DialogPrimitive.Content
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
          'bg-background shadow-lg duration-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          'rounded-lg border',
          className,
        )}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function InterviewFeedbackDialog({
  open, onOpenChange, interview, onSubmit, isSubmitting,
  forced, pendingCount, onNoShow, onReschedule, onCancelled, inline, onCandidateClick,
}: InterviewFeedbackDialogProps) {
  const [verdict, setVerdict] = useState<InterviewVerdict | ''>('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [mode, setMode] = useState<InterviewMode | ''>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [didntHappenOpen, setDidntHappenOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<InterviewArtifact[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stageName = interview?.job_interview_stage?.stage_name || 'Interview';
  const interviewIsPast = isPastInterview(interview?.scheduled_at);
  const { data: scorecardTemplate } = useScorecardTemplate(stageName);
  const criteria = scorecardTemplate?.criteria ?? [];
  const { data: interviewKit, isLoading: kitLoading } = useInterviewKit(interview?.id);
  const generateKit = useGenerateInterviewKit();
  const kitLoadAttempted = useRef<string | null>(null);

  // Reset form when interview or template changes
  useEffect(() => {
    const defaultRatings = defaultRatingsForCriteria(criteria);
    const existing = (interview?.rating_categories || {}) as Record<string, number>;
    const merged = { ...defaultRatings, ...existing };

    setVerdict('');
    setRatings(merged);
    setFeedback('');
    setMode(interview?.interview_mode || '');
    setRejectionReason('');
    setDidntHappenOpen(false);
    setArtifacts((interview?.artifacts as InterviewArtifact[]) || []);
    setUploadingCount(0);
    setShowLinkForm(false);
    setLinkUrl('');
    setLinkLabel('');
    setNotes(interview?.interview_notes || '');
    setIsDrafting(false);

    // Load draft saved from the candidate drawer notes panel
    if (interview?.id) {
      const draftKey = `sparx_feedback_draft_${interview.id}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try {
          const d = JSON.parse(saved);
          if (d.verdict_suggestion) setVerdict(d.verdict_suggestion as InterviewVerdict);
          const draftRatings = { ...merged };
          for (const c of criteria) {
            if (d[c.key] != null) draftRatings[c.key] = d[c.key];
          }
          setRatings(draftRatings);
          if (d.feedback) setFeedback(d.feedback);
          localStorage.removeItem(draftKey);
        } catch { /* ignore malformed draft */ }
      }
    }
  }, [interview?.id, criteria.length]);

  // Auto-load interview kit from template on first open (upcoming/current only)
  useEffect(() => {
    if (!interview?.id || !open || kitLoading || interviewKit || interviewIsPast) return;
    if (kitLoadAttempted.current === interview.id) return;
    kitLoadAttempted.current = interview.id;
    generateKit.mutate({
      interview_id: interview.id,
    });
  }, [interview?.id, open, kitLoading, interviewKit?.id, stageName, interviewIsPast]);

  // Auto-save notes 1s after user stops typing
  useEffect(() => {
    if (!interview?.id) return;
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      supabase.from('candidate_interviews')
        .update({ interview_notes: notes } as any)
        .eq('id', interview.id)
        .then(() => {});
    }, 1000);
    return () => { if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current); };
  }, [notes, interview?.id]);

  const handleDraftFeedback = useCallback(async () => {
    if (!notes.trim() || !interview || isDrafting) return;
    setIsDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke('draft-feedback', {
        body: {
          interview_id: interview.id,
          notes: notes.trim(),
          candidate_name: interview.candidate?.name,
          stage_name: stageName,
          job_title: (interview as CandidateInterview & { job_title?: string }).job_title,
          criteria: criteria.map(c => ({ key: c.key, label: c.label })),
          ...getDevGeminiKeyBody(),
        },
      });
      if (error || !data?.draft) throw new Error(error?.message || 'No draft returned');
      const d = data.draft;
      if (d.verdict_suggestion) setVerdict(d.verdict_suggestion as InterviewVerdict);
      setRatings(prev => {
        const next = { ...prev };
        for (const c of criteria) {
          if (d[c.key] != null) next[c.key] = d[c.key];
        }
        return next;
      });
      if (d.feedback) setFeedback(d.feedback);
    } catch (err: unknown) {
      console.error('Draft feedback error:', err);
    } finally {
      setIsDrafting(false);
    }
  }, [notes, interview, isDrafting, stageName, criteria]);

  const isNoShow = verdict === 'no_show';

  const handleSubmit = () => {
    if (!verdict) return;
    const categoryValues = Object.values(ratings).filter((v): v is number => v != null);
    const computedScore = categoryValues.length > 0
      ? Math.round((categoryValues.reduce((a, b) => a + b, 0) / categoryValues.length) * 10) / 10
      : null;
    onSubmit({
      verdict: verdict as InterviewVerdict,
      overall_score: isNoShow ? null : computedScore,
      rating_categories: isNoShow ? null : (ratings as RatingCategories),
      feedback,
      artifacts,
      interview_mode: mode || undefined,
      completed_at: new Date().toISOString(),
      rejection_reason: verdict === 'rejected' && rejectionReason ? rejectionReason : null,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !interview) return;
    setUploadingCount(c => c + files.length);
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${interview.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('interview-artifacts').upload(path, file);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('interview-artifacts').getPublicUrl(path);
        setArtifacts(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'file',
          url: publicUrl,
          name: file.name,
          mime: file.type,
          size: file.size,
          added_at: new Date().toISOString(),
        }]);
      }
      setUploadingCount(c => c - 1);
    }
    e.target.value = '';
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    setArtifacts(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'link',
      url: linkUrl.trim(),
      name: linkLabel.trim() || linkUrl.trim(),
      added_at: new Date().toISOString(),
    }]);
    setLinkUrl('');
    setLinkLabel('');
    setShowLinkForm(false);
  };

  const candidateName = interview?.candidate?.name || interview?.candidate?.email || 'Candidate';

  const handleGenerateKit = (forceGemini?: boolean) => {
    if (!interview?.id) return;
    generateKit.mutate({
      interview_id: interview.id,
      force_regenerate: !!forceGemini,
      force_gemini: forceGemini,
    });
  };

  // When rendered inline (no Dialog wrapper), Radix DialogHeader/DialogTitle require
  // a Dialog context that doesn't exist — use plain divs with equivalent styling instead.
  const Header = inline ? 'div' : DialogHeader;
  const Title = inline
    ? ({ className, children }: { className?: string; children: React.ReactNode }) => (
        <div className={cn('text-lg font-semibold leading-none tracking-tight', className)}>{children}</div>
      )
    : DialogTitle;
  const Footer = inline
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">{children}</div>
      )
    : DialogFooter;

  const formContent = (
    <>
      <Header>
        <Title className="flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          {forced ? 'Feedback Required' : 'Submit Feedback'}
          {forced && pendingCount && pendingCount > 1 && (
            <Badge variant="destructive" className="ml-auto text-[10px] px-2 py-0.5">
              {pendingCount} pending
            </Badge>
          )}
        </Title>
        {forced && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mt-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              You have a past interview awaiting feedback. Please submit feedback or mark what happened before continuing.
            </p>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {onCandidateClick ? (
            <button
              type="button"
              onClick={onCandidateClick}
              className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none"
            >
              {candidateName}
            </button>
          ) : (
            <span className="font-medium text-foreground">{candidateName}</span>
          )}
          {' '}— <span className="font-medium text-foreground">{stageName}</span>
        </p>
      </Header>

      <div className="space-y-6 py-2">
        {(!interviewIsPast || kitLoading || (interviewKit?.questions?.length ?? 0) > 0) && (
          <InterviewKitPanel
            kit={interviewKit}
            isLoading={kitLoading}
            isGenerating={generateKit.isPending}
            onGenerate={handleGenerateKit}
            allowGenerate={!interviewIsPast}
          />
        )}

        {/* Interview Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <NotebookPen className="w-3.5 h-3.5 text-muted-foreground" />
              Interview Notes
              <span className="text-xs text-muted-foreground font-normal">(auto-saved)</span>
            </Label>
            {notes.trim() && (
              <button
                type="button"
                onClick={handleDraftFeedback}
                disabled={isDrafting}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors font-medium"
              >
                {isDrafting
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                {isDrafting ? 'Drafting…' : 'Draft with AI'}
              </button>
            )}
          </div>
          <Textarea
            placeholder="Jot raw notes during the interview — observations, strengths, concerns…"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="resize-none text-sm"
          />
        </div>

        {/* Verdict */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Verdict</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {verdictConfig.map(v => {
              const Icon = v.icon;
              return (
                <button
                  key={v.value}
                  onClick={() => setVerdict(v.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                    verdict === v.value ? v.className + ' ring-2 ring-offset-1' : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rejection Reason — shown only when verdict is 'rejected' */}
        {verdict === 'rejected' && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Rejection Reason</Label>
            <Select value={rejectionReason} onValueChange={setRejectionReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skill_gap">Skill Gap</SelectItem>
                <SelectItem value="culture_fit">Culture Fit</SelectItem>
                <SelectItem value="salary_mismatch">Salary Mismatch</SelectItem>
                <SelectItem value="communication">Communication</SelectItem>
                <SelectItem value="overqualified">Overqualified</SelectItem>
                <SelectItem value="no_show_final">No-Show (Final)</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Scorecard criteria */}
        <div className={`space-y-3 ${isNoShow ? 'opacity-40 pointer-events-none' : ''}`}>
          <div>
            <Label className="text-sm font-medium">
              Scorecard
              {scorecardTemplate && (
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  {scorecardTemplate.display_name}
                </span>
              )}
            </Label>
            {isNoShow && <p className="text-xs text-muted-foreground mt-1">Ratings not applicable for no-show</p>}
          </div>
          {criteria.map(({ key, label, scale_hint }) => (
            <div key={key} className="flex items-start gap-3">
              <div className="w-32 shrink-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                {scale_hint && (
                  <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{scale_hint}</p>
                )}
              </div>
              <div className="flex gap-1 flex-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRatings(prev => ({ ...prev, [key]: n }))}
                    disabled={isNoShow}
                    className={`w-8 h-8 rounded-md text-xs font-medium transition-all ${
                      !isNoShow && (ratings[key] || 0) >= n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Interview Mode */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Interview Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as InterviewMode)}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="video">Video Call</SelectItem>
              <SelectItem value="in_person">In Person</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Feedback */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Detailed Feedback</Label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Share your observations, strengths, areas of improvement..."
            rows={4}
          />
        </div>

        {/* Work Samples & Artifacts */}
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" />
            Work Samples
            <span className="text-muted-foreground font-normal text-xs">(optional)</span>
          </Label>

          {artifacts.length > 0 && (
            <div className="space-y-1.5">
              {artifacts.map(a => (
                <div key={a.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  {a.type === 'file'
                    ? <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    : <Link2 className="w-3.5 h-3.5 shrink-0 text-primary" />
                  }
                  <span className="flex-1 truncate text-xs">{a.name}</span>
                  {a.type === 'file' && a.size != null && (
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatBytes(a.size)}</span>
                  )}
                  {a.type === 'link' && (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setArtifacts(prev => prev.filter(x => x.id !== a.id))}
                    className="shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadingCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Uploading {uploadingCount} file{uploadingCount > 1 ? 's' : ''}…
            </div>
          )}

          {showLinkForm ? (
            <div className="flex flex-col gap-1.5 p-2.5 border rounded-lg bg-muted/20">
              <Input
                placeholder="https://…"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                className="h-8 text-xs"
                onKeyDown={e => e.key === 'Enter' && handleAddLink()}
              />
              <Input
                placeholder="Label (optional)"
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                className="h-8 text-xs"
                onKeyDown={e => e.key === 'Enter' && handleAddLink()}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim()}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setShowLinkForm(false); setLinkUrl(''); setLinkLabel(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv"
                  onChange={handleFileUpload}
                  disabled={uploadingCount > 0}
                />
                <div className={cn(
                  'flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2.5 py-1.5 transition-colors select-none',
                  uploadingCount > 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/60 cursor-pointer'
                )}>
                  <Upload className="w-3.5 h-3.5" /> Upload file
                </div>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground"
                onClick={() => setShowLinkForm(true)}
              >
                <Link2 className="w-3.5 h-3.5" /> Add link
              </Button>
            </div>
          )}
        </div>

        {/* "Interview Didn't Happen" — forced mode only */}
        {forced && (
          <div className="border-t pt-4">
            {!didntHappenOpen ? (
              <Button
                variant="ghost"
                className="w-full text-muted-foreground text-sm"
                onClick={() => setDidntHappenOpen(true)}
              >
                Interview didn't happen?
              </Button>
            ) : (
              <div className="rounded-lg bg-muted/50 border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">What happened?</p>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={onNoShow}
                  disabled={isSubmitting}
                >
                  <UserX className="w-4 h-4 mr-2 text-red-500" />
                  Candidate didn't show up
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={onReschedule}
                  disabled={isSubmitting}
                >
                  <CalendarDays className="w-4 h-4 mr-2 text-blue-500" />
                  Interview was rescheduled — pick a new time
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={onCancelled}
                  disabled={isSubmitting}
                >
                  <X className="w-4 h-4 mr-2" />
                  Interview was cancelled
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setDidntHappenOpen(false)}
                >
                  Back
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Footer>
        {!forced && (
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!verdict || isSubmitting}
          className="btn-gradient text-primary-foreground"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
        </Button>
      </Footer>
    </>
  );

  if (inline) {
    return <div className="p-6">{formContent}</div>;
  }

  if (forced) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <ForcedDialogContent className="max-w-lg w-full max-h-[90dvh] overflow-y-auto p-6">
          {formContent}
        </ForcedDialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
