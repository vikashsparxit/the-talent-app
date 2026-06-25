import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useStartAssessment,
  useSaveResponse,
  useSubmitAssessment,
  useCandidateResponses,
  useLogIntegrityEvent,
  type CandidateAssessmentInfo,
  type PortalQuestion,
  type CodingTestCase,
} from '@/hooks/useCandidatePortal';
import { useToast } from '@/hooks/use-toast';
import {
  computeIntegrityStats,
  formatSecondsAway,
  getTabSwitchWarningMessage,
  normalizeIntegrityLog,
} from '@/lib/integrity';
import type { IntegrityEvent } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, Eye, CheckCircle2 } from 'lucide-react';
import { CodeEditor } from './CodeEditor';
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
      const startTime = new Date(assessmentInfo.started_at).getTime();
      const duration = assessmentInfo.assessment.duration_minutes * 60 * 1000;
      const endTime = startTime + duration;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeRemaining(remaining);
    }
  }, [assessmentInfo.started_at, assessmentInfo.assessment.duration_minutes, isStarted]);

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

  // Track tab visibility and integrity events
  useEffect(() => {
    if (!isStarted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const timestamp = new Date().toISOString();
        const tabSwitchEvent: IntegrityEvent = { type: 'tab_switch', timestamp };

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
        const focusEvent: IntegrityEvent = {
          type: 'focus_lost',
          timestamp: new Date().toISOString(),
          duration_seconds: duration,
        };

        setIntegrityLog((prev) => [...prev, focusEvent]);
        hiddenSinceRef.current = null;
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${supabaseUrl}/functions/v1/candidate-portal`;
      const payload = JSON.stringify({
        action: 'auto-complete',
        access_token: accessToken,
        data: {
          responses: responsesRef.current,
        },
      });
      navigator.sendBeacon(
        url + `?apikey=${anonKey}`,
        new Blob([payload], { type: 'application/json' })
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isStarted, accessToken]);

  const handleStart = async () => {
    if (assessmentInfo.status === 'invited') {
      await startAssessment.mutateAsync({
        candidateAssessmentId: assessmentInfo.id,
        accessToken,
        consentSource,
      });
    }
    setIsStarted(true);
    const duration = assessmentInfo.assessment.duration_minutes * 60;
    setTimeRemaining(duration);
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
    await Promise.all(savePromises);
  }, [responses, assessmentInfo.id, saveResponse, accessToken]);

  const handleAutoSubmit = async () => {
    if (isSubmittedRef.current) return;
    isSubmittedRef.current = true;
    try {
      await saveAllResponses();
      await submitAssessment.mutateAsync({
        candidateAssessmentId: assessmentInfo.id,
        accessToken,
      });
      setIsSubmitted(true);
    } catch (err) {
      isSubmittedRef.current = false;
      console.error('Auto-submit failed:', err);
      // Fallback: use sendBeacon as last resort
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${supabaseUrl}/functions/v1/candidate-portal?apikey=${anonKey}`;
      navigator.sendBeacon(
        url,
        new Blob([JSON.stringify({
          action: 'auto-complete',
          access_token: accessToken,
          data: { responses: responsesRef.current },
        })], { type: 'application/json' })
      );
    }
  };

  const handleSubmit = async () => {
    isSubmittedRef.current = true;
    try {
      await saveAllResponses();
      await submitAssessment.mutateAsync({
        candidateAssessmentId: assessmentInfo.id,
        accessToken,
      });
      setIsSubmitted(true);
    } catch (err) {
      isSubmittedRef.current = false;
      const message = err instanceof Error ? err.message : 'Failed to submit assessment';
      toast({
        variant: 'destructive',
        title: 'Failed to submit',
        description: message,
      });
    }
  };

  const handleResponseChange = (questionId: string, value: Json) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const currentQuestion = allQuestions[currentIndex];
  const answeredCount = Object.keys(responses).filter(
    (qId) => responses[qId] !== null && responses[qId] !== '' && responses[qId] !== undefined
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
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <Clock className="h-12 w-12 mx-auto text-primary mb-4" />
              <h2 className="text-xl font-semibold mb-2">Ready to Begin?</h2>
              <p className="text-muted-foreground mb-6">
                You have {assessmentInfo.assessment.duration_minutes} minutes to complete {allQuestions.length} questions.
              </p>
              <Button onClick={handleStart} disabled={startAssessment.isPending} className="w-full">
                {startAssessment.isPending ? 'Starting...' : 'Begin Assessment'}
              </Button>
            </CardContent>
          </Card>
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
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b shadow-sm">
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

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={submitAssessment.isPending}>
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
                <AlertDialogFooter>
                  <AlertDialogCancel>Continue Test</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>Submit Now</AlertDialogAction>
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
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Question Palette */}
        <aside className="hidden md:block w-64 border-r bg-muted/30 p-4 overflow-y-auto">
          <h3 className="text-sm font-medium mb-3">Questions</h3>
          <div className="grid grid-cols-5 gap-2">
            {allQuestions.map((q, idx) => {
              const isAnswered = responses[q.id] !== undefined && responses[q.id] !== null && responses[q.id] !== '';
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : isAnswered
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
          {currentQuestion && (
            <QuestionDisplay
              question={currentQuestion}
              questionNumber={currentIndex + 1}
              totalQuestions={allQuestions.length}
              response={responses[currentQuestion.id]}
              onResponseChange={(value) => handleResponseChange(currentQuestion.id, value)}
              accessToken={accessToken}
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
        </main>
      </div>
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
}

function QuestionDisplay({
  question,
  questionNumber,
  totalQuestions,
  response,
  onResponseChange,
  onExecutionResult,
  accessToken,
}: QuestionDisplayProps) {
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mcq': return 'Multiple Choice';
      case 'coding': return 'Coding';
      case 'subjective': return 'Subjective';
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
    // Store as object with code and execution results
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
              value={String(response ?? '')}
              onChange={(e) => onResponseChange(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[200px]"
            />
            {question.subjective_max_words && (
              <p className="text-xs text-muted-foreground text-right">
                Max words: {question.subjective_max_words}
              </p>
            )}
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
          />
        )}
      </CardContent>
    </Card>
  );
}
