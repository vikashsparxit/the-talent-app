import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import { useJobApplicationForm } from '@/hooks/useJobApplicationForm';
import { ApplicantPortalHeader, useCompanyDisplayName } from '@/components/CompanyLogo';
import { JobApplicationFormView } from '@/components/applicant/JobApplicationFormView';
import { applicantLoginPath } from '@/lib/publicRoutes';
import { ArrowLeft } from 'lucide-react';

export default function ApplicantJobApplicationForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyName = useCompanyDisplayName();
  const { user, isLoading: authLoading } = useApplicantAuth();
  const { data, isLoading, submit, saveDraft } = useJobApplicationForm(id);

  usePageTitle(
    data?.application?.job?.title
      ? `Application Form | ${data.application.job.title}`
      : companyName
        ? `${companyName} | Application Form`
        : 'Application Form',
  );

  useEffect(() => {
    if (!authLoading && !user && id) {
      navigate(applicantLoginPath(`/applicant/applications/${id}/form`));
    }
  }, [user, authLoading, navigate, id]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ApplicantPortalHeader homeHref="/applicant" />
        <main className="max-w-3xl mx-auto px-4 py-8 w-full space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!user || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ApplicantPortalHeader homeHref="/applicant" />
        <main className="max-w-3xl mx-auto px-4 py-8 w-full text-center">
          <p className="text-muted-foreground mb-4">Application not found.</p>
          <Button asChild><Link to="/applicant">Back to Dashboard</Link></Button>
        </main>
      </div>
    );
  }

  if (!data.required) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ApplicantPortalHeader homeHref="/applicant" />
        <main className="max-w-3xl mx-auto px-4 py-8 w-full text-center">
          <p className="text-muted-foreground mb-4">This job does not require a digital application form.</p>
          <Button asChild><Link to={`/applicant/applications/${id}`}>Back to Application</Link></Button>
        </main>
      </div>
    );
  }

  const initialAnswers = Object.fromEntries(
    (data.responses || []).map((r) => [r.question_key, r.answer_text]),
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ApplicantPortalHeader homeHref="/applicant" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
          <Link to={`/applicant/applications/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Application
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">Job Application Form</h1>
          <p className="text-muted-foreground mt-1">
            {data.application.job?.title} — complete this before your interview rounds.
          </p>
        </div>

        <JobApplicationFormView
          key={data.form.id}
          questions={data.questions}
          initialReferences={data.form?.employment_references || []}
          initialAnswers={initialAnswers}
          isSubmitted={data.form?.status === 'submitted'}
          filledByRecruiter={data.form?.filled_by_recruiter}
          onSubmit={(payload) => submit.mutate(payload)}
          onSaveDraft={(payload) => saveDraft.mutate(payload)}
          isSubmitting={submit.isPending}
          isSavingDraft={saveDraft.isPending}
        />
      </main>
    </div>
  );
}
