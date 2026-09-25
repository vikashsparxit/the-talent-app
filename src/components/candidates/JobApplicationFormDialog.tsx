import { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobApplicationForm } from '@/hooks/useJobApplicationForm';
import {
  JobApplicationFormView,
  type JobApplicationFormViewHandle,
} from '@/components/applicant/JobApplicationFormView';
import { Loader2 } from 'lucide-react';

interface JobApplicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string | null;
  candidateName?: string;
}

export function JobApplicationFormDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
}: JobApplicationFormDialogProps) {
  const formRef = useRef<JobApplicationFormViewHandle>(null);
  const { data, isLoading, submit, saveDraft } = useJobApplicationForm(open ? applicationId ?? undefined : undefined);

  const isSubmitted = data?.form?.status === 'submitted';
  const showForm = !isLoading && data?.required && data?.form;
  const showFooter = showForm && !isSubmitted;
  const initialAnswers = Object.fromEntries(
    (data?.responses || []).map((r) => [r.question_key, r.answer_text]),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[60]"
        className="z-[60] grid w-[calc(100%-1rem)] max-h-[90dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="pr-6 text-left">
            Job Application Form{candidateName ? ` — ${candidateName}` : ''}
          </DialogTitle>
          <DialogDescription className="text-left">
            {isSubmitted
              ? 'View submitted pre-screen responses.'
              : 'Complete on behalf of the applicant. Will be marked as filled by recruiter.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">
              No linked application found. Close and reopen the drawer, or add the candidate to a job first.
            </p>
          ) : !data.required ? (
            <p className="text-sm text-muted-foreground">
              Digital application form is not required for this job.
            </p>
          ) : !data.form ? (
            <p className="text-sm text-muted-foreground">
              Preparing the form editor…
            </p>
          ) : (
            <JobApplicationFormView
              ref={formRef}
              key={data.form.id}
              questions={data.questions}
              initialReferences={data.form.employment_references || []}
              initialAnswers={initialAnswers}
              isSubmitted={isSubmitted}
              filledByRecruiter={data.form.filled_by_recruiter}
              readOnly={isSubmitted}
              hideActions={!isSubmitted}
              onSubmit={(payload) => {
                submit.mutate(
                  { ...payload, filledByRecruiter: true },
                  { onSuccess: () => onOpenChange(false) },
                );
              }}
              onSaveDraft={isSubmitted ? undefined : (payload) => saveDraft.mutate(payload)}
              isSubmitting={submit.isPending}
              isSavingDraft={saveDraft.isPending}
            />
          )}
        </div>

        {showFooter && (
          <DialogFooter className="gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => formRef.current?.saveDraft()}
              disabled={submit.isPending || saveDraft.isPending}
            >
              {saveDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Draft
            </Button>
            <Button
              type="button"
              onClick={() => formRef.current?.submit()}
              disabled={submit.isPending || saveDraft.isPending}
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Application Form
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
