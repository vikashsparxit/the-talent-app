import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  INTERVIEW_CANCEL_REASONS,
  type InterviewCancelReason,
} from '@/lib/interviewPanelists';

interface CancelInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName?: string | null;
  isSubmitting?: boolean;
  onConfirm: (reason: InterviewCancelReason, note?: string) => void;
  overlayClassName?: string;
}

export function CancelInterviewDialog({
  open,
  onOpenChange,
  candidateName,
  isSubmitting = false,
  onConfirm,
  overlayClassName,
}: CancelInterviewDialogProps) {
  const [reason, setReason] = useState<InterviewCancelReason | ''>('');
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setNote('');
      setReasonError(false);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!reason) {
      setReasonError(true);
      return;
    }
    onConfirm(reason, note.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isSubmitting) onOpenChange(false); }}>
      <DialogContent
        className={overlayClassName ? 'z-[70]' : undefined}
        overlayClassName={overlayClassName}
      >
        <DialogHeader>
          <DialogTitle>Cancel interview?</DialogTitle>
          <DialogDescription>
            {candidateName ? (
              <>
                This voids the scheduled slot for <strong>{candidateName}</strong>.
                They stay in the same pipeline stage (unscheduled). This is not a no-show or rejection.
              </>
            ) : (
              <>
                This voids the scheduled slot. The candidate stays in the same pipeline stage.
                This is not a no-show or rejection.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-2">
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={reason}
              onValueChange={(value) => {
                setReason(value as InterviewCancelReason);
                setReasonError(false);
              }}
              className="gap-2"
            >
              {INTERVIEW_CANCEL_REASONS.map((item) => (
                <div key={item.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={item.value} id={`cancel-reason-${item.value}`} />
                  <Label htmlFor={`cancel-reason-${item.value}`} className="font-normal cursor-pointer">
                    {item.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {reasonError && (
              <p className="text-xs text-destructive">Select a reason to cancel.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-interview-note">Note (optional)</Label>
            <Textarea
              id="cancel-interview-note"
              rows={2}
              placeholder="Anything the panel should know…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The interviewer and panelists will be notified in-app and by email.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            Keep scheduled
          </Button>
          <Button variant="destructive" disabled={isSubmitting || !reason} onClick={handleConfirm}>
            {isSubmitting ? 'Cancelling…' : 'Cancel interview'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
