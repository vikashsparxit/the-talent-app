import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, X } from 'lucide-react';
import { useQuestions } from '@/hooks/useAssessments';
import type { Question, QuestionType, MCQOption, CodingTestCase } from '@/types/database';

interface QuestionFormProps {
  assessmentId: string;
  sectionId: string;
  question?: Question;
  onSaved: () => void;
  onCancel: () => void;
}

const defaultMCQOptions: MCQOption[] = [
  { id: '1', text: '', is_correct: false },
  { id: '2', text: '', is_correct: false },
  { id: '3', text: '', is_correct: false },
  { id: '4', text: '', is_correct: false },
];

const defaultTestCase: CodingTestCase = { input: '', expected_output: '', is_hidden: false };

export function QuestionForm({ assessmentId, sectionId, question, onSaved, onCancel }: QuestionFormProps) {
  const { createQuestion, updateQuestion } = useQuestions(assessmentId);
  const isEditing = !!question;

  const [form, setForm] = useState({
    type: 'mcq' as QuestionType,
    question_text: '',
    marks: 1,
    options: defaultMCQOptions,
    coding_language: 'javascript',
    coding_starter_code: '',
    coding_test_cases: [{ ...defaultTestCase }],
    subjective_max_words: 500,
    subjective_rubric: '',
  });

  useEffect(() => {
    if (question) {
      setForm({
        type: question.type,
        question_text: question.question_text,
        marks: question.marks,
        options: question.options?.length ? question.options : defaultMCQOptions,
        coding_language: question.coding_language || 'javascript',
        coding_starter_code: question.coding_starter_code || '',
        coding_test_cases: question.coding_test_cases?.length ? question.coding_test_cases : [{ ...defaultTestCase }],
        subjective_max_words: question.subjective_max_words || 500,
        subjective_rubric: question.subjective_rubric || '',
      });
    }
  }, [question]);

  const handleSave = async () => {
    if (!form.question_text.trim()) return;

    const baseData = {
      section_id: sectionId,
      type: form.type,
      question_text: form.question_text,
      marks: form.marks,
    };

    const questionData: any = { ...baseData };

    if (form.type === 'mcq') {
      // Find correct answers
      const correctIds = form.options.filter(o => o.is_correct).map(o => o.id);
      questionData.options = form.options;
      questionData.correct_answer = correctIds;
    } else if (form.type === 'coding') {
      questionData.coding_language = form.coding_language;
      questionData.coding_starter_code = form.coding_starter_code;
      questionData.coding_test_cases = form.coding_test_cases;
    } else if (form.type === 'subjective') {
      questionData.subjective_max_words = form.subjective_max_words;
      questionData.subjective_rubric = form.subjective_rubric;
    }

    if (isEditing && question) {
      await updateQuestion.mutateAsync({ id: question.id, ...questionData });
    } else {
      await createQuestion.mutateAsync(questionData);
    }
    onSaved();
  };

  const addOption = () => {
    const newId = String(form.options.length + 1);
    setForm(prev => ({
      ...prev,
      options: [...prev.options, { id: newId, text: '', is_correct: false }],
    }));
  };

  const removeOption = (id: string) => {
    if (form.options.length <= 2) return;
    setForm(prev => ({
      ...prev,
      options: prev.options.filter(o => o.id !== id),
    }));
  };

  const updateOption = (id: string, updates: Partial<MCQOption>) => {
    setForm(prev => ({
      ...prev,
      options: prev.options.map(o => o.id === id ? { ...o, ...updates } : o),
    }));
  };

  const addTestCase = () => {
    setForm(prev => ({
      ...prev,
      coding_test_cases: [...prev.coding_test_cases, { ...defaultTestCase }],
    }));
  };

  const removeTestCase = (index: number) => {
    if (form.coding_test_cases.length <= 1) return;
    setForm(prev => ({
      ...prev,
      coding_test_cases: prev.coding_test_cases.filter((_, i) => i !== index),
    }));
  };

  const updateTestCase = (index: number, updates: Partial<CodingTestCase>) => {
    setForm(prev => ({
      ...prev,
      coding_test_cases: prev.coding_test_cases.map((tc, i) => i === index ? { ...tc, ...updates } : tc),
    }));
  };

  const isPending = createQuestion.isPending || updateQuestion.isPending;

  return (
    <div className="space-y-6">
      {/* Question Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Question Type</Label>
          <Select
            value={form.type}
            onValueChange={(value: QuestionType) => setForm(prev => ({ ...prev, type: value }))}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mcq">Multiple Choice</SelectItem>
              <SelectItem value="coding">Coding</SelectItem>
              <SelectItem value="subjective">Subjective</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="marks">Marks</Label>
          <Input
            id="marks"
            type="number"
            min={1}
            value={form.marks}
            onChange={(e) => setForm(prev => ({ ...prev, marks: parseInt(e.target.value) || 1 }))}
          />
        </div>
      </div>

      {/* Question Text */}
      <div className="space-y-2">
        <Label htmlFor="questionText">Question</Label>
        <Textarea
          id="questionText"
          placeholder="Enter your question here..."
          rows={3}
          value={form.question_text}
          onChange={(e) => setForm(prev => ({ ...prev, question_text: e.target.value }))}
        />
      </div>

      {/* MCQ Options */}
      {form.type === 'mcq' && (
        <div className="space-y-4">
          <Label>Answer Options</Label>
          <div className="space-y-3">
            {form.options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={option.is_correct}
                    onChange={(e) => updateOption(option.id, { is_correct: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-muted-foreground w-6">
                    {String.fromCharCode(65 + index)}.
                  </span>
                </div>
                <Input
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  value={option.text}
                  onChange={(e) => updateOption(option.id, { text: e.target.value })}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeOption(option.id)}
                  disabled={form.options.length <= 2}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addOption} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Option
          </Button>
          <p className="text-xs text-muted-foreground">
            Check the box next to correct answer(s). Multiple correct answers are allowed.
          </p>
        </div>
      )}

      {/* Coding Options */}
      {form.type === 'coding' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Programming Language</Label>
            <Select
              value={form.coding_language}
              onValueChange={(value) => setForm(prev => ({ ...prev, coding_language: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="typescript">TypeScript</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="java">Java</SelectItem>
                <SelectItem value="cpp">C++</SelectItem>
                <SelectItem value="csharp">C#</SelectItem>
                <SelectItem value="go">Go</SelectItem>
                <SelectItem value="rust">Rust</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="starterCode">Starter Code (optional)</Label>
            <Textarea
              id="starterCode"
              placeholder="// Starter code for candidates..."
              rows={4}
              className="font-mono text-sm"
              value={form.coding_starter_code}
              onChange={(e) => setForm(prev => ({ ...prev, coding_starter_code: e.target.value }))}
            />
          </div>

          <div className="space-y-3">
            <Label>Test Cases</Label>
            {form.coding_test_cases.map((tc, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Test Case {index + 1}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tc.is_hidden}
                        onCheckedChange={(checked) => updateTestCase(index, { is_hidden: checked })}
                      />
                      <span className="text-xs text-muted-foreground">Hidden</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeTestCase(index)}
                      disabled={form.coding_test_cases.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Input</Label>
                    <Textarea
                      placeholder="Test input..."
                      rows={2}
                      className="font-mono text-sm"
                      value={tc.input}
                      onChange={(e) => updateTestCase(index, { input: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Expected Output</Label>
                    <Textarea
                      placeholder="Expected output..."
                      rows={2}
                      className="font-mono text-sm"
                      value={tc.expected_output}
                      onChange={(e) => updateTestCase(index, { expected_output: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTestCase} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Test Case
            </Button>
          </div>
        </div>
      )}

      {/* Subjective Options */}
      {form.type === 'subjective' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxWords">Maximum Words</Label>
            <Input
              id="maxWords"
              type="number"
              value={form.subjective_max_words}
              onChange={(e) => setForm(prev => ({ ...prev, subjective_max_words: parseInt(e.target.value) || 500 }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rubric">Grading Rubric (for evaluators)</Label>
            <Textarea
              id="rubric"
              placeholder="Describe how this answer should be evaluated..."
              rows={4}
              value={form.subjective_rubric}
              onChange={(e) => setForm(prev => ({ ...prev, subjective_rubric: e.target.value }))}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={isPending || !form.question_text.trim()}>
          {isPending ? 'Saving...' : isEditing ? 'Update Question' : 'Add Question'}
        </Button>
      </div>
    </div>
  );
}
