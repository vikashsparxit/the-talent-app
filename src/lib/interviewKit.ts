import { supabase } from '@/integrations/supabase/client';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import type { InterviewKitDrawerInterview } from '@/components/pipeline/InterviewKitDrawer';

const INTERVIEW_KIT_SELECT = `
  id, candidate_id, scheduled_at,
  candidate:candidates!candidate_interviews_candidate_id_fkey(id, name, email, job_id, role_applied),
  job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name, job_id)
`;

export async function fetchInterviewForKit(interviewId: string): Promise<InterviewKitDrawerInterview | null> {
  const { data } = await supabase
    .from('candidate_interviews')
    .select(INTERVIEW_KIT_SELECT)
    .eq('id', interviewId)
    .maybeSingle();
  return data as InterviewKitDrawerInterview | null;
}

/** True when scheduled_at is in the past (matches Calendar list Join-link hiding). */
export function isPastInterview(scheduledAt: string | null | undefined): boolean {
  if (!scheduledAt) return false;
  return new Date(scheduledAt).getTime() < Date.now();
}

/** Fire-and-forget kit generation after schedule/reschedule. Failures are silent (template fallback in edge fn). */
export function triggerInterviewKitGeneration(interviewId: string): void {
  void supabase.functions
    .invoke('generate-interview-kit', {
      body: {
        interview_id: interviewId,
        force_regenerate: true,
        ...getDevGeminiKeyBody(),
      },
    })
    .catch(() => {});
}
