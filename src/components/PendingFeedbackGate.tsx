import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePendingFeedbackInterviews } from '@/hooks/usePendingFeedbackInterviews';
import { InterviewFeedbackDialog } from '@/components/pipeline/InterviewFeedbackDialog';
import { ScheduleInterviewDialog } from '@/components/pipeline/ScheduleInterviewDialog';
import { CandidateDetailDrawer } from '@/components/candidates/CandidateDetailDrawer';
import { InterviewKitDrawer } from '@/components/pipeline/InterviewKitDrawer';
import { useInterviewKitDrawerHost } from '@/hooks/useInterviewKitDrawerHost';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { InterviewMode, CandidateInterview } from '@/hooks/useInterviewPipeline';
import { applyInterviewSchedule, syncInterviewPanelists, type ScheduleInterviewData } from '@/lib/interviewPanelists';
import { notifyStaffEmail } from '@/lib/staffEmail';
import { openCandidateDetailWithFetch } from '@/lib/candidateDetail';
import type { Candidate } from '@/types/database';

export function PendingFeedbackGate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { pendingInterviews, hasPending } = usePendingFeedbackInterviews();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drawerCandidate, setDrawerCandidate] = useState<Candidate | null>(null);

  const closeDrawerCandidate = useCallback(() => setDrawerCandidate(null), []);
  const detailOpen = !!drawerCandidate;
  const {
    drawerBackdropOpen,
    closeAll,
    interviewKitDrawerProps,
    candidateDrawerKitProps,
  } = useInterviewKitDrawerHost({
    detailOpen,
    onCloseDetail: closeDrawerCandidate,
  });

  const openDrawerCandidate = (stub: Partial<Candidate> & Pick<Candidate, 'id'>) => {
    void openCandidateDetailWithFetch(stub, setDrawerCandidate);
  };

  const currentInterview: CandidateInterview | null =
    (selectedId ? pendingInterviews.find(iv => iv.id === selectedId) : null) ??
    pendingInterviews[0] ??
    null;

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pending-feedback-interviews'] }),
      queryClient.invalidateQueries({ queryKey: ['my-interviews-upcoming'] }),
      queryClient.invalidateQueries({ queryKey: ['my-interviews-past'] }),
      queryClient.invalidateQueries({ queryKey: ['scheduled-interviews'] }),
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews'] }),
    ]);
  };

  const handleFeedbackSubmit = async (data: {
    verdict: string;
    overall_score: number | null;
    rating_categories: object | null;
    feedback: string;
    artifacts: any[];
    interview_mode?: InterviewMode;
    completed_at: string;
    rejection_reason?: string | null;
  }) => {
    if (!currentInterview) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('candidate_interviews')
        .update({
          verdict: data.verdict,
          overall_score: data.overall_score,
          rating_categories: data.rating_categories,
          feedback: data.feedback,
          artifacts: data.artifacts,
          interview_mode: data.interview_mode,
          completed_at: data.completed_at,
          ...(data.rejection_reason != null && { rejection_reason: data.rejection_reason }),
        })
        .eq('id', currentInterview.id);

      if (error) throw error;
      notifyStaffEmail('verdict_submitted', currentInterview.id);
      setSelectedId(null);
      await invalidateAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit feedback', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNoShow = async () => {
    if (!currentInterview) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('candidate_interviews')
        .update({ verdict: 'no_show', completed_at: new Date().toISOString() })
        .eq('id', currentInterview.id);

      if (error) throw error;
      notifyStaffEmail('verdict_submitted', currentInterview.id);
      setSelectedId(null);
      await invalidateAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelled = async () => {
    if (!currentInterview) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('candidate_interviews')
        .update({ scheduled_at: null, interviewer_user_id: null })
        .eq('id', currentInterview.id);

      if (error) throw error;
      await syncInterviewPanelists(currentInterview.id, []);
      setSelectedId(null);
      await invalidateAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRescheduleSubmit = async (data: ScheduleInterviewData) => {
    if (!currentInterview) return;
    setIsSubmitting(true);
    try {
      await applyInterviewSchedule(currentInterview.id, data);
      setShowReschedule(false);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['interview-kit', currentInterview.id] });
      await invalidateAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to reschedule', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPending || !currentInterview) return null;

  if (pendingInterviews.length === 1) {
    return (
      <>
        <InterviewFeedbackDialog
          open={!showReschedule}
          onOpenChange={() => {}}
          interview={currentInterview}
          onSubmit={handleFeedbackSubmit}
          isSubmitting={isSubmitting}
          forced={true}
          pendingCount={1}
          onNoShow={handleNoShow}
          onReschedule={() => setShowReschedule(true)}
          onCancelled={handleCancelled}
          onCandidateClick={() => currentInterview.candidate && openDrawerCandidate(currentInterview.candidate)}
        />
        <ScheduleInterviewDialog
          open={showReschedule}
          onOpenChange={(open) => { if (!open) setShowReschedule(false); }}
          interview={currentInterview}
          onSubmit={handleRescheduleSubmit}
          isSubmitting={isSubmitting}
        />
        <InterviewKitDrawer {...interviewKitDrawerProps} />
        <CandidateDetailDrawer
          candidate={drawerCandidate}
          open={detailOpen}
          onOpenChange={(open) => !open && closeDrawerCandidate()}
          isInterviewerOnly={false}
          contextInterviewId={currentInterview.id}
          {...candidateDrawerKitProps}
        />
        {drawerBackdropOpen && (
          <button
            type="button"
            aria-label="Close drawer"
            className="fixed inset-0 z-[39] bg-black/80 animate-in fade-in-0"
            onClick={closeAll}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background border rounded-2xl shadow-2xl flex w-full max-w-4xl max-h-[90vh] overflow-hidden">

          <div className="w-64 shrink-0 border-r flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold">Pending Feedback</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pendingInterviews.length} interview{pendingInterviews.length !== 1 ? 's' : ''} awaiting your input
              </p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y">
              {pendingInterviews.map((iv, idx) => {
                const isActive = iv.id === currentInterview.id;
                const hoursOverdue = iv.scheduled_at
                  ? Math.round((Date.now() - new Date(iv.scheduled_at).getTime()) / 3_600_000)
                  : 0;
                return (
                  <button
                    key={iv.id}
                    onClick={() => { setShowReschedule(false); setSelectedId(iv.id); }}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors',
                      isActive
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-500'
                        : 'hover:bg-muted/50 border-l-2 border-transparent',
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className={cn('text-sm font-medium truncate', isActive ? 'text-amber-700 dark:text-amber-400' : '')}>
                        {idx + 1}. {iv.candidate?.name || (iv.candidate as any)?.email || 'Unknown'}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {(iv.job_interview_stage as any)?.stage_name || 'Interview'}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                        {hoursOverdue}h overdue
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t bg-muted/20">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Submit each to clear the queue
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {showReschedule ? (
              <div className="p-6">
                <ScheduleInterviewDialog
                  open={true}
                  onOpenChange={(open) => { if (!open) setShowReschedule(false); }}
                  interview={currentInterview}
                  onSubmit={handleRescheduleSubmit}
                  isSubmitting={isSubmitting}
                  inline={true}
                />
              </div>
            ) : (
              <InterviewFeedbackDialog
                open={true}
                onOpenChange={() => {}}
                interview={currentInterview}
                onSubmit={handleFeedbackSubmit}
                isSubmitting={isSubmitting}
                forced={true}
                pendingCount={pendingInterviews.length}
                onNoShow={handleNoShow}
                onReschedule={() => setShowReschedule(true)}
                onCancelled={handleCancelled}
                inline={true}
                onCandidateClick={() => currentInterview.candidate && openDrawerCandidate(currentInterview.candidate)}
              />
            )}
          </div>
        </div>
      </div>

      <InterviewKitDrawer {...interviewKitDrawerProps} />
      <CandidateDetailDrawer
        candidate={drawerCandidate}
        open={detailOpen}
        onOpenChange={(open) => !open && closeDrawerCandidate()}
        isInterviewerOnly={true}
        contextInterviewId={currentInterview.id}
        {...candidateDrawerKitProps}
      />
      {drawerBackdropOpen && (
        <button
          type="button"
          aria-label="Close drawer"
          className="fixed inset-0 z-[39] bg-black/80 animate-in fade-in-0"
          onClick={closeAll}
        />
      )}
    </>
  );
}
