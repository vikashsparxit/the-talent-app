import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTemplates, assessmentToTemplateData, type TemplateData } from '@/hooks/useTemplates';
import type { AssessmentWithDetails } from '@/types/database';

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: AssessmentWithDetails;
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  assessment,
}: SaveAsTemplateDialogProps) {
  const { createTemplate } = useTemplates();
  const [name, setName] = useState(assessment.title + ' Template');
  const [description, setDescription] = useState(assessment.description || '');

  const handleSave = async () => {
    const templateData = assessmentToTemplateData(assessment);
    
    await createTemplate.mutateAsync({
      name,
      description,
      template_data: templateData,
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save this assessment as a reusable template for future use.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              placeholder="e.g., Frontend Developer Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              placeholder="Brief description of this template..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            This template will include:
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>{assessment.sections.length} section(s)</li>
              <li>{assessment.sections.reduce((acc, s) => acc + s.questions.length, 0)} question(s)</li>
              <li>Duration: {assessment.duration_minutes} minutes</li>
              <li>Passing score: {assessment.passing_score}%</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createTemplate.isPending || !name.trim()}>
            {createTemplate.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
