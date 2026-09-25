import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tag, X, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCandidateTagMutations } from '@/hooks/useCandidateTags';
import type { Candidate } from '@/types/database';

interface ManageTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: Candidate;
}

export function ManageTagsDialog({ open, onOpenChange, candidate }: ManageTagsDialogProps) {
  const [newTag, setNewTag] = useState('');
  const { addTag, removeTag } = useCandidateTagMutations();

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['candidate-tags-single', candidate.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_tags')
        .select('tag')
        .eq('candidate_id', candidate.id)
        .order('tag');
      if (error) throw error;
      return (data || []).map((r) => r.tag);
    },
  });

  const handleAdd = async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    await addTag.mutateAsync({ candidateId: candidate.id, tag: trimmed });
    setNewTag('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Manage Tags
          </DialogTitle>
          <DialogDescription>
            Add talent pool tags for <strong>{candidate.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tags...
            </div>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => removeTag.mutate({ candidateId: candidate.id, tag })}
                    disabled={removeTag.isPending}
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="e.g. react, senior, referral pool"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } }}
            />
            <Button onClick={() => void handleAdd()} disabled={!newTag.trim() || addTag.isPending}>
              Add
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
