import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useCompanyDisplayName } from '@/components/CompanyLogo';
import {
  emptyReference,
  getReferenceContactFieldErrors,
  isValidReferenceEmail,
  isValidReferencePhone,
  referenceContactFieldKey,
  resolvePrescreenQuestionText,
  substituteCompanyName,
  validateQuestionAnswers,
  validateReferences,
  type EmploymentReference,
  type PrescreenQuestion,
} from '@/lib/jobApplicationForm';
import { Loader2, Plus, Trash2, Users, FileText } from 'lucide-react';

export interface JobApplicationFormViewHandle {
  submit: () => void;
  saveDraft: () => void;
}

interface JobApplicationFormViewProps {
  questions: PrescreenQuestion[];
  initialReferences: EmploymentReference[];
  initialAnswers: Record<string, string>;
  isSubmitted: boolean;
  filledByRecruiter?: boolean;
  onSubmit: (data: { references: EmploymentReference[]; answers: Record<string, string> }) => void;
  onSaveDraft?: (data: { references: EmploymentReference[]; answers: Record<string, string> }) => void;
  isSubmitting?: boolean;
  isSavingDraft?: boolean;
  readOnly?: boolean;
  hideActions?: boolean;
}

export const JobApplicationFormView = forwardRef<JobApplicationFormViewHandle, JobApplicationFormViewProps>(
function JobApplicationFormView({
  questions,
  initialReferences,
  initialAnswers,
  isSubmitted,
  filledByRecruiter,
  onSubmit,
  onSaveDraft,
  isSubmitting,
  isSavingDraft,
  readOnly = false,
  hideActions = false,
}, ref) {
  const companyName = useCompanyDisplayName();
  const [references, setReferences] = useState<EmploymentReference[]>(
    initialReferences.length > 0 ? initialReferences : [emptyReference(), emptyReference()],
  );
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceFieldErrors, setReferenceFieldErrors] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});

  const assignedKeys = useMemo(() => questions.map((q) => q.question_key), [questions]);

  const displayQuestions = useMemo(
    () => questions.map((q) => ({
      ...q,
      displayText: substituteCompanyName(
        resolvePrescreenQuestionText(q, assignedKeys),
        companyName,
      ),
    })),
    [questions, companyName, assignedKeys],
  );

  const disabled = readOnly || isSubmitted;

  const updateReference = (index: number, field: keyof EmploymentReference, value: string) => {
    setReferenceError(null);
    if (field === 'phone' || field === 'email') {
      setReferenceFieldErrors((prev) => {
        const key = referenceContactFieldKey(index, field);
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setReferences((prev) => prev.map((ref, i) => (i === index ? { ...ref, [field]: value } : ref)));
  };

  const blurValidateReferenceContact = (index: number, field: 'phone' | 'email', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const key = referenceContactFieldKey(index, field);
    const invalid = field === 'phone'
      ? !isValidReferencePhone(trimmed)
      : !isValidReferenceEmail(trimmed);
    if (!invalid) return;

    setReferenceFieldErrors((prev) => ({
      ...prev,
      [key]: field === 'phone'
        ? 'Enter a valid phone number (7–15 digits).'
        : 'Enter a valid email address.',
    }));
  };

  const addReference = () => {
    setReferences((prev) => [...prev, emptyReference()]);
  };

  const removeReference = (index: number) => {
    setReferences((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const assignedKeys = questions.map((q) => q.question_key);
    const refError = validateReferences(references);
    const contactFieldErrors = getReferenceContactFieldErrors(references);
    const answerError = validateQuestionAnswers(assignedKeys, answers);

    const nextQuestionErrors: Record<string, string> = {};
    if (answerError) {
      for (const key of assignedKeys) {
        if (!answers[key]?.trim()) {
          nextQuestionErrors[key] = 'This answer is required.';
        }
      }
    }

    if (refError || answerError || Object.keys(contactFieldErrors).length > 0) {
      setReferenceError(refError);
      setReferenceFieldErrors(contactFieldErrors);
      setQuestionErrors(nextQuestionErrors);
      return;
    }

    setReferenceError(null);
    setReferenceFieldErrors({});
    setQuestionErrors({});
    onSubmit({ references, answers });
  };

  const handleSaveDraft = () => {
    onSaveDraft?.({ references, answers });
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    saveDraft: handleSaveDraft,
  }));

  return (
    <div className="space-y-6">
      {isSubmitted && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            Submitted
          </Badge>
          {filledByRecruiter && (
            <Badge variant="outline">Filled by recruiter</Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Employment References
          </CardTitle>
          <CardDescription>
            Provide at least two references from current or previous employers (for background verification).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {referenceError && (
            <p className="text-sm text-destructive" role="alert">
              {referenceError}
            </p>
          )}
          {references.map((ref, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Reference {index + 1}</p>
                {!disabled && references.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-8"
                    onClick={() => removeReference(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={ref.name}
                    onChange={(e) => updateReference(index, 'name', e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input
                    value={ref.company}
                    onChange={(e) => updateReference(index, 'company', e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input
                    value={ref.designation}
                    onChange={(e) => updateReference(index, 'designation', e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Relationship</Label>
                  <Input
                    value={ref.relationship}
                    onChange={(e) => updateReference(index, 'relationship', e.target.value)}
                    placeholder="e.g. Direct Manager"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={ref.phone}
                    onChange={(e) => updateReference(index, 'phone', e.target.value)}
                    onBlur={(e) => blurValidateReferenceContact(index, 'phone', e.target.value)}
                    disabled={disabled}
                    aria-invalid={Boolean(referenceFieldErrors[referenceContactFieldKey(index, 'phone')])}
                  />
                  {referenceFieldErrors[referenceContactFieldKey(index, 'phone')] && (
                    <p className="text-sm text-destructive" role="alert">
                      {referenceFieldErrors[referenceContactFieldKey(index, 'phone')]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={ref.email}
                    onChange={(e) => updateReference(index, 'email', e.target.value)}
                    onBlur={(e) => blurValidateReferenceContact(index, 'email', e.target.value)}
                    disabled={disabled}
                    aria-invalid={Boolean(referenceFieldErrors[referenceContactFieldKey(index, 'email')])}
                  />
                  {referenceFieldErrors[referenceContactFieldKey(index, 'email')] && (
                    <p className="text-sm text-destructive" role="alert">
                      {referenceFieldErrors[referenceContactFieldKey(index, 'email')]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={addReference} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Reference
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Application Questions
          </CardTitle>
          <CardDescription>
            You will answer 10 personalized questions selected for your application. Answer each thoughtfully — they help us understand your fit before interviews.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {displayQuestions.map((question, index) => (
            <div key={question.question_key} className="space-y-2">
              <Label htmlFor={question.question_key}>
                {index + 1}. {question.displayText}
              </Label>
              <Textarea
                id={question.question_key}
                value={answers[question.question_key] || ''}
                onChange={(e) => {
                  setQuestionErrors((prev) => {
                    if (!prev[question.question_key]) return prev;
                    const next = { ...prev };
                    delete next[question.question_key];
                    return next;
                  });
                  setAnswers((prev) => ({ ...prev, [question.question_key]: e.target.value }));
                }}
                rows={4}
                disabled={disabled}
                placeholder="Your answer..."
                aria-invalid={Boolean(questionErrors[question.question_key])}
              />
              {questionErrors[question.question_key] && (
                <p className="text-sm text-destructive" role="alert">
                  {questionErrors[question.question_key]}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {!disabled && !hideActions && (
        <>
          <Separator />
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            {onSaveDraft && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSubmitting || isSavingDraft}
              >
                {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Draft
              </Button>
            )}
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isSavingDraft}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Application Form
            </Button>
          </div>
        </>
      )}
    </div>
  );
});
