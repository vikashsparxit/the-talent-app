import { useCallback, useState } from 'react';
import type { InterviewKitDrawerInterview } from '@/components/pipeline/InterviewKitDrawer';
import { fetchInterviewForKit } from '@/lib/interviewKit';
import { cn } from '@/lib/utils';

interface UseInterviewKitDrawerHostOptions {
  detailOpen: boolean;
  onCloseDetail: () => void;
}

export function useInterviewKitDrawerHost({ detailOpen, onCloseDetail }: UseInterviewKitDrawerHostOptions) {
  const [kitInterview, setKitInterview] = useState<InterviewKitDrawerInterview | null>(null);
  const kitOpen = !!kitInterview;
  const drawerBackdropOpen = kitOpen || detailOpen;

  const handleViewQuestionKit = useCallback(async (interviewId: string) => {
    if (kitInterview?.id === interviewId) return;
    const data = await fetchInterviewForKit(interviewId);
    if (data) setKitInterview(data);
  }, [kitInterview?.id]);

  const closeKit = useCallback(() => setKitInterview(null), []);

  const closeAll = useCallback(() => {
    setKitInterview(null);
    onCloseDetail();
  }, [onCloseDetail]);

  return {
    kitInterview,
    kitOpen,
    drawerBackdropOpen,
    handleViewQuestionKit,
    closeKit,
    closeAll,
    interviewKitDrawerProps: {
      interview: kitInterview,
      open: kitOpen,
      onOpenChange: (open: boolean) => !open && closeKit(),
      hideOverlay: drawerBackdropOpen,
      onOpenCandidate: () => {},
    },
    candidateDrawerKitProps: {
      hideOverlay: drawerBackdropOpen,
      onViewQuestionKit: handleViewQuestionKit,
      kitVisibleInterviewId: kitOpen ? kitInterview?.id ?? null : null,
      sheetClassName: cn('sm:max-w-xl', kitOpen && detailOpen && 'z-[52] sm:right-[28rem]'),
      notesStackOffset: kitOpen ? 'right-[64rem]' : 'right-[36rem]',
    },
  };
}
