import { useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useParams, useNavigate } from 'react-router';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import { useApplicantAssessments, useApplicantCandidateRecord } from '@/hooks/useApplicantPortal';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, ShieldX, Clock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { AssessmentPortalHeader } from '@/components/CompanyLogo';
import ExamInterface from '@/components/portal/ExamInterface';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export default function ApplicantExam() {
  usePageTitle('Assessment');
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useApplicantAuth();
  const { data: assessments = [], isLoading: assessmentsLoading } = useApplicantAssessments();
  const { data: candidateRecord } = useApplicantCandidateRecord();
  const [assessmentInfo, setAssessmentInfo] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExam, setShowExam] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/applicant/login');
    }
  }, [user, authLoading, navigate]);

  // Find the assessment and load details
  useEffect(() => {
    const loadAssessment = async () => {
      if (!assessmentId || assessmentsLoading) return;

      const candidateAssessment = assessments.find(a => a.id === assessmentId);
      if (!candidateAssessment) {
        setError('Assessment not found or not assigned to you');
        setIsLoadingDetails(false);
        return;
      }

      try {
        // Fetch full assessment details including sections and questions
        const { data: assessment, error: assessmentError } = await supabase
          .from('assessments')
          .select('*')
          .eq('id', candidateAssessment.assessment_id)
          .single();

        if (assessmentError) throw assessmentError;

        // Fetch sections
        const { data: sections, error: sectionsError } = await supabase
          .from('assessment_sections')
          .select('*')
          .eq('assessment_id', assessment.id)
          .order('order_index');

        if (sectionsError) throw sectionsError;

        // Fetch questions for each section (excluding correct_answer for security)
        const { data: questions, error: questionsError } = await supabase
          .from('questions')
          .select('id, section_id, question_text, type, options, marks, order_index, coding_language, coding_starter_code, coding_test_cases, subjective_max_words, file_config')
          .in('section_id', sections.map(s => s.id))
          .order('order_index');

        if (questionsError) throw questionsError;

        // Construct the assessment info object
        const sectionsWithQuestions = sections.map(section => ({
          ...section,
          questions: questions
            .filter(q => q.section_id === section.id)
            .map((q) => {
              const base = {
                ...q,
                options:
                  q.type === 'mcq' && Array.isArray(q.options)
                    ? (q.options as Array<{ id: string; text: string }>).map((o) => ({
                        id: o.id,
                        text: o.text,
                      }))
                    : q.options,
              };
              if (q.type === 'file_upload') {
                return {
                  ...base,
                  file_config: q.file_config ?? {
                    allow_file: true,
                    allow_link: true,
                    allowed_mime_types: [
                      'image/jpeg',
                      'image/png',
                      'image/gif',
                      'image/webp',
                      'application/pdf',
                    ],
                    max_file_bytes: 10485760,
                    max_files: 1,
                  },
                };
              }
              return base;
            }),
        }));

        setAssessmentInfo({
          id: candidateAssessment.id,
          candidate_id: candidateAssessment.candidate_id,
          assessment_id: candidateAssessment.assessment_id,
          status: candidateAssessment.status,
          started_at: candidateAssessment.started_at,
          deadline: candidateAssessment.deadline,
          completed_at: candidateAssessment.completed_at,
          percentage: candidateAssessment.percentage,
          passed: candidateAssessment.passed,
          integrity_log: Array.isArray(candidateAssessment.integrity_log)
            ? candidateAssessment.integrity_log
            : [],
          candidate: {
            id: candidateAssessment.candidate_id,
            name: candidateRecord?.name ?? 'Candidate',
            email: candidateRecord?.email ?? '',
          },
          assessment: {
            ...assessment,
            sections: sectionsWithQuestions,
          },
        });
        setIsLoadingDetails(false);
      } catch (err: any) {
        console.error('Error loading assessment:', err);
        setError(err.message || 'Failed to load assessment');
        setIsLoadingDetails(false);
      }
    };

    loadAssessment();
  }, [assessmentId, assessments, assessmentsLoading, candidateRecord]);

  if (authLoading || assessmentsLoading || isLoadingDetails) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading your assessment...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error || !assessmentInfo) {
    return (
      <PortalLayout>
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">{error || 'Assessment not found'}</p>
            <Button onClick={() => navigate('/applicant')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  if (assessmentInfo.status === 'expired') {
    return (
      <PortalLayout>
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Assessment Expired</h2>
            <p className="text-muted-foreground mb-4">
              This assessment was due by {format(new Date(assessmentInfo.deadline!), 'PPP')}.
            </p>
            <Button onClick={() => navigate('/applicant')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  if (assessmentInfo.status === 'completed' || assessmentInfo.status === 'evaluated') {
    return (
      <PortalLayout>
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Assessment Completed</h2>
            <p className="text-muted-foreground mb-2">
              You have successfully completed {assessmentInfo.assessment.title}.
            </p>
            {assessmentInfo.completed_at && (
              <p className="text-sm text-muted-foreground mb-4">
                Submitted on {format(new Date(assessmentInfo.completed_at), 'PPP p')}
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-4">
              Your responses have been submitted. The hiring team will review your assessment and follow up.
            </p>
            <Button onClick={() => navigate('/applicant')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  // Show exam interface (for in_progress or starting invited)
  if (showExam || assessmentInfo.status === 'in_progress') {
    return (
      <ExamInterface
        assessmentInfo={assessmentInfo}
        accessToken="session"
        consentSource="exam_portal_applicant"
        homeHref="/applicant"
      />
    );
  }

  // Welcome screen for invited status
  return (
    <PortalLayout>
      <WelcomeScreen
        assessmentInfo={assessmentInfo}
        onBack={() => navigate('/applicant')}
        onStart={() => setShowExam(true)}
      />
    </PortalLayout>
  );
}

function WelcomeScreen({
  assessmentInfo,
  onBack,
  onStart,
}: {
  assessmentInfo: any;
  onBack: () => void;
  onStart: () => void;
}) {
  const [consentChecked, setConsentChecked] = useState(false);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{assessmentInfo.assessment.title}</CardTitle>
        <CardDescription>{assessmentInfo.assessment.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{assessmentInfo.assessment.duration_minutes}</p>
            <p className="text-sm text-muted-foreground">Minutes</p>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{assessmentInfo.assessment.passing_score}%</p>
            <p className="text-sm text-muted-foreground">Passing Score</p>
          </div>
        </div>

        {assessmentInfo.deadline && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-center">
            <p className="text-orange-800">
              <Clock className="h-4 w-4 inline mr-2" />
              Complete before: {format(new Date(assessmentInfo.deadline), 'PPP p')}
            </p>
          </div>
        )}

        <div className="border-t pt-6">
          <h3 className="font-semibold mb-2">Before you start:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Ensure you have a stable internet connection</li>
            <li>Find a quiet place without distractions</li>
            <li>The timer will start once you begin</li>
            <li>You cannot pause the assessment once started</li>
            <li>Your progress will be auto-saved</li>
            <li>Tab switches and focus loss are monitored</li>
            <li>After you start, a live counter shows tab switches and time away from the exam</li>
          </ul>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">Integrity monitoring</p>
          <p className="text-amber-700 dark:text-amber-300">
            Leaving the exam tab is recorded and shared with the hiring team. Stay on this page for the best experience.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border p-4">
          <Checkbox
            id="applicant-exam-consent"
            checked={consentChecked}
            onCheckedChange={(checked) => setConsentChecked(checked === true)}
          />
          <Label htmlFor="applicant-exam-consent" className="text-sm font-normal leading-snug cursor-pointer">
            I consent to my responses, exam activity (including integrity monitoring), and results being
            processed for recruitment evaluation purposes.
          </Label>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 justify-center pt-4">
          <Button variant="outline" onClick={onBack}>
            Back to Dashboard
          </Button>
          <Button size="lg" onClick={onStart} disabled={!consentChecked}>
            Start Assessment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex flex-col">
      <AssessmentPortalHeader homeHref="/applicant" />
      <main className="container mx-auto px-4 py-6 sm:py-8 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
