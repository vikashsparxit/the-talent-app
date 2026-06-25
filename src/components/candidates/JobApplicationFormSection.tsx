import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCandidateApplicationForm, useSendApplicationFormEmail } from '@/hooks/useJobApplicationForm';
import { JobApplicationFormReadOnlyView } from '@/components/applicant/JobApplicationFormReadOnlyView';
import { ClipboardList, Mail, Pencil } from 'lucide-react';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';

interface JobApplicationFormSectionProps {
  candidateId: string | null;
  candidateEmail: string | null;
  candidateName?: string;
  jobId: string | null;
  onFillOnBehalf?: (applicationId: string) => void;
  canEdit?: boolean;
  /** Renders as subsection under unified Pre-Screen (no top-level heading). */
  embedded?: boolean;
}

function formatFormSentLabel(sentAt: string): string {
  const date = new Date(sentAt);
  if (differenceInHours(new Date(), date) < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return `on ${format(date, 'MMM d, yyyy')} at ${format(date, 'h:mm a')}`;
}

export function ApplicationFormStatusBadge({ status }: { status: 'pending' | 'submitted' | 'none' | 'not_required' }) {
  if (status === 'not_required') return null;
  if (status === 'submitted') {
    return (
      <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30">
        Form complete
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30">
      Form pending
    </Badge>
  );
}

export function JobApplicationFormSection({
  candidateId,
  candidateEmail,
  candidateName,
  jobId,
  onFillOnBehalf,
  canEdit,
  embedded = false,
}: JobApplicationFormSectionProps) {
  const { data, isLoading } = useCandidateApplicationForm(candidateId, candidateEmail, jobId);
  const sendFormEmail = useSendApplicationFormEmail();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!data?.required) return null;

  const jobTitle = (data.application.job as { title?: string } | null)?.title || 'the position';
  const initialAnswers = Object.fromEntries(
    (data.responses || []).map((r) => [r.question_key, r.answer_text]),
  );
  const isSubmitted = data.form?.status === 'submitted';

  const formStatus = isSubmitted ? 'submitted' : data.form ? 'pending' : 'none';
  const canSendForm = canEdit && !isSubmitted && candidateName && candidateEmail;
  const formSentAt = data.application.form_sent_at;
  const sendButtonLabel = formSentAt ? 'Resend Form to Candidate' : 'Send Form to Candidate';

  const handleSendForm = () => {
    if (!candidateName || !candidateEmail) return;
    sendFormEmail.mutate({
      applicationId: data.application.id,
      applicantName: candidateName,
      applicantEmail: candidateEmail,
      jobTitle,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {embedded ? (
          <h4 className="text-sm font-medium">Applicant Digital Form</h4>
        ) : (
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Digital Application Form
          </h3>
        )}
        <ApplicationFormStatusBadge status={formStatus} />
      </div>

      {!data.form ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground italic">
            Applicant has not started the digital application form yet. Send them a link or fill on their behalf.
          </p>
          {formSentAt && (
            <p className="text-xs text-muted-foreground">
              Sent {formatFormSentLabel(formSentAt)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canSendForm && (
              <Button
                size="sm"
                variant="default"
                className="gap-1"
                onClick={handleSendForm}
                disabled={sendFormEmail.isPending}
              >
                <Mail className="h-3.5 w-3.5" />
                {sendButtonLabel}
              </Button>
            )}
            {canEdit && onFillOnBehalf && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onFillOnBehalf(data.application.id);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Fill on Behalf
              </Button>
            )}
          </div>
        </div>
      ) : isSubmitted ? (
        <div className="space-y-3">
          {data.form.submitted_at && (
            <p className="text-xs text-muted-foreground">
              Submitted {format(new Date(data.form.submitted_at), 'MMM d, yyyy')}
              {data.form.filled_by_recruiter ? ' · Filled by recruiter' : ''}
            </p>
          )}
          <JobApplicationFormReadOnlyView
            questions={data.questions}
            references={data.form.employment_references || []}
            answers={initialAnswers}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground italic">
            Form started but not yet submitted.
          </p>
          {formSentAt && (
            <p className="text-xs text-muted-foreground">
              Sent {formatFormSentLabel(formSentAt)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canSendForm && (
              <Button
                size="sm"
                variant="default"
                className="gap-1"
                onClick={handleSendForm}
                disabled={sendFormEmail.isPending}
              >
                <Mail className="h-3.5 w-3.5" />
                {sendButtonLabel}
              </Button>
            )}
            {canEdit && onFillOnBehalf && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onFillOnBehalf(data.application.id);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Complete on Behalf
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
