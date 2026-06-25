import { useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, MoreVertical, FileText, Clock, Users, Edit, Trash2, Copy, LayoutTemplate, Sparkles } from 'lucide-react';
import { useAssessments } from '@/hooks/useAssessments';
import { CreateFromTemplateDialog } from '@/components/assessments/CreateFromTemplateDialog';
import { GenerateAssessmentDialog } from '@/components/assessments/GenerateAssessmentDialog';
import type { AssessmentStatus } from '@/types/database';

const statusConfig: Record<AssessmentStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  active: { label: 'Active', variant: 'default' },
  archived: { label: 'Archived', variant: 'outline' },
};

export default function Assessments() {
  usePageTitle('Assessments');
  const navigate = useNavigate();
  const { assessments, isLoading, createAssessment, deleteAssessment } = useAssessments();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAssessment, setNewAssessment] = useState({
    title: '',
    description: '',
    duration_minutes: 60,
    passing_score: 60,
  });
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);

  const filteredAssessments = assessments.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newAssessment.title.trim()) return;
    
    await createAssessment.mutateAsync(newAssessment);
    setIsCreateOpen(false);
    setNewAssessment({ title: '', description: '', duration_minutes: 60, passing_score: 60 });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this assessment?')) {
      await deleteAssessment.mutateAsync(id);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Assessments</h1>
            <p className="text-muted-foreground mt-1">Create and manage candidate assessments</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setIsGenerateDialogOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setIsTemplateDialogOpen(true)}>
              <LayoutTemplate className="h-4 w-4" />
              From Template
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Assessment
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Assessment</DialogTitle>
                <DialogDescription>
                  Set up the basic details for your assessment. You can add sections and questions after creation.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Frontend Developer Assessment"
                    value={newAssessment.title}
                    onChange={(e) => setNewAssessment(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this assessment..."
                    value={newAssessment.description}
                    onChange={(e) => setNewAssessment(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={newAssessment.duration_minutes}
                      onChange={(e) => setNewAssessment(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passing">Passing Score (%)</Label>
                    <Input
                      id="passing"
                      type="number"
                      value={newAssessment.passing_score}
                      onChange={(e) => setNewAssessment(prev => ({ ...prev, passing_score: parseInt(e.target.value) || 60 }))}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createAssessment.isPending}>
                  {createAssessment.isPending ? 'Creating...' : 'Create Assessment'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
          
        <CreateFromTemplateDialog
          open={isTemplateDialogOpen}
          onOpenChange={setIsTemplateDialogOpen}
        />

        <GenerateAssessmentDialog
          open={isGenerateDialogOpen}
          onOpenChange={setIsGenerateDialogOpen}
        />

        <div className="mb-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assessments..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredAssessments.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No assessments yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first assessment to start evaluating candidates.
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Assessment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAssessments.map(assessment => {
              const config = statusConfig[assessment.status];
              return (
                <Card 
                  key={assessment.id} 
                  className="group hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/assessments/${assessment.id}`)}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{assessment.title}</CardTitle>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/assessments/${assessment.id}`); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(assessment.id); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent>
                    {assessment.description && (
                      <CardDescription className="line-clamp-2 mb-4">
                        {assessment.description}
                      </CardDescription>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {assessment.duration_minutes} min
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {assessment.passing_score}% to pass
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
