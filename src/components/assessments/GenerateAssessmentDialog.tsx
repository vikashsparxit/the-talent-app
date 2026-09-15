import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import { useJobs } from '@/hooks/useJobs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { assessmentTierLabels, type AssessmentTier } from '@/lib/assessment-tiers';
import { jobStatusLabels } from '@/types/jobs';

interface GenerateAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateAssessmentDialog({
  open,
  onOpenChange,
}: GenerateAssessmentDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { jobs, isLoading } = useJobs();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const jobsWithDescription = jobs.filter((j) => j.description?.trim());

  const handleGenerate = async () => {
    if (!selectedJobId) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-assessment', {
        body: { job_id: selectedJobId },
      });
      if (error) {
        let description = 'Could not generate assessment';
        try {
          const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
          if (body?.error) description = body.error;
        } catch {
          // ignore
        }
        throw new Error(description);
      }
      if (!data?.success) throw new Error(data?.error || 'Generation failed');

      await queryClient.invalidateQueries({ queryKey: ['assessments'] });

      const stats = data.stats as {
        sections?: number;
        questions?: number;
        marks?: number;
        duration_minutes?: number;
        passing_score?: number;
      } | undefined;
      const tierData = data.tier as { id?: AssessmentTier; label?: string } | undefined;
      const tierLabel = tierData?.label
        ?? (tierData?.id ? assessmentTierLabels[tierData.id] : undefined);
      const statsLabel = stats
        ? `${stats.sections ?? 3} sections, ${stats.questions ?? 6} questions`
        : '3 sections, 6 questions';

      toast({
        title: 'Assessment generated',
        description: tierLabel
          ? `${tierLabel} — draft created (${statsLabel}). Review and activate before use.`
          : `Draft created (${statsLabel}). Review and activate before use.`,
      });

      onOpenChange(false);
      setSelectedJobId('');
      navigate(`/assessments/${data.assessment.id}`);
    } catch (err) {
      toast({
        title: 'Generation failed',
        description: err instanceof Error ? err.message : 'Could not generate assessment',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Generate with AI
          </DialogTitle>
          <DialogDescription>
            Select a job with a description. AI will draft a tiered assessment you can review before activating.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Job</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading jobs…</p>
            ) : jobsWithDescription.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No jobs with a description found. Add a job description in Jobs first.
              </p>
            ) : (
              <Select value={selectedJobId || undefined} onValueChange={setSelectedJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobsWithDescription.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title} ({jobStatusLabels[job.status]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedJobId || jobsWithDescription.length === 0}
            className="gap-2"
          >
            {isGenerating ? (
              'Generating…'
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Assessment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
