import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { InterviewKitPanel } from '@/components/pipeline/InterviewKitPanel';
import { useInterviewKit, useGenerateInterviewKit } from '@/hooks/useInterviewKit';
import { isPastInterview } from '@/lib/interviewKit';

export interface InterviewKitDrawerInterview {
  id: string;
  scheduled_at?: string | null;
  candidate?: { name?: string | null } | null;
  job_interview_stage?: { stage_name?: string | null } | null;
}

interface InterviewKitDrawerProps {
  interview: InterviewKitDrawerInterview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCandidate: () => void;
  hideOverlay: boolean;
  mobilePrepSwitcher?: ReactNode;
  hideCloseButton?: boolean;
}

export function InterviewKitDrawer({
  interview,
  open,
  onOpenChange,
  onOpenCandidate,
  hideOverlay,
  mobilePrepSwitcher,
  hideCloseButton,
}: InterviewKitDrawerProps) {
  const { data: kit, isLoading } = useInterviewKit(open ? interview?.id : null);
  const generateKit = useGenerateInterviewKit();
  const allowGenerate = !isPastInterview(interview?.scheduled_at);

  const handleGenerate = (forceGemini?: boolean) => {
    if (!interview?.id) return;
    generateKit.mutate({
      interview_id: interview.id,
      force_regenerate: !!forceGemini,
      force_gemini: forceGemini,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={!hideOverlay}>
      <SheetContent
        hideOverlay={hideOverlay}
        hideCloseButton={hideCloseButton}
        className="z-[51] flex h-full w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {mobilePrepSwitcher}
        <SheetHeader className="space-y-1 border-b px-6 py-5 text-left">
          <SheetTitle className="text-base font-semibold leading-snug">
            <button
              type="button"
              onClick={onOpenCandidate}
              className="text-primary hover:underline"
            >
              {interview?.candidate?.name ?? 'Unknown Candidate'}
            </button>
            {interview?.job_interview_stage?.stage_name && (
              <>
                <span className="text-muted-foreground font-normal"> — </span>
                <span className="font-medium">{interview.job_interview_stage.stage_name}</span>
              </>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <InterviewKitPanel
            kit={kit}
            isLoading={isLoading}
            isGenerating={generateKit.isPending}
            onGenerate={handleGenerate}
            allowGenerate={allowGenerate}
            defaultOpen
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
