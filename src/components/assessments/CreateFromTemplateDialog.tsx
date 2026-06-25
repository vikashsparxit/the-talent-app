import { useState } from 'react';
import { useNavigate } from 'react-router';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, Trash2 } from 'lucide-react';
import { useTemplates, type Template } from '@/hooks/useTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

interface CreateFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateFromTemplateDialog({
  open,
  onOpenChange,
}: CreateFromTemplateDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { templates, isLoading, deleteTemplate } = useTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setNewTitle(template.template_data.title);
  };

  const handleCreate = async () => {
    if (!selectedTemplate || !newTitle.trim()) return;
    
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const templateData = selectedTemplate.template_data;
      
      // Create assessment
      const { data: assessment, error: assessmentError } = await supabase
        .from('assessments')
        .insert({
          title: newTitle,
          description: templateData.description,
          duration_minutes: templateData.duration_minutes,
          passing_score: templateData.passing_score,
          settings: templateData.settings as unknown as Json,
          created_by: user?.id,
          status: 'draft',
        })
        .select()
        .single();
      
      if (assessmentError) throw assessmentError;
      
      // Create sections and questions
      for (const section of templateData.sections) {
        const { data: newSection, error: sectionError } = await supabase
          .from('assessment_sections')
          .insert({
            assessment_id: assessment.id,
            title: section.title,
            description: section.description,
            order_index: section.order_index,
            weightage: section.weightage,
          })
          .select()
          .single();
        
        if (sectionError) throw sectionError;
        
        // Create questions for this section
        if (section.questions.length > 0) {
          const questionsToInsert = section.questions.map(q => ({
            section_id: newSection.id,
            type: q.type,
            question_text: q.question_text,
            marks: q.marks,
            order_index: q.order_index,
            options: q.options as Json,
            correct_answer: q.correct_answer as Json,
            coding_language: q.coding_language,
            coding_starter_code: q.coding_starter_code,
            coding_test_cases: q.coding_test_cases as Json,
            subjective_max_words: q.subjective_max_words,
            subjective_rubric: q.subjective_rubric,
          }));
          
          const { error: questionsError } = await supabase
            .from('questions')
            .insert(questionsToInsert);
          
          if (questionsError) throw questionsError;
        }
      }
      
      toast({ title: 'Assessment created from template' });
      onOpenChange(false);
      navigate(`/assessments/${assessment.id}`);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to create assessment',
        description: error.message,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTemplate = async (e: React.MouseEvent, template: Template) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this template?')) {
      await deleteTemplate.mutateAsync(template.id);
      if (selectedTemplate?.id === template.id) {
        setSelectedTemplate(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create from Template</DialogTitle>
          <DialogDescription>
            Select a template to create a new assessment with pre-configured sections and questions.
          </DialogDescription>
        </DialogHeader>
        
        {!selectedTemplate ? (
          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                <p className="text-muted-foreground">
                  Create an assessment and save it as a template to use here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {template.description && (
                            <CardDescription className="mt-1">
                              {template.description}
                            </CardDescription>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteTemplate(e, template)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {template.template_data.duration_minutes} min
                        </div>
                        <Badge variant="secondary">
                          {template.template_data.sections.length} section(s)
                        </Badge>
                        <Badge variant="secondary">
                          {template.template_data.sections.reduce((acc, s) => acc + s.questions.length, 0)} question(s)
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">{selectedTemplate.name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedTemplate.template_data.sections.length} sections, {' '}
                {selectedTemplate.template_data.sections.reduce((acc, s) => acc + s.questions.length, 0)} questions
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-title">Assessment Title</Label>
              <Input
                id="new-title"
                placeholder="Enter a title for the new assessment"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
          </div>
        )}
        
        <DialogFooter>
          {selectedTemplate ? (
            <>
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={isCreating || !newTitle.trim()}>
                {isCreating ? 'Creating...' : 'Create Assessment'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
