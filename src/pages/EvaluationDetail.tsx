import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { useParams, useNavigate } from 'react-router';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  User, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Code,
  FileText,
  ListChecks,
  MessageSquare,
  Save,
  ShieldCheck,
  ShieldX,
  RotateCcw,
  Upload,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { useToast } from '@/hooks/use-toast';
import { 
  useEvaluationDetails, 
  useGradeResponse, 
  useMarkAsEvaluated,
  useOverrideResult,
  useSaveEvaluatorNotes,
  useCreateResponseForGrading,
  useAiGradeAssessment,
} from '@/hooks/useEvaluations';
import {
  computeIntegrityStats,
  formatSecondsAway,
  getIntegrityEventLabel,
  normalizeIntegrityLog,
} from '@/lib/integrity';
import { parseFileUploadResponse } from '@/lib/assessmentFileUpload';
import { supabase } from '@/integrations/supabase/client';
import type { CandidateResponse, Question, MCQOption } from '@/types/database';

function AssessmentFilePreview({ path, name, mime }: { path: string; name: string; mime: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: signError } = await supabase.storage
        .from('assessment-artifacts')
        .createSignedUrl(path, 3600);
      if (cancelled) return;
      if (signError || !data?.signedUrl) {
        setError(signError?.message ?? 'Could not open file');
        setSignedUrl(null);
      } else {
        setSignedUrl(data.signedUrl);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading file…
      </p>
    );
  }

  if (error || !signedUrl) {
    return <p className="text-sm text-destructive">{error ?? 'File unavailable'}</p>;
  }

  const isImage = mime.startsWith('image/');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">{name}</span>
        <Button variant="outline" size="sm" asChild>
          <a href={signedUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open file
          </a>
        </Button>
      </div>
      {isImage ? (
        <img
          src={signedUrl}
          alt={name}
          className="max-h-80 rounded-lg border object-contain bg-muted/30"
        />
      ) : mime === 'application/pdf' ? (
        <iframe
          title={name}
          src={signedUrl}
          className="w-full h-96 rounded-lg border bg-muted/30"
        />
      ) : null}
    </div>
  );
}

// Card for a question that HAS a response
function ResponseCard({ 
  response, 
  question,
  onGrade,
  isGrading,
  canGrade,
}: { 
  response: CandidateResponse; 
  question: Question;
  onGrade: (score: number, feedback: string) => void;
  isGrading: boolean;
  canGrade: boolean;
}) {
  const [score, setScore] = useState<string>(response.manual_score?.toString() ?? response.auto_score?.toString() ?? '');
  const [feedback, setFeedback] = useState(response.feedback ?? '');
  const [isEditing, setIsEditing] = useState(false);

  const renderResponse = () => {
    const responseData = response.response;
    
    if (question.type === 'mcq') {
      const selectedId = typeof responseData === 'object' && responseData !== null 
        ? (responseData as Record<string, unknown>).selected_option || (responseData as Record<string, unknown>).selected
        : responseData;
      
      return (
        <div className="space-y-2">
          {question.options?.map((opt: MCQOption) => {
            const isSelected = opt.id === selectedId || String(selectedId) === opt.id;
            const isCorrect = opt.is_correct;
            
            return (
              <div 
                key={opt.id} 
                className={`p-3 rounded-lg border ${
                  isSelected && isCorrect ? 'bg-green-500/10 border-green-500/30' :
                  isSelected && !isCorrect ? 'bg-red-500/10 border-red-500/30' :
                  isCorrect ? 'bg-green-500/5 border-green-500/20' :
                  'bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected && (
                    isCorrect 
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span>{opt.text}</span>
                  {isCorrect && !isSelected && (
                    <Badge variant="outline" className="ml-auto text-green-600 border-green-600/30">
                      Correct Answer
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (question.type === 'coding') {
      const code = typeof responseData === 'object' && responseData !== null 
        ? (responseData as Record<string, unknown>).code 
        : responseData;
      
      return (
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
          {String(code || 'No code submitted')}
        </pre>
      );
    }

    if (question.type === 'subjective') {
      const answer = typeof responseData === 'object' && responseData !== null 
        ? (responseData as Record<string, unknown>).answer 
        : responseData;
      
      return (
        <div className="bg-muted p-4 rounded-lg">
          <p className="whitespace-pre-wrap">{String(answer || 'No answer submitted')}</p>
        </div>
      );
    }

    if (question.type === 'file_upload') {
      const parsed = parseFileUploadResponse(responseData);
      if (!parsed) {
        return <p className="text-muted-foreground">No submission</p>;
      }
      return (
        <div className="space-y-4">
          {parsed.file && (
            <AssessmentFilePreview
              path={parsed.file.path}
              name={parsed.file.name}
              mime={parsed.file.mime}
            />
          )}
          {parsed.link?.url && (
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Google Drive link</Label>
              <Button variant="outline" size="sm" asChild>
                <a href={parsed.link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open Drive link
                </a>
              </Button>
              <p className="text-xs text-muted-foreground mt-2 break-all">{parsed.link.url}</p>
            </div>
          )}
        </div>
      );
    }

    return <p className="text-muted-foreground">No response</p>;
  };

  const handleSaveGrade = () => {
    onGrade(parseFloat(score) || 0, feedback);
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">Response</Label>
        {renderResponse()}
      </div>

      {((question.type === 'subjective' || question.type === 'file_upload') && question.subjective_rubric) && (
        <div>
          <Label className="text-sm text-muted-foreground mb-2 block">
            {question.type === 'file_upload' ? 'Review Rubric' : 'Grading Rubric'}
          </Label>
          <div className="bg-blue-500/5 border border-blue-500/20 p-3 rounded-lg text-sm">
            {question.subjective_rubric}
          </div>
        </div>
      )}

      <Separator />

      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Label>Score</Label>
            {response.auto_score !== null && response.auto_score !== undefined && (
              <Badge variant="secondary" className="text-xs">
                Auto: {response.auto_score}
              </Badge>
            )}
          </div>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max={question.marks}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-24"
                placeholder="Score"
              />
              <span className="text-muted-foreground">/ {question.marks}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium">
                {response.final_score ?? '-'}
              </span>
              <span className="text-muted-foreground">/ {question.marks}</span>
              {canGrade && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex-[2]">
          <Label className="mb-2 block">Feedback</Label>
          {isEditing ? (
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Provide feedback for the candidate..."
              rows={2}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {response.feedback || 'No feedback provided'}
            </p>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveGrade} disabled={isGrading}>
            Save Grade
          </Button>
        </div>
      )}
    </div>
  );
}

// Card for a question that was NOT answered (no response record)
function UnansweredQuestionCard({
  question,
  onAssignScore,
  isGrading,
  canGrade,
}: {
  question: Question;
  onAssignScore: (score: number, feedback: string) => void;
  isGrading: boolean;
  canGrade: boolean;
}) {
  const [score, setScore] = useState('0');
  const [feedback, setFeedback] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    onAssignScore(parseFloat(score) || 0, feedback);
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">Response</Label>
        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Not Attempted</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            The candidate did not submit a response for this question.
          </p>
        </div>
      </div>

      {question.type === 'mcq' && question.options && (
        <div>
          <Label className="text-sm text-muted-foreground mb-2 block">Options (correct answer shown)</Label>
          <div className="space-y-2">
            {question.options.map((opt: MCQOption) => (
              <div
                key={opt.id}
                className={`p-3 rounded-lg border ${
                  opt.is_correct ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{opt.text}</span>
                  {opt.is_correct && (
                    <Badge variant="outline" className="ml-auto text-green-600 border-green-600/30">
                      Correct Answer
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="flex items-start gap-4">
        <div className="flex-1">
          <Label className="mb-2 block">Assign Score</Label>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max={question.marks}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-24"
                placeholder="0"
              />
              <span className="text-muted-foreground">/ {question.marks}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-medium text-muted-foreground">0</span>
              <span className="text-muted-foreground">/ {question.marks}</span>
              {canGrade && (
                <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10" onClick={() => setIsEditing(true)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Override Score
                </Button>
              )}
            </div>
          )}
        </div>

        {isEditing && (
          <div className="flex-[2]">
            <Label className="mb-2 block">Feedback</Label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional feedback..."
              rows={2}
            />
          </div>
        )}
      </div>

      {isEditing && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isGrading}>
            Save Score
          </Button>
        </div>
      )}
    </div>
  );
}

// Wrapper for each question card with header
function QuestionCard({
  question,
  questionNumber,
  sectionTitle,
  response,
  onGrade,
  onAssignScore,
  isGrading,
  canGrade,
}: {
  question: Question & { _sectionTitle?: string };
  questionNumber: number;
  sectionTitle?: string;
  response?: CandidateResponse;
  onGrade: (responseId: string, score: number, feedback: string) => void;
  onAssignScore: (questionId: string, score: number, feedback: string) => void;
  isGrading: boolean;
  canGrade: boolean;
}) {
  const getQuestionIcon = () => {
    switch (question.type) {
      case 'mcq': return <ListChecks className="h-4 w-4" />;
      case 'coding': return <Code className="h-4 w-4" />;
      case 'subjective': return <FileText className="h-4 w-4" />;
      case 'file_upload': return <Upload className="h-4 w-4" />;
    }
  };

  const getTypeBadge = () => {
    switch (question.type) {
      case 'mcq': return 'Multiple Choice';
      case 'coding': return 'Coding';
      case 'subjective': return 'Subjective';
      case 'file_upload': return 'File Upload';
      default: return question.type;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Q{questionNumber}</span>
              {sectionTitle && (
                <>
                  <span>•</span>
                  <span>{sectionTitle}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {getQuestionIcon()}
              <CardTitle className="text-base font-medium">
                {question.question_text}
              </CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{getTypeBadge()}</Badge>
            <Badge variant="secondary">
              {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
            </Badge>
            {!response && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                Unanswered
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {response ? (
          <ResponseCard
            key={`${response.id}-${response.auto_score ?? 'n'}-${response.feedback ?? ''}`}
            response={response}
            question={question}
            onGrade={(score, feedback) => onGrade(response.id, score, feedback)}
            isGrading={isGrading}
            canGrade={canGrade}
          />
        ) : (
          <UnansweredQuestionCard
            question={question}
            onAssignScore={(score, feedback) => onAssignScore(question.id, score, feedback)}
            isGrading={isGrading}
            canGrade={canGrade}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function EvaluationDetail() {
  usePageTitle('Evaluation Detail');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdminOrHR, isRecruiter } = useAuth();
  const canGrade = !isRecruiter; // Recruiters cannot grade; Admin/HR and Interviewers can
  
  const { data: evaluation, isLoading } = useEvaluationDetails(id);
  const gradeResponse = useGradeResponse();
  const markAsEvaluated = useMarkAsEvaluated();
  const overrideResult = useOverrideResult();
  const saveEvaluatorNotes = useSaveEvaluatorNotes();
  const createResponseForGrading = useCreateResponseForGrading();
  const aiGradeAssessment = useAiGradeAssessment();

  const [evaluatorNotes, setEvaluatorNotes] = useState<string | null>(null);

  const handleGradeResponse = (responseId: string, score: number, feedback: string) => {
    if (!id) return;
    gradeResponse.mutate({
      responseId,
      manualScore: score,
      feedback,
      candidateAssessmentId: id,
    });
  };

  const handleAssignScoreToUnanswered = (questionId: string, score: number, feedback: string) => {
    if (!id) return;
    createResponseForGrading.mutate({
      candidateAssessmentId: id,
      questionId,
      manualScore: score,
      feedback,
    });
  };

  const handleCompleteEvaluation = () => {
    if (!id) return;
    markAsEvaluated.mutate(id, {
      onSuccess: () => {
        navigate('/evaluations');
      },
    });
  };

  const handleOverrideResult = (passed: boolean) => {
    if (!id) return;
    overrideResult.mutate({ candidateAssessmentId: id, passed });
  };

  const handleSaveNotes = () => {
    if (!id || evaluatorNotes === null) return;
    saveEvaluatorNotes.mutate({ candidateAssessmentId: id, notes: evaluatorNotes });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading evaluation...</p>
        </main>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Evaluation not found</p>
        </main>
      </div>
    );
  }

  const { candidateAssessment, responses = [], allQuestions = [], totalMarks = 0, earnedMarks = 0 } = evaluation;
  const ca = candidateAssessment;
  const notesValue = evaluatorNotes ?? ca.evaluator_notes ?? '';
  const integrityLog = normalizeIntegrityLog(ca.integrity_log);
  const integrityStats = computeIntegrityStats(integrityLog);
  const sortedIntegrityLog = [...integrityLog].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Build a map of question_id -> response for quick lookup
  const responseMap = new Map(responses.map(r => [r.question_id, r]));
  const answeredCount = responses.length;
  const totalQuestionsCount = allQuestions.length;

  const gradeableTypes = new Set(['subjective', 'coding', 'file_upload']);
  const hasUnscoredAiTargets = responses.some(
    (r) =>
      r.question &&
      gradeableTypes.has(r.question.type) &&
      r.manual_score == null &&
      r.auto_score == null,
  );
  const hasAiOnlyScores = responses.some(
    (r) =>
      r.question &&
      gradeableTypes.has(r.question.type) &&
      r.manual_score == null &&
      r.auto_score != null,
  );
  const showAiGrade = canGrade && (ca.status === 'completed' || ca.status === 'evaluated') &&
    (hasUnscoredAiTargets || hasAiOnlyScores);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate('/evaluations')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Evaluations
        </Button>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{ca.assessment?.title}</h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>{ca.candidate?.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>
                  Completed: {ca.completed_at 
                    ? format(new Date(ca.completed_at), 'MMM d, yyyy HH:mm')
                    : 'In progress'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {showAiGrade && (
              <Button
                variant="outline"
                disabled={aiGradeAssessment.isPending}
                onClick={() => {
                  if (!id) return;
                  aiGradeAssessment.mutate({
                    candidateAssessmentId: id,
                    regrade: !hasUnscoredAiTargets && hasAiOnlyScores,
                  });
                }}
              >
                {aiGradeAssessment.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {hasUnscoredAiTargets ? 'AI Grade' : 'Re-grade with AI'}
              </Button>
            )}
            {ca.status === 'completed' && (
              <Button onClick={handleCompleteEvaluation} disabled={markAsEvaluated.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Evaluated
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {earnedMarks} / {totalMarks}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Percentage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${
                ca.passed ? 'text-green-600' : ca.passed === false ? 'text-red-600' : ''
              }`}>
                {ca.percentage?.toFixed(1) ?? 0}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Result</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Badge 
                  className={
                    ca.passed ? 'bg-green-600 text-white border-green-600 text-base px-3 py-1' :
                    ca.passed === false ? 'bg-red-600 text-white border-red-600 text-base px-3 py-1' :
                    'bg-amber-500 text-white border-amber-500 text-base px-3 py-1'
                  }
                >
                  {ca.passed ? 'PASSED' : ca.passed === false ? 'FAILED' : 'PENDING'}
                </Badge>
              </div>
              {/* Override buttons - Admin/HR and Interviewers only, not Recruiters */}
              {!isRecruiter && (
              <div className="flex items-center gap-2">
                {ca.passed !== true && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-green-500/50 text-green-600 hover:bg-green-500/10 hover:text-green-700">
                        <ShieldCheck className="h-4 w-4 mr-1" />
                        Override Pass
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Override to Passed?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will manually mark {ca.candidate?.name} as passed, regardless of their score ({ca.percentage?.toFixed(1)}%).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleOverrideResult(true)}>
                          Confirm Pass
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {ca.passed !== false && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700">
                        <ShieldX className="h-4 w-4 mr-1" />
                        Override Fail
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Override to Failed?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will manually mark {ca.candidate?.name} as failed, regardless of their score ({ca.percentage?.toFixed(1)}%).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleOverrideResult(false)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Confirm Fail
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Attempted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {answeredCount} / {totalQuestionsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalQuestionsCount - answeredCount} unanswered
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Integrity</CardTitle>
            </CardHeader>
            <CardContent>
              {integrityStats.eventCount > 0 ? (
                <div className="space-y-2 text-amber-600">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">{integrityStats.eventCount} events</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>Tab switches: <span className="font-medium">{integrityStats.tabSwitchCount}</span></p>
                    <p>Time away: <span className="font-medium">{formatSecondsAway(integrityStats.totalSecondsAway)}</span></p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Clean</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Integrity Timeline */}
        {integrityStats.eventCount > 0 && (
          <Card className="mb-8 border-amber-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Integrity Timeline
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {integrityStats.tabSwitchCount} tab switch{integrityStats.tabSwitchCount !== 1 ? 'es' : ''},{' '}
                {formatSecondsAway(integrityStats.totalSecondsAway)} away,{' '}
                {integrityStats.eventCount} total event{integrityStats.eventCount !== 1 ? 's' : ''}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {sortedIntegrityLog.map((event, index) => (
                  <li key={`${event.timestamp}-${index}`} className="flex items-start gap-4 text-sm border-l-2 border-amber-500/30 pl-4">
                    <Badge variant="outline" className="text-amber-600 border-amber-500/30 shrink-0">
                      {getIntegrityEventLabel(event.type)}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                      {event.question_index != null && (
                        <span className="font-medium text-foreground">
                          Q{event.question_index}
                          {event.section_title ? ` · ${event.section_title}` : ''}
                        </span>
                      )}
                      <span>{format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss')}</span>
                      {event.duration_seconds !== undefined && (
                        <span>Away for {formatSecondsAway(event.duration_seconds)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Evaluator Notes */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Evaluator Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notesValue}
              onChange={(e) => setEvaluatorNotes(e.target.value)}
              placeholder="Add overall evaluation notes, observations, or recommendations..."
              rows={3}
            />
            <div className="flex justify-end mt-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSaveNotes}
                disabled={saveEvaluatorNotes.isPending || evaluatorNotes === null}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Notes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* All Questions & Responses */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Questions & Responses ({answeredCount}/{totalQuestionsCount} answered)
            </h2>
          </div>
          
          {allQuestions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No questions found for this assessment.
              </CardContent>
            </Card>
          ) : (
            allQuestions.map((question, index) => {
              const response = responseMap.get(question.id);
              return (
                <QuestionCard
                  key={question.id}
                  question={question}
                  questionNumber={index + 1}
                  sectionTitle={(question as any)._sectionTitle}
                  response={response}
                  onGrade={handleGradeResponse}
                  onAssignScore={handleAssignScoreToUnanswered}
                  isGrading={gradeResponse.isPending || createResponseForGrading.isPending}
                  canGrade={canGrade}
                />
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
