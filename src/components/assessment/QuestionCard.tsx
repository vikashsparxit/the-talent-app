import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, FileText, Code, MessageSquare, CheckCircle } from 'lucide-react';
import type { Question, QuestionType } from '@/types/database';

const typeConfig: Record<QuestionType, { label: string; icon: React.ReactNode; color: string }> = {
  mcq: { 
    label: 'MCQ', 
    icon: <FileText className="h-3.5 w-3.5" />, 
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
  },
  coding: { 
    label: 'Coding', 
    icon: <Code className="h-3.5 w-3.5" />, 
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' 
  },
  subjective: { 
    label: 'Subjective', 
    icon: <MessageSquare className="h-3.5 w-3.5" />, 
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' 
  },
};

interface QuestionCardProps {
  question: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function QuestionCard({ question, index, onEdit, onDelete }: QuestionCardProps) {
  const config = typeConfig[question.type];

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
            {index}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className={`gap-1 ${config.color}`}>
                {config.icon}
                {config.label}
              </Badge>
              <Badge variant="outline">{question.marks} {question.marks === 1 ? 'mark' : 'marks'}</Badge>
            </div>
            <p className="text-sm font-medium line-clamp-2">{question.question_text}</p>
            
            {/* MCQ Preview */}
            {question.type === 'mcq' && question.options && (
              <div className="mt-2 space-y-1">
                {question.options.slice(0, 4).map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    {opt.is_correct ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                    )}
                    <span className="truncate">{opt.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Coding Preview */}
            {question.type === 'coding' && question.coding_language && (
              <div className="mt-2 text-xs text-muted-foreground">
                Language: {question.coding_language}
                {question.coding_test_cases && ` • ${question.coding_test_cases.length} test cases`}
              </div>
            )}

            {/* Subjective Preview */}
            {question.type === 'subjective' && question.subjective_max_words && (
              <div className="mt-2 text-xs text-muted-foreground">
                Max words: {question.subjective_max_words}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-destructive hover:text-destructive" 
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
