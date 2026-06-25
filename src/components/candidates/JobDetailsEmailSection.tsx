import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCandidateJobApplication, useSendJobDetailsEmail } from '@/hooks/useJobApplicationForm';
import { Briefcase, Mail } from 'lucide-react';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';

interface JobDetailsEmailSectionProps {
  candidateId: string | null;
  candidateEmail: string | null;
  candidateName?: string;
  jobId: string | null;
  canEdit?: boolean;
  /** Renders as subsection under unified Pre-Screen (no top-level heading). */
  embedded?: boolean;
}

function formatJdSentLabel(sentAt: string): string {
  const date = new Date(sentAt);
  if (differenceInHours(new Date(), date) < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return `on ${format(date, 'MMM d, yyyy')} at ${format(date, 'h:mm a')}`;
}

export function JobDetailsEmailSection({
  candidateId,
  candidateEmail,
  candidateName,
  jobId,
  canEdit,
  embedded = false,
}: JobDetailsEmailSectionProps) {
  const { data: application, isLoading } = useCandidateJobApplication(candidateId, candidateEmail, jobId);
  const sendJobDetails = useSendJobDetailsEmail();

  if (!jobId || !candidateEmail) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-48" />
      </div>
    );
  }

  if (!application) return null;

  const jobTitle = (application.job as { title?: string } | null)?.title || 'the position';
  const canSend = canEdit && candidateName && candidateEmail;
  const jdSentAt = application.jd_sent_at;
  const sendButtonLabel = jdSentAt ? 'Resend Job Details' : 'Send Job Details';

  const handleSend = () => {
    if (!candidateName || !candidateEmail) return;
    sendJobDetails.mutate({
      applicationId: application.id,
      applicantName: candidateName,
      applicantEmail: candidateEmail,
      jobTitle,
    });
  };

  return (
    <div className="space-y-2">
      {embedded ? (
        <h4 className="text-sm font-medium">Job Details Email</h4>
      ) : (
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Job Details Email
        </h3>
      )}
      <p className="text-sm text-muted-foreground">
        Email the candidate job title, location, type, experience, and full description with a link to the careers page.
      </p>
      {jdSentAt && (
        <p className="text-xs text-muted-foreground">
          Sent {formatJdSentLabel(jdSentAt)}
        </p>
      )}
      {canSend && (
        <Button
          size="sm"
          variant="default"
          className="gap-1"
          onClick={handleSend}
          disabled={sendJobDetails.isPending}
        >
          <Mail className="h-3.5 w-3.5" />
          {sendButtonLabel}
        </Button>
      )}
    </div>
  );
}
