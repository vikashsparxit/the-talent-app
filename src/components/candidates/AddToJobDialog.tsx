import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { Briefcase, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useJobs } from '@/hooks/useJobs';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import type { Candidate } from '@/types/database';

interface AddToJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: Candidate;
}

export function AddToJobDialog({ open, onOpenChange, candidate }: AddToJobDialogProps) {
  const { jobs } = useJobs({ summary: true });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openJobs = jobs.filter((j: { status: string }) => j.status === 'open' || j.status === 'paused');

  const handleAssign = async () => {
    if (!selectedJobId) return;

    const currentJobId = (candidate as { job_id?: string | null }).job_id;
    if (currentJobId === selectedJobId) {
      toast({
        title: 'Already on this job',
        description: 'This candidate is already linked to the selected job.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: activePipeline, error: pipelineError } = await supabase
        .from('candidate_interviews')
        .select('id, job_interview_stage:job_interview_stages!inner(job_id)')
        .eq('candidate_id', candidate.id)
        .is('removed_from_pipeline_at', null);

      if (pipelineError) throw pipelineError;

      const alreadyInJob = (activePipeline || []).some(
        (row) => (row.job_interview_stage as { job_id: string }).job_id === selectedJobId,
      );
      if (alreadyInJob) {
        toast({
          title: 'Already in pipeline',
          description: 'This candidate is already active in the pipeline for that job.',
        });
        return;
      }

      const { error } = await supabase
        .from('candidates')
        .update({
          job_id: selectedJobId,
          candidate_status: 'new',
          pending_approval_decline_reason: null,
        } as Record<string, unknown>)
        .eq('id', candidate.id);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['candidate-pipeline-stages'] });
      await queryClient.invalidateQueries({ queryKey: ['candidate-application-form'] });
      await queryClient.invalidateQueries({ queryKey: ['job-application-form-statuses'] });

      const jobTitle = openJobs.find((j: { id: string }) => j.id === selectedJobId)?.title || 'the job';
      toast({
        title: 'Added to job',
        description: `${candidate.name} is now linked to ${jobTitle} (Pending Approval).`,
      });

      supabase.functions
        .invoke('analyze-candidate', { body: { candidate_id: candidate.id, ...getDevGeminiKeyBody() } })
        .catch(() => {});

      setSelectedJobId('');
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not assign job';
      toast({ variant: 'destructive', title: 'Failed to add to job', description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSubmitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Add to Job
          </DialogTitle>
          <DialogDescription>
            Link <strong>{candidate.name}</strong> to a job. They will appear in Pending Approval for that role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Job</Label>
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an open job..." />
            </SelectTrigger>
            <SelectContent>
              {openJobs.map((job: { id: string; title: string; status: string }) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}{job.status === 'paused' ? ' (Paused)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedJobId || isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
            ) : (
              'Add to Job'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
