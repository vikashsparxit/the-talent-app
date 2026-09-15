import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Loader2, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchHiredCandidatesForJobs, type HiredCandidateSummary } from '@/hooks/useJobHiredCandidates';

interface JobPipelineCandidate {
  id: string;
  name: string;
  email: string;
  hired_at: string | null;
  candidate_status: string;
}

export interface AssignHiredCandidateDialogState {
  jobId: string;
  jobTitle: string;
  mode: 'add' | 'change';
  replaceCandidate?: HiredCandidateSummary;
  currentHiredIds: string[];
}

interface AssignHiredCandidateDialogProps {
  state: AssignHiredCandidateDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (positionsFilled: number) => void;
}

export function AssignHiredCandidateDialog({
  state,
  onOpenChange,
  onSuccess,
}: AssignHiredCandidateDialogProps) {
  const open = !!state;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<JobPipelineCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!state) {
      setCandidates([]);
      setSelectedIds(new Set());
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setSelectedIds(new Set());
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, email, hired_at, candidate_status')
        .eq('job_id', state.jobId)
        .order('name');

      if (cancelled) return;
      if (error) {
        toast({ title: 'Failed to load candidates', description: error.message, variant: 'destructive' });
        setCandidates([]);
      } else {
        setCandidates(data ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [state?.jobId, state?.mode, state?.replaceCandidate?.id, toast]);

  const selectable = useMemo(() => {
    if (!state) return [];
    const hiredSet = new Set(state.currentHiredIds);
    if (state.mode === 'change' && state.replaceCandidate) {
      hiredSet.delete(state.replaceCandidate.id);
    }
    return candidates.filter((c) => !hiredSet.has(c.id));
  }, [candidates, state]);

  const handleSave = async () => {
    if (!state || selectedIds.size === 0) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (state.mode === 'change' && state.replaceCandidate) {
        const { error: clearError } = await supabase
          .from('candidates')
          .update({ hired_at: null })
          .eq('id', state.replaceCandidate.id)
          .eq('job_id', state.jobId);
        if (clearError) throw clearError;
      }

      // Hire all selected candidates
      const candidateIds = Array.from(selectedIds);
      const { error: hireError } = await supabase
        .from('candidates')
        .update({ hired_at: now, candidate_status: 'shortlisted' })
        .in('id', candidateIds)
        .eq('job_id', state.jobId);
      if (hireError) throw hireError;

      const map = await fetchHiredCandidatesForJobs([state.jobId]);
      const positionsFilled = map.get(state.jobId)?.length ?? 0;

      const { error: jobError } = await supabase
        .from('jobs')
        .update({ positions_filled: positionsFilled, updated_at: now })
        .eq('id', state.jobId);
      if (jobError) throw jobError;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['job-hired-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] }),
      ]);

      const hiredText = candidateIds.length === 1 ? 'candidate' : 'candidates';
      toast({
        title: state.mode === 'change' ? 'Hired candidate updated' : 'Hired candidates assigned',
        description: `${candidateIds.length} ${hiredText} hired. Positions filled: ${positionsFilled}`,
      });
      onSuccess?.(positionsFilled);
      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: 'Failed to update hire',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const title = state?.mode === 'change' ? 'Change hired candidate' : 'Assign hired candidates';
  const description =
    state?.mode === 'change' && state.replaceCandidate
      ? `Replace ${state.replaceCandidate.name} with another candidate from this job's pipeline.`
      : `Select one or more candidates who were on the pipeline for ${state?.jobTitle ?? 'this job'}.`;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading candidates…
          </div>
        ) : selectable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No eligible candidates on this job. All pipeline candidates are already marked as hired.
          </p>
        ) : (
          <div className="rounded-lg border max-h-[300px] overflow-y-auto">
            {selectable.map((c) => {
              const isSelected = selectedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-b-0 hover:bg-accent/50 ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                  onClick={() => {
                    const newSet = new Set(selectedIds);
                    if (isSelected) {
                      newSet.delete(c.id);
                    } else {
                      newSet.add(c.id);
                    }
                    setSelectedIds(newSet);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedIds.size > 0 && (
          <p className="text-sm text-muted-foreground text-center">
            {selectedIds.size} candidate{selectedIds.size > 1 ? 's' : ''} selected
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={selectedIds.size === 0 || saving || selectable.length === 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : state?.mode === 'change' ? (
              'Change hire'
            ) : (
              selectedIds.size > 1 ? 'Assign hired' : 'Assign hired'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
