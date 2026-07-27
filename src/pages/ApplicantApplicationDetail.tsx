import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import { useApplicantApplication } from '@/hooks/useApplicantPortal';
import { useJobApplicationForm } from '@/hooks/useJobApplicationForm';
import { ApplicantPortalHeader, useCompanyDisplayName } from '@/components/CompanyLogo';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Calendar,
  CheckCircle,
  Circle,
  Loader2,
  ClipboardCheck,
  FileText,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  reviewing: 'bg-yellow-100 text-yellow-800',
  shortlisted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  converted: 'bg-purple-100 text-purple-800',
};

const statusLabels: Record<string, string> = {
  new: 'Submitted',
  reviewing: 'Under Review',
  shortlisted: 'Shortlisted',
  rejected: 'Not Selected',
  converted: 'Interview Stage',
};

const assessmentStatusLabels: Record<string, string> = {
  invited: 'Assessment Assigned',
  in_progress: 'Assessment In Progress',
  completed: 'Assessment Submitted',
  evaluated: 'Assessment Reviewed',
  expired: 'Assessment Expired',
};

export default function ApplicantApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyName = useCompanyDisplayName();
  const { user, isLoading: authLoading } = useApplicantAuth();
  const { data, isLoading, error } = useApplicantApplication(id);
  const { data: formData } = useJobApplicationForm(id);

  usePageTitle(
    data?.application?.job?.title
      ? `${data.application.job.title} | Application`
      : companyName
        ? `${companyName} | Application`
        : 'Application',
  );

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/applicant/login');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ApplicantPortalHeader homeHref="/applicant" />
        <main className="max-w-3xl mx-auto px-4 py-8 w-full space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!user) return null;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ApplicantPortalHeader homeHref="/applicant" />
        <main className="max-w-3xl mx-auto px-4 py-8 w-full text-center">
          <p className="text-muted-foreground mb-4">Application not found or you don&apos;t have access.</p>
          <Button asChild><Link to="/applicant">Back to Dashboard</Link></Button>
        </main>
      </div>
    );
  }

  const { application, assessments, timeline } = data;
  const formRequired = formData?.required === true;
  const formSubmitted = formData?.form?.status === 'submitted';
  const formPending = formRequired && !formSubmitted;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ApplicantPortalHeader homeHref="/applicant" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
          <Link to="/applicant">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{application.job?.title || 'Application'}</h1>
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                {application.job?.department && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {application.job.department}
                  </span>
                )}
                {application.job?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {application.job.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Applied {format(new Date(application.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
            <Badge className={cn('shrink-0', statusColors[application.status] || 'bg-gray-100')}>
              {statusLabels[application.status] || application.status}
            </Badge>
          </div>
        </div>

        {formPending && (
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex gap-3">
                <FileText className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Complete your job application form</p>
                  <p className="text-sm text-muted-foreground">
                    Please submit this before any interview rounds.
                  </p>
                </div>
              </div>
              <Button asChild className="shrink-0">
                <Link to={`/applicant/applications/${application.id}/form`}>
                  Complete Job Application
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {formSubmitted && (
          <Card>
            <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Job application form submitted</p>
                  <p className="text-sm text-muted-foreground">Your pre-screen responses are on file.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <Link to={`/applicant/applications/${application.id}/form`}>View Responses</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Application Timeline</CardTitle>
            <CardDescription>Track your progress through the hiring process</CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No timeline events yet.</p>
            ) : (
              <ol className="relative border-l border-muted ml-3 space-y-6">
                {timeline.map((event, idx) => (
                  <li key={idx} className="ml-6">
                    <span className={cn(
                      'absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background',
                      event.complete ? 'bg-green-100' : 'bg-muted',
                    )}>
                      {event.complete ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div>
                        <p className="font-medium text-sm">{event.title}</p>
                        {event.description && (
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                        )}
                      </div>
                      {event.date && (
                        <time className="text-xs text-muted-foreground shrink-0">
                          {format(new Date(event.date), 'MMM d, yyyy')}
                        </time>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {assessments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Assessments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {assessments.map((a) => (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border rounded-lg p-3">
                  <div>
                    <p className="font-medium text-sm">{a.assessment?.title || 'Assessment'}</p>
                    <p className="text-xs text-muted-foreground">
                      {assessmentStatusLabels[a.status] || a.status}
                    </p>
                  </div>
                  {(a.status === 'invited' || a.status === 'in_progress') && (
                    <Button size="sm" asChild>
                      <Link to={`/exam/${a.id}`}>
                        {a.status === 'in_progress' ? 'Continue' : 'Start'}
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {application.cover_letter && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cover Letter</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{application.cover_letter}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
