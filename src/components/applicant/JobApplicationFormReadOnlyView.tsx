import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, FileText, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCompanyDisplayName } from '@/components/CompanyLogo';
import { PRESCREEN_CATEGORY_LABELS } from '@/hooks/usePrescreenQuestionBank';
import {
  resolvePrescreenQuestionText,
  substituteCompanyName,
  type EmploymentReference,
  type PrescreenCategory,
  type PrescreenQuestion,
} from '@/lib/jobApplicationForm';
import { cn } from '@/lib/utils';

interface JobApplicationFormReadOnlyViewProps {
  questions: PrescreenQuestion[];
  references: EmploymentReference[];
  answers: Record<string, string>;
}

function EmptyValue() {
  return <span className="text-muted-foreground italic">No answer</span>;
}

function AnswerText({ value }: { value: string | undefined }) {
  const trimmed = value?.trim();
  if (!trimmed) return <EmptyValue />;
  return <span className="whitespace-pre-wrap">{trimmed}</span>;
}

function ReferenceCard({ reference, index }: { reference: EmploymentReference; index: number }) {
  const primary = [reference.name, reference.company, reference.designation]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');

  const contact = [reference.relationship?.trim(), reference.phone?.trim(), reference.email?.trim()]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-lg bg-muted/30 p-3 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Reference {index + 1}</p>
      <p className="text-sm font-medium">{primary || '—'}</p>
      {contact ? <p className="text-xs text-muted-foreground">{contact}</p> : null}
    </div>
  );
}

function ReadOnlySection({
  title,
  icon: Icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: typeof Users;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">{title}</span>
        <Badge variant="outline" className="text-[10px]">
          {count}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 pl-5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function JobApplicationFormReadOnlyView({
  questions,
  references,
  answers,
}: JobApplicationFormReadOnlyViewProps) {
  const companyName = useCompanyDisplayName();
  const assignedKeys = useMemo(() => questions.map((q) => q.question_key), [questions]);

  const displayQuestions = useMemo(
    () =>
      questions.map((question, index) => ({
        ...question,
        number: index + 1,
        displayText: substituteCompanyName(
          resolvePrescreenQuestionText(question, assignedKeys),
          companyName,
        ),
      })),
    [questions, companyName, assignedKeys],
  );

  const questionsByCategory = useMemo(() => {
    const groups: Array<{
      category: string;
      label: string;
      questions: typeof displayQuestions;
    }> = [];
    const seen = new Set<string>();

    for (const question of displayQuestions) {
      if (seen.has(question.category)) continue;
      seen.add(question.category);
      groups.push({
        category: question.category,
        label:
          PRESCREEN_CATEGORY_LABELS[question.category as PrescreenCategory] ?? question.category,
        questions: displayQuestions.filter((item) => item.category === question.category),
      });
    }

    return groups;
  }, [displayQuestions]);

  const visibleReferences = references.filter((reference) =>
    Object.values(reference).some((value) => value?.trim()),
  );

  return (
    <div className="space-y-4">
      <ReadOnlySection
        title="Employment References"
        icon={Users}
        count={visibleReferences.length}
      >
        {visibleReferences.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleReferences.map((reference, index) => (
              <ReferenceCard key={index} reference={reference} index={index} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No references provided</p>
        )}
      </ReadOnlySection>

      <ReadOnlySection
        title="Application Questions"
        icon={FileText}
        count={displayQuestions.length}
      >
        <div className="space-y-4">
          {questionsByCategory.map((group) => (
            <div key={group.category} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.questions.map((question) => (
                  <div key={question.question_key} className="space-y-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{question.number}.</span> {question.displayText}
                    </p>
                    <div className="text-sm bg-muted/30 rounded-lg px-3 py-2">
                      <AnswerText value={answers[question.question_key]} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ReadOnlySection>
    </div>
  );
}
