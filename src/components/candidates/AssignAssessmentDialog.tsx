import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Copy, CheckCircle, Link, Mail, Loader2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAssessments } from '@/hooks/useAssessments';
import { useCandidateAssessments } from '@/hooks/useCandidates';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Candidate } from '@/types/database';

interface AssignAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: Candidate;
  jobId?: string | null;
  defaultAssessmentId?: string | null;
  deadlineDays?: number;
}

export function AssignAssessmentDialog({
  open,
  onOpenChange,
  candidate,
  jobId,
  defaultAssessmentId,
  deadlineDays = 7,
}: AssignAssessmentDialogProps) {
  const { user } = useAuth();
  const { assessments } = useAssessments();
  const { assignAssessment, assignments } = useCandidateAssessments({ enabled: open });
  const { toast } = useToast();
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [deadline, setDeadline] = useState<Date | undefined>(addDays(new Date(), deadlineDays));
  const [sendEmail, setSendEmail] = useState(true);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDeadline(addDays(new Date(), deadlineDays));
    if (defaultAssessmentId) {
      setSelectedAssessment(defaultAssessmentId);
    }
  }, [open, defaultAssessmentId, deadlineDays]);

  const assignedAssessmentIds = assignments
    .filter((a) => a.candidate_id === candidate.id)
    .map((a) => a.assessment_id);

  const availableAssessments = assessments.filter((a) => {
    if (a.status === 'active') return true;
    return defaultAssessmentId != null && a.id === defaultAssessmentId && a.status === 'draft';
  });

  const selectedAssessmentData = assessments.find((a) => a.id === selectedAssessment);
  const alreadyAssigned = selectedAssessment
    ? assignedAssessmentIds.includes(selectedAssessment)
    : false;

  const handleAssign = async () => {
    if (!selectedAssessment) return;

    const result = await assignAssessment.mutateAsync({
      candidate_id: candidate.id,
      assessment_id: selectedAssessment,
      deadline: deadline?.toISOString(),
      job_id: jobId ?? undefined,
      assigned_by: user?.id,
      assigned_via: defaultAssessmentId && selectedAssessment === defaultAssessmentId ? 'job_default' : 'manual',
    });

    if (result?.access_token) {
      const link = `${window.location.origin}/exam?token=${result.access_token}`;
      setCreatedLink(link);

      if (sendEmail && selectedAssessmentData) {
        setIsSendingEmail(true);
        try {
          const { data, error } = await supabase.functions.invoke('send-invitation-email', {
            body: {
              candidateName: candidate.name,
              candidateEmail: candidate.email,
              assessmentTitle: selectedAssessmentData.title,
              magicLink: link,
              deadline: deadline?.toISOString() || null,
            },
          });

          if (error) throw error;

          if (data?.success) {
            setEmailSent(true);
            toast({
              title: 'Email sent!',
              description: `Invitation sent to ${candidate.email}`,
            });
          } else {
            throw new Error(data?.error || 'Failed to send email');
          }
        } catch (err) {
          console.error('Email send error:', err);
          toast({
            variant: 'destructive',
            title: 'Email failed',
            description: 'Could not send invitation email. You can share the link manually.',
          });
        } finally {
          setIsSendingEmail(false);
        }
      }
    }
  };

  const copyLink = () => {
    if (createdLink) {
      navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setSelectedAssessment('');
    setDeadline(addDays(new Date(), deadlineDays));
    setSendEmail(true);
    setCreatedLink(null);
    setEmailSent(false);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Assessment</DialogTitle>
          <DialogDescription>
            Assign an assessment to {candidate.name}. A unique magic link will be generated.
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Assessment Assigned!</h3>
              {emailSent ? (
                <p className="text-sm text-green-600 dark:text-green-400 mt-1 flex items-center justify-center gap-1">
                  <Mail className="h-4 w-4" />
                  Invitation email sent to {candidate.email}
                </p>
              ) : isSendingEmail ? (
                <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending email...
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Share this magic link with the candidate
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                readOnly
                value={createdLink}
                className="text-xs flex-1 bg-transparent border-none outline-none cursor-text"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={copyLink}>
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assessment *</Label>
              {availableAssessments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active assessments available. Activate a draft in Assessment Builder or generate one from Assessments.
                </p>
              ) : (
                <Select value={selectedAssessment} onValueChange={setSelectedAssessment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an assessment" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAssessments.map((assessment) => (
                      <SelectItem key={assessment.id} value={assessment.id}>
                        <div className="flex flex-col">
                          <span>
                            {assessment.title}
                            {assessment.status === 'draft' ? ' (draft)' : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {assessment.duration_minutes} min • {assessment.passing_score}% to pass
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {alreadyAssigned && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This assessment was previously assigned — a new invitation will be created.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Deadline (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !deadline && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline ? format(deadline, 'PPP') : 'No deadline'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={setDeadline}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(checked === true)}
              />
              <Label htmlFor="sendEmail" className="text-sm font-normal cursor-pointer">
                Send invitation email to {candidate.email}
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          {createdLink ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!selectedAssessment || assignAssessment.isPending}
              >
                {assignAssessment.isPending ? 'Assigning...' : 'Assign & Generate Link'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
