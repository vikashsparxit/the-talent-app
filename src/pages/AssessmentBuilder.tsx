import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useParams, useNavigate } from 'react-router';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2,
  Pencil,
  GripVertical,
  FileText,
  Code,
  MessageSquare,
  Settings,
  LayoutTemplate,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { useAssessmentDetails, useAssessments, useSections, useQuestions } from '@/hooks/useAssessments';
import { QuestionForm } from '@/components/assessment/QuestionForm';
import { QuestionCard } from '@/components/assessment/QuestionCard';
import { SaveAsTemplateDialog } from '@/components/assessments/SaveAsTemplateDialog';
import { supabase } from '@/integrations/supabase/client';
import type { AssessmentSection, AssessmentStatus, QuestionType } from '@/types/database';

const statusOptions: { value: AssessmentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const questionTypeIcons: Record<QuestionType, React.ReactNode> = {
  mcq: <FileText className="h-4 w-4" />,
  coding: <Code className="h-4 w-4" />,
  subjective: <MessageSquare className="h-4 w-4" />,
  file_upload: <Upload className="h-4 w-4" />,
};

export default function AssessmentBuilder() {
  usePageTitle('Assessment Builder');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading, refetch } = useAssessmentDetails(id);
  const { updateAssessment } = useAssessments();
  const { createSection, updateSection, deleteSection } = useSections(id);
  const { createQuestion, deleteQuestion } = useQuestions(id);

  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  const emptySectionForm = { title: '', description: '', weightage: 100, skill_tags: '' };
  const [sectionForm, setSectionForm] = useState(emptySectionForm);
  const [assessmentForm, setAssessmentForm] = useState({
    title: '',
    description: '',
    duration_minutes: 60,
    passing_score: 60,
    status: 'draft' as AssessmentStatus,
    settings: {
      randomize_questions: false,
      show_score_immediately: false,
      allow_review: false,
    },
  });

  useEffect(() => {
    if (!assessment) return;
    setAssessmentForm({
      title: assessment.title,
      description: assessment.description || '',
      duration_minutes: assessment.duration_minutes,
      passing_score: assessment.passing_score,
      status: assessment.status,
      settings: assessment.settings,
    });
  }, [assessment?.id]);

  const handleSaveAssessment = async () => {
    if (!id) return;
    await updateAssessment.mutateAsync({
      id,
      ...assessmentForm,
    });
  };

  const skillTagsToString = (tags: AssessmentSection['skill_tags']) =>
    Array.isArray(tags) ? tags.join(', ') : '';

  const resetSectionDialog = () => {
    setEditingSectionId(null);
    setSectionForm(emptySectionForm);
    setIsSectionDialogOpen(false);
  };

  const openAddSection = () => {
    setEditingSectionId(null);
    setSectionForm(emptySectionForm);
    setIsSectionDialogOpen(true);
  };

  const openEditSection = (section: AssessmentSection & { questions: unknown[] }) => {
    setEditingSectionId(section.id);
    setSectionForm({
      title: section.title,
      description: section.description || '',
      weightage: section.weightage,
      skill_tags: skillTagsToString(section.skill_tags),
    });
    setIsSectionDialogOpen(true);
  };

  const assessmentHasAssignments = async (): Promise<boolean> => {
    if (!id) return false;
    const { count, error } = await supabase
      .from('candidate_assessments')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', id);
    if (error) return true;
    return (count ?? 0) > 0;
  };

  const confirmLiveSectionSave = async (): Promise<boolean> => {
    const status = assessmentForm.status || assessment?.status;
    const needsConfirm = status !== 'draft' || (await assessmentHasAssignments());
    if (!needsConfirm) return true;

    return confirm(
      'This assessment is not a draft or has been assigned to candidates. Changing section details (especially weightage or skill tags) may affect scoring. Continue?'
    );
  };

  const handleSaveSection = async () => {
    if (!id || !sectionForm.title.trim()) return;

    const ok = await confirmLiveSectionSave();
    if (!ok) return;

    const skillTagsArr = sectionForm.skill_tags.split(',').map(s => s.trim()).filter(Boolean);

    if (editingSectionId) {
      await updateSection.mutateAsync({
        id: editingSectionId,
        title: sectionForm.title,
        description: sectionForm.description || undefined,
        weightage: sectionForm.weightage,
        skill_tags: skillTagsArr,
      });
    } else {
      await createSection.mutateAsync({
        assessment_id: id,
        title: sectionForm.title,
        description: sectionForm.description || undefined,
        weightage: sectionForm.weightage,
        order_index: assessment?.sections?.length ?? 0,
        skill_tags: skillTagsArr.length > 0 ? skillTagsArr : undefined,
      });
    }
    resetSectionDialog();
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (confirm('Delete this section and all its questions?')) {
      await deleteSection.mutateAsync(sectionId);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (confirm('Delete this question?')) {
      await deleteQuestion.mutateAsync(questionId);
    }
  };

  const openAddQuestion = (sectionId: string) => {
    setActiveSectionId(sectionId);
    setEditingQuestionId(null);
    setIsQuestionDialogOpen(true);
  };

  const openEditQuestion = (sectionId: string, questionId: string) => {
    setActiveSectionId(sectionId);
    setEditingQuestionId(questionId);
    setIsQuestionDialogOpen(true);
  };

  const handleQuestionSaved = () => {
    setIsQuestionDialogOpen(false);
    setActiveSectionId(null);
    setEditingQuestionId(null);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Assessment not found</h1>
          <Button onClick={() => navigate('/assessments')}>Back to Assessments</Button>
        </main>
      </div>
    );
  }

  const totalQuestions = assessment.sections.reduce((acc, s) => acc + s.questions.length, 0);
  const totalMarks = assessment.sections.reduce(
    (acc, s) => acc + s.questions.reduce((qacc, q) => qacc + q.marks, 0),
    0
  );
  const otherSectionsWeightage = assessment.sections
    .filter((s) => s.id !== editingSectionId)
    .reduce((acc, s) => acc + s.weightage, 0);
  const projectedWeightageTotal = otherSectionsWeightage + (Number.isFinite(sectionForm.weightage) ? sectionForm.weightage : 0);

  const activeSection = assessment.sections.find(s => s.id === activeSectionId);
  const editingQuestion = activeSection?.questions.find(q => q.id === editingQuestionId);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {(assessmentForm.status === 'draft' || assessment.status === 'draft') && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Draft assessment</AlertTitle>
            <AlertDescription>
              This assessment is a draft. Set status to <strong>Active</strong> and save before assigning to candidates or linking on jobs.
            </AlertDescription>
          </Alert>
        )}

        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/assessments')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{assessment.title}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{assessment.sections.length} sections</span>
                <span>•</span>
                <span>{totalQuestions} questions</span>
                <span>•</span>
                <span>{totalMarks} marks</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)}>
              <LayoutTemplate className="h-4 w-4 mr-2" />
              Save as Template
            </Button>
            <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button onClick={handleSaveAssessment} disabled={updateAssessment.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateAssessment.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
        
        <SaveAsTemplateDialog
          open={isTemplateDialogOpen}
          onOpenChange={setIsTemplateDialogOpen}
          assessment={assessment}
        />

        {/* Assessment Settings Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Assessment Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={assessmentForm.title || assessment.title}
                onChange={(e) => setAssessmentForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={assessmentForm.status || assessment.status}
                onValueChange={(value: AssessmentStatus) => setAssessmentForm(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={assessmentForm.description || assessment.description || ''}
                onChange={(e) => setAssessmentForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                value={assessmentForm.duration_minutes || assessment.duration_minutes}
                onChange={(e) => setAssessmentForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passing">Passing Score (%)</Label>
              <Input
                id="passing"
                type="number"
                value={assessmentForm.passing_score || assessment.passing_score}
                onChange={(e) => setAssessmentForm(prev => ({ ...prev, passing_score: parseInt(e.target.value) || 60 }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Sections</h2>
          <Button onClick={openAddSection} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Section
          </Button>
        </div>

        {assessment.sections.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sections yet</h3>
              <p className="text-muted-foreground mb-4">
                Add sections to organize your assessment questions.
              </p>
              <Button onClick={openAddSection} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Section
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" className="space-y-4" defaultValue={assessment.sections.map(s => s.id)}>
            {assessment.sections.map((section) => {
              const skillTags = Array.isArray(section.skill_tags) ? section.skill_tags : [];
              return (
              <AccordionItem key={section.id} value={section.id} className="border rounded-lg bg-card">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-3 flex-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="text-left">
                      <div className="font-medium">{section.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {section.questions.length} questions • {section.weightage}% weightage
                        {skillTags.length > 0 && (
                          <span className="ml-2">• Skills: {skillTags.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  {section.description && (
                    <p className="text-sm text-muted-foreground mb-4">{section.description}</p>
                  )}

                  <div className="space-y-3 mb-4">
                    {section.questions.map((question, qIndex) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        index={qIndex + 1}
                        onEdit={() => openEditQuestion(section.id, question.id)}
                        onDelete={() => handleDeleteQuestion(question.id)}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => openAddQuestion(section.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Question
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => openEditSection(section)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Section
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSection(section.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Section
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
              );
            })}
          </Accordion>
        )}

        {/* Add / Edit Section Dialog */}
        <Dialog
          open={isSectionDialogOpen}
          onOpenChange={(open) => {
            if (!open) resetSectionDialog();
            else setIsSectionDialogOpen(true);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSectionId ? 'Edit Section' : 'Add Section'}</DialogTitle>
              <DialogDescription>
                {editingSectionId
                  ? 'Update this section title, weightage, or skill tags.'
                  : 'Create a new section to organize related questions.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sectionTitle">Section Title</Label>
                <Input
                  id="sectionTitle"
                  placeholder="e.g., Technical Skills"
                  value={sectionForm.title}
                  onChange={(e) => setSectionForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sectionDesc">Description (optional)</Label>
                <Textarea
                  id="sectionDesc"
                  placeholder="Brief description of this section..."
                  value={sectionForm.description}
                  onChange={(e) => setSectionForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weightage">Weightage (%)</Label>
                <Input
                  id="weightage"
                  type="number"
                  value={sectionForm.weightage}
                  onChange={(e) => setSectionForm(prev => ({ ...prev, weightage: parseInt(e.target.value) || 0 }))}
                />
                <p className={`text-xs ${projectedWeightageTotal === 100 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                  Sections total {projectedWeightageTotal}% (target 100%)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skillTags">Skill Tags (comma-separated)</Label>
                <Input
                  id="skillTags"
                  placeholder="e.g., React, TypeScript, Frontend"
                  value={sectionForm.skill_tags}
                  onChange={(e) => setSectionForm(prev => ({ ...prev, skill_tags: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Link skills to this section. Assessment performance will verify candidate proficiency in these skills.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetSectionDialog}>Cancel</Button>
              <Button
                onClick={handleSaveSection}
                disabled={createSection.isPending || updateSection.isPending || !sectionForm.title.trim()}
              >
                {editingSectionId
                  ? (updateSection.isPending ? 'Saving...' : 'Save Section')
                  : (createSection.isPending ? 'Adding...' : 'Add Section')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Question Dialog */}
        <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingQuestionId ? 'Edit Question' : 'Add Question'}</DialogTitle>
              <DialogDescription>
                {activeSection && `Adding to: ${activeSection.title}`}
              </DialogDescription>
            </DialogHeader>
            {activeSectionId && (
              <QuestionForm
                assessmentId={id!}
                sectionId={activeSectionId}
                question={editingQuestion}
                onSaved={handleQuestionSaved}
                onCancel={() => setIsQuestionDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assessment Settings</DialogTitle>
              <DialogDescription>
                Configure how candidates experience this assessment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Randomize Questions</Label>
                  <p className="text-sm text-muted-foreground">Shuffle question order for each candidate</p>
                </div>
                <Switch
                  checked={assessmentForm.settings.randomize_questions}
                  onCheckedChange={(checked) => setAssessmentForm(prev => ({
                    ...prev,
                    settings: { ...prev.settings, randomize_questions: checked }
                  }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Show Score Immediately</Label>
                  <p className="text-sm text-muted-foreground">Display score after submission</p>
                </div>
                <Switch
                  checked={assessmentForm.settings.show_score_immediately}
                  onCheckedChange={(checked) => setAssessmentForm(prev => ({
                    ...prev,
                    settings: { ...prev.settings, show_score_immediately: checked }
                  }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Allow Review</Label>
                  <p className="text-sm text-muted-foreground">Let candidates review answers before submitting</p>
                </div>
                <Switch
                  checked={assessmentForm.settings.allow_review}
                  onCheckedChange={(checked) => setAssessmentForm(prev => ({
                    ...prev,
                    settings: { ...prev.settings, allow_review: checked }
                  }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsSettingsOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
