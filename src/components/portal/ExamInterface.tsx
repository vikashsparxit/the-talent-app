import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useStartAssessment,
  useSaveResponse,
  useSubmitAssessment,
  useCandidateResponses,
  useLogIntegrityEvent,
  useCreateAssessmentFileUpload,
  resolvePortalAccessToken,
  type CandidateAssessmentInfo,
  type PortalQuestion,
} from '@/hooks/useCandidatePortal';
import { useToast } from '@/hooks/use-toast';
import {
  computeIntegrityStats,
  formatSecondsAway,
  getTabSwitchWarningMessage,
  normalizeIntegrityLog,
} from '@/lib/integrity';
import {
  ASSESSMENT_FILE_MAX_BYTES,
  buildFileUploadResponse,
  isAllowedGoogleDriveLink,
  isFileUploadAnswered,
  parseFileConfig,
  parseFileUploadResponse,
  type FileUploadFileMeta,
  type FileUploadLinkMeta,
} from '@/lib/assessmentFileUpload';
import { safeExternalUrl } from '@/lib/utils';
import { examEndsAt, isAttemptOverError } from '@/lib/assessmentGrading';
import { usePasteGuard, type PasteAttempt } from '@/hooks/usePasteGuard';
import type { IntegrityEvent, MediaIntegrityEventType } from '@/types/database';
import { isSpokenAnswered } from '@/lib/spokenAnswer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, Eye, CheckCircle2, Upload, Link2, X, FileText, Loader2, RefreshCw } from 'lucide-react';
import { CodeEditor } from './CodeEditor';
import { SpokenAnswer } from './SpokenAnswer';
import { ExamMediaGate } from './ExamMediaGate';
import { RecordingIndicator } from './RecordingIndicator';
import { useExamMedia } from '@/hooks/useExamMedia';
import {
  AUTO_SUBMIT_FLUSH_TIMEOUT_MS,
  SUBMIT_FLUSH_TIMEOUT_MS,
  useWebcamRecording,
} from '@/hooks/useWebcamRecording';
import { AssessmentPortalHeader } from '@/components/CompanyLogo';
import type { Json } from '@/integrations/supabase/types';
import type { ExecutionResult } from '@/hooks/useCodeExecution';

interface ExamInterfaceProps {
  assessmentInfo: CandidateAssessmentInfo;
  accessToken: string;
  consentSource?: string;
  homeHref?: string;
}

export default function ExamInterface({ assessmentInfo, accessToken, consentSource = 'exam_portal_magic_link', homeHref }: ExamInterfaceProps) {
  const startAssessment = useStartAssessment();
  const saveResponse = useSaveResponse();
  const submitAssessment = useSubmitAssessment();
  const logIntegrity = useLogIntegrityEvent();
  const { toast } = useToast();
  const { data: savedResponses = [] } = useCandidateResponses(assessmentInfo.id, accessToken);

  const [integrityLog, setIntegrityLog] = useState<IntegrityEvent[]>(() =>
    normalizeIntegrityLog(assessmentInfo.integrity_log)
  );
  const [hiddenSince, setHiddenSince] = useState<number | null>(null);
  const [currentAwaySeconds, setCurrentAwaySeconds] = useState(0);
  const hiddenSinceRef = useRef<number | null>(null);

  // Flatten all questions
  const allQuestions = useMemo(() => {
    return assessmentInfo.assessment.sections.flatMap((s) =>
      s.questions.map((q) => ({ ...q, sectionTitle: s.title }))
    );
  }, [assessmentInfo]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, Json>>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isStarted, setIsStarted] = useState(assessmentInfo.status === 'in_progress');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize responses from saved data
  useEffect(() => {
    if (savedResponses.length > 0) {
      const initialResponses: Record<string, Json> = {};
      savedResponses.forEach((r) => {
        initialResponses[r.question_id] = r.response;
      });
      setResponses(initialResponses);
    }
  }, [savedResponses]);

  // Calculate remaining time
  useEffect(() => {
    if (assessmentInfo.started_at && isStarted) {
      // The server enforces the same end (plus a short grace): start + duration or the deadline.
      const endTime = examEndsAt(
        assessmentInfo.started_at,
        assessmentInfo.assessment.duration_minutes,
        assessmentInfo.deadline,
      );
      if (endTime !== null) {
        setTimeRemaining(Math.max(0, Math.floor((endTime - Date.now()) / 1000)));
      }
    }
  }, [assessmentInfo.started_at, assessmentInfo.assessment.duration_minutes, assessmentInfo.deadline, isStarted]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!isStarted) return;

    const autoSaveInterval = setInterval(() => {
      saveAllResponses();
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [isStarted, responses]);

  const logIntegrityRef = useRef(logIntegrity);
  logIntegrityRef.current = logIntegrity;

  // Current question context for integrity events (ref avoids rebinding visibility handler)
  const currentQuestionRef = useRef<{
    question_id: string;
    question_index: number;
    section_title: string;
  } | null>(null);
  const questionWhenHiddenRef = useRef<typeof currentQuestionRef.current>(null);

  useEffect(() => {
    const q = allQuestions[currentIndex];
    currentQuestionRef.current = q
      ? {
          question_id: q.id,
          question_index: currentIndex + 1,
          section_title: q.sectionTitle,
        }
      : null;
  }, [allQuestions, currentIndex]);

  // Track tab visibility and integrity events
  useEffect(() => {
    if (!isStarted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const timestamp = new Date().toISOString();
        const questionCtx = currentQuestionRef.current;
        questionWhenHiddenRef.current = questionCtx;
        const tabSwitchEvent: IntegrityEvent = {
          type: 'tab_switch',
          timestamp,
          ...(questionCtx ?? {}),
        };

        setIntegrityLog((prev) => {
          const nextLog = [...prev, tabSwitchEvent];
          const switchCount = computeIntegrityStats(nextLog).tabSwitchCount;
          const warning = getTabSwitchWarningMessage(switchCount);
          toast({
            title: warning.title,
            description: warning.description,
            variant: warning.variant,
          });
          return nextLog;
        });

        hiddenSinceRef.current = Date.now();
        setHiddenSince(hiddenSinceRef.current);
        setCurrentAwaySeconds(0);

        logIntegrityRef.current.mutate({
          candidateAssessmentId: assessmentInfo.id,
          event: tabSwitchEvent,
          accessToken,
        });
      } else if (hiddenSinceRef.current) {
        const duration = Math.floor((Date.now() - hiddenSinceRef.current) / 1000);
        const questionCtx = questionWhenHiddenRef.current ?? currentQuestionRef.current;
        const focusEvent: IntegrityEvent = {
          type: 'focus_lost',
          timestamp: new Date().toISOString(),
          duration_seconds: duration,
          ...(questionCtx ?? {}),
        };

        setIntegrityLog((prev) => [...prev, focusEvent]);
        hiddenSinceRef.current = null;
        questionWhenHiddenRef.current = null;
        setHiddenSince(null);
        setCurrentAwaySeconds(0);

        logIntegrityRef.current.mutate({
          candidateAssessmentId: assessmentInfo.id,
          event: focusEvent,
          accessToken,
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isStarted, assessmentInfo.id, accessToken, toast]);

  // Blocked pastes are logged for the reviewer only; no escalation warnings, no effect on score.
  const handlePasteAttempt = useCallback(
    ({ inputKind, chars }: PasteAttempt) => {
      const pasteEvent: IntegrityEvent = {
        type: 'paste_attempt',
        timestamp: new Date().toISOString(),
        ...(currentQuestionRef.current ?? {}),
        input_kind: inputKind,
        ...(chars !== undefined ? { chars } : {}),
      };
      setIntegrityLog((prev) => [...prev, pasteEvent]);
      logIntegrityRef.current.mutate({
        candidateAssessmentId: assessmentInfo.id,
        event: pasteEvent,
        accessToken,
      });
    },
    [assessmentInfo.id, accessToken]
  );

  // Live counter for current away session
  useEffect(() => {
    if (!isStarted || hiddenSince === null) return;

    const interval = setInterval(() => {
      setCurrentAwaySeconds(Math.floor((Date.now() - hiddenSince) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted, hiddenSince]);

  const integrityStats = useMemo(
    () => computeIntegrityStats(integrityLog, hiddenSince ? currentAwaySeconds : 0),
    [integrityLog, hiddenSince, currentAwaySeconds]
  );

  // Keep a ref to responses so beacon can access latest state
  const responsesRef = useRef(responses);
  useEffect(() => { responsesRef.current = responses; }, [responses]);
  const isSubmittedRef = useRef(false);

  // sendBeacon cannot carry the signed-in session, so the dashboard path
  // resolves the attempt's link token up front for the browser-close fallback.
  const beaconTokenRef = useRef<string | null>(accessToken === 'session' ? null : accessToken);
  useEffect(() => {
    if (!isStarted) return;
    if (accessToken !== 'session') {
      beaconTokenRef.current = accessToken;
      return;
    }
    let cancelled = false;
    resolvePortalAccessToken(accessToken, assessmentInfo.id)
      .then((token) => {
        if (!cancelled) beaconTokenRef.current = token;
      })
      .catch(() => {
        /* no fallback token; the server-side sweep still submits overdue attempts */
      });
    return () => {
      cancelled = true;
    };
  }, [isStarted, accessToken, assessmentInfo.id]);

  const sendAutoCompleteBeacon = useCallback(() => {
    const token = beaconTokenRef.current;
    if (!token) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    navigator.sendBeacon(
      `${supabaseUrl}/functions/v1/candidate-portal?apikey=${anonKey}`,
      new Blob([JSON.stringify({
        action: 'auto-complete',
        access_token: token,
        data: { responses: responsesRef.current },
      })], { type: 'application/json' })
    );
  }, []);

  // Beforeunload warning + sendBeacon on browser close
  useEffect(() => {
    if (!isStarted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmittedRef.current) return;
      e.preventDefault();
      // Modern browsers ignore custom messages but still show a prompt
      e.returnValue = '';
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      if (isSubmittedRef.current) return;
      // Use sendBeacon to notify the backend to auto-complete the assessment
      sendAutoCompleteBeacon();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isStarted, sendAutoCompleteBeacon]);

  const handleStart = async () => {
    // The server starts the clock, so only once consent and camera/mic are in place.
    if (!media.ready) return;
    if (assessmentInfo.status === 'invited') {
      await startAssessment.mutateAsync({
        candidateAssessmentId: assessmentInfo.id,
        accessToken,
        consentSource,
      });
    }
    setIsStarted(true);
    const endTime = examEndsAt(
      new Date().toISOString(),
      assessmentInfo.assessment.duration_minutes,
      assessmentInfo.deadline,
    );
    setTimeRemaining(endTime === null ? null : Math.max(0, Math.floor((endTime - Date.now()) / 1000)));
  };

  const saveAllResponses = useCallback(async () => {
    const savePromises = Object.entries(responses)
      .filter(([, response]) => response !== null && response !== undefined && response !== '')
      .map(([questionId, response]) =>
        saveResponse.mutateAsync({
          candidateAssessmentId: assessmentInfo.id,
          questionId,
          response,
          accessToken,
        })
      );
    const results = await Promise.allSettled(savePromises);
    // A save refused because the attempt is already over (submitted, or past
    // its time limit and auto-submitted by the server) must not block submit.
    const blocking = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected' && !isAttemptOverError(r.reason),
    );
    if (blocking) throw blocking.reason;
  }, [responses, assessmentInfo.id, saveResponse, accessToken]);

  // Spoken questions with a take recorded but not saved (reported by SpokenAnswer).
  const [unsavedSpoken, setUnsavedSpoken] = useState<ReadonlySet<string>>(() => new Set());
  const handleSpokenUnsavedChange = useCallback((questionId: string, unsaved: boolean) => {
    setUnsavedSpoken((prev) => {
      if (prev.has(questionId) === unsaved) return prev;
      const next = new Set(prev);
      if (unsaved) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  }, []);
  const unsavedSpokenNumbers = allQuestions.flatMap((q, i) => (unsavedSpoken.has(q.id) ? [i + 1] : []));

  // Submit guard: recording segments still waiting to upload are flushed first;
  // segments not uploaded (waiting or given up) trigger the warning.
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitCheck, setSubmitCheck] = useState<'idle' | 'flushing' | 'incomplete' | 'submitting'>('idle');
  const [pendingAfterFlush, setPendingAfterFlush] = useState(0);
  const [autoSubmitFlushing, setAutoSubmitFlushing] = useState(false);
  const submitCheckRunRef = useRef(0);

  // A signal for reviewers only (like other media events): never a score, stage or hiring decision.
  const logIncompleteMedia = async (submittedBy: 'candidate' | 'timer', pendingSegments: number) => {
    if (pendingSegments === 0 && unsavedSpokenNumbers.length === 0) return;
    const event: IntegrityEvent = {
      type: 'media_incomplete_at_submit',
      timestamp: new Date().toISOString(),
      submitted_by: submittedBy,
      pending_segments: pendingSegments,
      unsaved_spoken_questions: unsavedSpokenNumbers,
    };
    setIntegrityLog((prev) => [...prev, event]);
    // Logged before the submit: the attempt refuses events once it is completed.
    await logIntegrity.mutateAsync({ candidateAssessmentId: assessmentInfo.id, event, accessToken });
  };

  const handleAutoSubmit = async () => {
    if (isSubmittedRef.current) return;
    isSubmittedRef.current = true;
    setIsSubmitting(true);
    setSubmitDialogOpen(false);
    try {
      await saveAllResponses();
      // Best effort and bounded: the server's grace after time up is longer than this wait.
      setAutoSubmitFlushing(true);
      const pendingSegments = await webcam.flush(AUTO_SUBMIT_FLUSH_TIMEOUT_MS);
      setAutoSubmitFlushing(false);
      await logIncompleteMedia('timer', pendingSegments);
      await submitAssessment.mutateAsync({
        candidateAssessmentId: assessmentInfo.id,
        accessToken,
      });
      setIsSubmitted(true);
      void webcam.finish();
    } catch (err) {
      isSubmittedRef.current = false;
      setIsSubmitting(false);
      setAutoSubmitFlushing(false);
      console.error('Auto-submit failed:', err);
      // Fallback: use sendBeacon as last resort
      sendAutoCompleteBeacon();
    }
  };

  const handleSubmit = async () => {
    if (isSubmittedRef.current) return;
    isSubmittedRef.current = true;
    setSubmitDialogOpen(false);
    setIsSubmitting(true);
    try {
      await saveAllResponses();
      await submitAssessment.mutateAsync({
        candidateAssessmentId: assessmentInfo.id,
        accessToken,
      });
      setIsSubmitted(true);
      void webcam.finish();
    } catch (err) {
      isSubmittedRef.current = false;
      setIsSubmitting(false);
      const message = err instanceof Error ? err.message : 'Failed to submit assessment';
      toast({
        variant: 'destructive',
        title: 'Failed to submit',
        description: message,
      });
    }
  };

  // "Submit Now" and "Try again": upload what is waiting, then submit, or say what is not saved.
  const flushThenSubmit = async () => {
    const run = ++submitCheckRunRef.current;
    setSubmitCheck('flushing');
    const pendingSegments = await webcam.flush(SUBMIT_FLUSH_TIMEOUT_MS);
    if (run !== submitCheckRunRef.current) return; // dialog closed meanwhile
    setPendingAfterFlush(pendingSegments);
    if (pendingSegments > 0 || unsavedSpokenNumbers.length > 0) {
      setSubmitCheck('incomplete');
      return;
    }
    setSubmitCheck('idle');
    await handleSubmit();
  };

  // The candidate's choice after the warning: submitted as is, with a note for the reviewer.
  const submitAnyway = async () => {
    const run = ++submitCheckRunRef.current;
    setSubmitCheck('submitting');
    await logIncompleteMedia('candidate', pendingAfterFlush);
    if (run !== submitCheckRunRef.current) return;
    setSubmitCheck('idle');
    await handleSubmit();
  };

  const handleSubmitDialogOpenChange = (open: boolean) => {
    if (!open && submitCheck === 'submitting') return;
    submitCheckRunRef.current++; // a flush still running no longer submits
    setSubmitCheck('idle');
    setSubmitDialogOpen(open);
  };

  const goToQuestion = (questionNumber: number) => {
    setCurrentIndex(questionNumber - 1);
    handleSubmitDialogOpenChange(false);
  };

  const handleResponseChange = (questionId: string, value: Json) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  // Camera/mic/recording problems are logged as signals for reviewers only.
  const handleMediaIntegrityEvent = useCallback(
    (type: MediaIntegrityEventType) => {
      const event: IntegrityEvent = {
        type,
        timestamp: new Date().toISOString(),
        ...(currentQuestionRef.current ?? {}),
      };
      setIntegrityLog((prev) => [...prev, event]);
      logIntegrityRef.current.mutate({ candidateAssessmentId: assessmentInfo.id, event, accessToken });
    },
    [assessmentInfo.id, accessToken],
  );

  // Recording is always on: consent, then camera + microphone, before answering.
  const mediaAuth = useMemo(
    () => ({ accessToken, candidateAssessmentId: assessmentInfo.id }),
    [accessToken, assessmentInfo.id],
  );
  const media = useExamMedia({ auth: mediaAuth, started: isStarted, onSignal: handleMediaIntegrityEvent });
  // The webcam records the whole attempt; it pauses while the gate is up or a submit is in flight.
  const webcam = useWebcamRecording({
    auth: mediaAuth,
    stream: media.stream,
    active: isStarted && !isSubmitted && !isSubmitting && media.ready,
    onSignal: handleMediaIntegrityEvent,
  });

  const currentQuestion = allQuestions[currentIndex];
  const isAnswered = (type: string | undefined, val: Json | undefined) => {
    if (type === 'file_upload') return isFileUploadAnswered(val);
    if (type === 'spoken') return isSpokenAnswered(val);
    return val !== null && val !== '' && val !== undefined;
  };
  const answeredCount = Object.keys(responses).filter((qId) =>
    isAnswered(allQuestions.find((aq) => aq.id === qId)?.type, responses[qId]),
  ).length;

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AssessmentPortalHeader homeHref={homeHref} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-xl">
            <ExamMediaGate media={media}>
              <Card className="max-w-md w-full mx-auto">
                <CardContent className="pt-6 text-center">
                  <Clock className="h-12 w-12 mx-auto text-primary mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Ready to Begin?</h2>
                  <p className="text-muted-foreground mb-2">
                    You have {assessmentInfo.assessment.duration_minutes} minutes to complete {allQuestions.length} questions.
                  </p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Your camera and microphone are recorded until you submit. Keep them on.
                  </p>
                  <Button onClick={handleStart} disabled={startAssessment.isPending || !media.ready} className="w-full">
                    {startAssessment.isPending ? 'Starting...' : 'Begin Assessment'}
                  </Button>
                </CardContent>
              </Card>
            </ExamMediaGate>
          </div>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AssessmentPortalHeader homeHref={homeHref} />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Assessment Completed</h2>
              <p className="text-muted-foreground mb-2">
                You have successfully completed {assessmentInfo.assessment.title}.
              </p>
              <p className="text-sm text-muted-foreground">
                Your responses have been submitted. The hiring team will review your assessment and follow up.
              </p>
              {webcam.pending > 0 && (
                <p className="text-sm text-muted-foreground mt-3 flex items-center justify-center gap-2" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading the rest of your recording. Please keep this page open for a moment.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b shadow-xs">
        <AssessmentPortalHeader sticky={false} className="border-b-0" homeHref={homeHref} />
        <div className="container mx-auto px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{assessmentInfo.assessment.title}</p>
            <p className="text-xs text-muted-foreground truncate">{assessmentInfo.candidate.name}</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 justify-end shrink-0">
            <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs sm:text-sm">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {integrityStats.tabSwitchCount} switch{integrityStats.tabSwitchCount !== 1 ? 'es' : ''}
                {' · '}
                {formatSecondsAway(integrityStats.totalSecondsAway)} away
              </span>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              timeRemaining !== null && timeRemaining < 300 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                : 'bg-muted'
            }`}>
              <Clock className="h-4 w-4" />
              <span className="font-mono font-medium">
                {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
              </span>
            </div>

            <AlertDialog open={submitDialogOpen} onOpenChange={handleSubmitDialogOpenChange}>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={submitAssessment.isPending || isSubmitting}>
                  <Send className="h-4 w-4 mr-2" />
                  Submit
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit Assessment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have answered {answeredCount} of {allQuestions.length} questions.
                    {answeredCount < allQuestions.length && (
                      <span className="block mt-2 text-amber-600">
                        <AlertTriangle className="h-4 w-4 inline mr-1" />
                        Some questions are unanswered!
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {submitCheck === 'flushing' && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading your recording… Please keep this page open.
                  </p>
                )}
                {submitCheck === 'incomplete' && (
                  <Alert variant="destructive" role="alert">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Not everything has been saved</AlertTitle>
                    <AlertDescription className="space-y-2">
                      {pendingAfterFlush > 0 && (
                        <p>
                          Your recording is incomplete ({pendingAfterFlush} part
                          {pendingAfterFlush !== 1 ? 's' : ''} not saved). Check your connection and try again.
                        </p>
                      )}
                      {unsavedSpokenNumbers.map((n) => (
                        <p key={n}>
                          Your spoken answer for question {n} hasn't been saved.{' '}
                          <Button type="button" variant="link" className="h-auto p-0" onClick={() => goToQuestion(n)}>
                            Go to question {n}
                          </Button>
                        </p>
                      ))}
                      <p>If you submit anyway, anything not uploaded may be lost.</p>
                    </AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={submitCheck === 'submitting'}>Continue Test</AlertDialogCancel>
                  {submitCheck === 'incomplete' || submitCheck === 'submitting' ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void flushThenSubmit()}
                        disabled={submitCheck === 'submitting'}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try again
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void submitAnyway()}
                        disabled={submitCheck === 'submitting'}
                      >
                        Submit anyway
                      </Button>
                    </>
                  ) : (
                    <Button type="button" onClick={() => void flushThenSubmit()} disabled={submitCheck === 'flushing'}>
                      {submitCheck === 'flushing' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading recording…
                        </>
                      ) : (
                        'Submit Now'
                      )}
                    </Button>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <div className="container mx-auto px-4 pb-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            Integrity events are recorded and shared with the hiring team.
          </p>
          {autoSubmitFlushing && (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Time is up. Uploading your recording before submitting…
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Question Palette */}
        <aside className="hidden md:block w-64 border-r bg-muted/30 p-4 overflow-y-auto">
          <h3 className="text-sm font-medium mb-3">Questions</h3>
          <div className="grid grid-cols-5 gap-2">
            {allQuestions.map((q, idx) => {
              const answered = isAnswered(q.type, responses[q.id]);
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : answered
                      ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                      : 'bg-background border hover:bg-muted'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700"></span>
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-background border"></span>
              <span>Unanswered ({allQuestions.length - answeredCount})</span>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Integrity Monitor
            </p>
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p>Tab switches: <span className="font-medium">{integrityStats.tabSwitchCount}</span></p>
              <p>Time away: <span className="font-medium">{formatSecondsAway(integrityStats.totalSecondsAway)}</span></p>
            </div>
            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-snug">
              Integrity events are recorded and shared with the hiring team.
            </p>
          </div>
        </aside>

        {/* Question Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <ExamMediaGate media={media} showPreview={false}>
            {currentQuestion && (
              <QuestionDisplay
                question={currentQuestion}
                questionNumber={currentIndex + 1}
                totalQuestions={allQuestions.length}
                response={responses[currentQuestion.id]}
                onResponseChange={(value) => handleResponseChange(currentQuestion.id, value)}
                accessToken={accessToken}
                candidateAssessmentId={assessmentInfo.id}
                onMediaIntegrityEvent={handleMediaIntegrityEvent}
                mediaStream={media.stream}
                onPasteAttempt={handlePasteAttempt}
                onSpokenUnsavedChange={(unsaved) => handleSpokenUnsavedChange(currentQuestion.id, unsaved)}
              />
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button
                onClick={() => setCurrentIndex((prev) => Math.min(allQuestions.length - 1, prev + 1))}
                disabled={currentIndex === allQuestions.length - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </ExamMediaGate>
        </main>
      </div>
      <RecordingIndicator stream={media.stream} phase={webcam.phase} pending={webcam.pending} />
    </div>
  );
}

interface QuestionDisplayProps {
  question: PortalQuestion & { sectionTitle: string };
  questionNumber: number;
  totalQuestions: number;
  response: Json | undefined;
  onResponseChange: (value: Json) => void;
  onExecutionResult?: (result: ExecutionResult) => void;
  accessToken?: string;
  candidateAssessmentId: string;
  onMediaIntegrityEvent: (type: MediaIntegrityEventType) => void;
  /** The exam's camera + microphone stream; spoken answers record its audio instead of opening the mic again. */
  mediaStream: MediaStream | null;
  onPasteAttempt?: (attempt: PasteAttempt) => void;
  /** Spoken questions: whether a take is recorded but not saved. */
  onSpokenUnsavedChange?: (unsaved: boolean) => void;
}

export function QuestionDisplay({
  question,
  questionNumber,
  totalQuestions,
  response,
  onResponseChange,
  onExecutionResult,
  accessToken,
  candidateAssessmentId,
  onMediaIntegrityEvent,
  mediaStream,
  onPasteAttempt,
  onSpokenUnsavedChange,
}: QuestionDisplayProps) {
  const { toast } = useToast();
  const subjectivePasteGuard = usePasteGuard({
    inputKind: 'subjective',
    throttleKey: question.id,
    onAttempt: onPasteAttempt,
  });
  const createUpload = useCreateAssessmentFileUpload();
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mcq': return 'Multiple Choice';
      case 'coding': return 'Coding';
      case 'subjective': return 'Subjective';
      case 'file_upload': return 'File Upload';
      case 'spoken': return 'Spoken answer';
      default: return type;
    }
  };

  // Parse response for coding questions to extract code
  const getCodeFromResponse = (): string => {
    if (response === undefined || response === null) {
      return question.coding_starter_code ?? '';
    }
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && 'code' in (response as object)) {
      return String((response as { code: unknown }).code);
    }
    return question.coding_starter_code ?? '';
  };

  const handleCodeChange = (code: string) => {
    const currentResponse = typeof response === 'object' && response !== null ? response : {};
    onResponseChange({ ...currentResponse, code } as Json);
  };

  const handleExecutionResult = (result: ExecutionResult) => {
    const currentResponse = typeof response === 'object' && response !== null ? response : {};
    const currentCode = getCodeFromResponse();
    onResponseChange({
      ...currentResponse,
      code: currentCode,
      execution_result: {
        passed_count: result.passed_count,
        total_count: result.total_count,
        score_percentage: result.score_percentage,
        success: result.success,
      },
    } as Json);
    onExecutionResult?.(result);
  };

  const fileCfg = parseFileConfig(question.file_config);
  const fileResponse = parseFileUploadResponse(response);
  const currentFile = fileResponse?.file ?? null;
  const currentLink = fileResponse?.link ?? null;

  const commitFileUploadParts = (parts: {
    file?: FileUploadFileMeta | null;
    link?: FileUploadLinkMeta | null;
  }) => {
    const next = buildFileUploadResponse(parts);
    if (!next) {
      onResponseChange(null as unknown as Json);
      return;
    }
    onResponseChange(next as unknown as Json);
  };

  const handleFileSelected = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !accessToken) return;

    if (file.size > ASSESSMENT_FILE_MAX_BYTES) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum size is 10 MB. Please upload a smaller file or paste a Google Drive link.',
      });
      return;
    }

    if (!fileCfg.allowed_mime_types.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Unsupported file type',
        description: 'Please upload an image (JPEG, PNG, GIF, WebP) or PDF.',
      });
      return;
    }

    setUploading(true);
    try {
      const uploaded = await createUpload.mutateAsync({
        candidateAssessmentId,
        questionId: question.id,
        file,
        accessToken,
      });
      commitFileUploadParts({ file: uploaded, link: currentLink });
      toast({ title: 'File uploaded' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload file',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveLink = () => {
    const url = linkInput.trim();
    if (!url) {
      setLinkError('Enter a Google Drive link');
      return;
    }
    if (!isAllowedGoogleDriveLink(url)) {
      setLinkError('Only Google Drive or Google Docs share links are allowed (https).');
      return;
    }
    setLinkError(null);
    commitFileUploadParts({ file: currentFile, link: { url } });
    setLinkInput('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="outline">{question.sectionTitle}</Badge>
          <span className="text-sm text-muted-foreground">
            Question {questionNumber} of {totalQuestions}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge>{getTypeLabel(question.type)}</Badge>
          <Badge variant="secondary">{question.marks} marks</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-lg mb-6">{question.question_text}</CardTitle>

        {question.type === 'mcq' && question.options && (
          <RadioGroup
            value={String(response ?? '')}
            onValueChange={(value) => onResponseChange(value)}
            className="space-y-3"
          >
            {question.options.map((opt) => (
              <div
                key={opt.id}
                className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <RadioGroupItem value={opt.id} id={opt.id} />
                <Label htmlFor={opt.id} className="flex-1 cursor-pointer">
                  {opt.text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {question.type === 'subjective' && (
          <div className="space-y-2">
            <Textarea
              {...subjectivePasteGuard}
              value={String(response ?? '')}
              onChange={(e) => onResponseChange(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[200px]"
            />
            <div className="flex items-start justify-between gap-4 text-xs text-muted-foreground">
              <p>Pasting is disabled. Paste attempts are recorded for the reviewer.</p>
              {question.subjective_max_words && (
                <p className="shrink-0">Max words: {question.subjective_max_words}</p>
              )}
            </div>
          </div>
        )}

        {question.type === 'coding' && (
          <CodeEditor
            code={getCodeFromResponse()}
            language={question.coding_language ?? 'javascript'}
            testCases={question.coding_test_cases ?? []}
            questionId={question.id}
            accessToken={accessToken}
            onCodeChange={handleCodeChange}
            onExecutionResult={handleExecutionResult}
            onPasteAttempt={onPasteAttempt}
          />
        )}

        {question.type === 'spoken' && accessToken && (
          <SpokenAnswer
            key={question.id}
            question={question}
            candidateAssessmentId={candidateAssessmentId}
            accessToken={accessToken}
            response={response}
            onSaved={(saved) => onResponseChange(saved as unknown as Json)}
            onIntegrityEvent={onMediaIntegrityEvent}
            audioSource={mediaStream}
            onUnsavedChange={onSpokenUnsavedChange}
          />
        )}

        {question.type === 'file_upload' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Submit one file (image or PDF, max 10 MB) and/or a Google Drive share link.
              Files over 10 MB must use a Drive link.
            </p>

            {fileCfg.allow_file && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  File upload
                </Label>
                {currentFile ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{currentFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(currentFile.size / 1024).toFixed(1)} KB · {currentFile.mime}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => commitFileUploadParts({ file: null, link: currentLink })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Input
                      type="file"
                      accept={fileCfg.allowed_mime_types.join(',')}
                      disabled={uploading}
                      onChange={(e) => {
                        void handleFileSelected(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    {uploading && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading…
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {fileCfg.allow_link && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Google Drive link
                </Label>
                {currentLink ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      {safeExternalUrl(currentLink.url) ? (
                      <a
                        href={safeExternalUrl(currentLink.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline break-all"
                      >
                        {currentLink.url}
                      </a>
                      ) : (
                        <span className="text-sm break-all">{currentLink.url}</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => commitFileUploadParts({ file: currentFile, link: null })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={linkInput}
                      onChange={(e) => {
                        setLinkInput(e.target.value);
                        setLinkError(null);
                      }}
                      placeholder="https://drive.google.com/..."
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={handleSaveLink}>
                      Save link
                    </Button>
                  </div>
                )}
                {linkError && <p className="text-xs text-destructive">{linkError}</p>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
