import { supabase } from '@/integrations/supabase/client';

export type StaffEmailEvent = 'interview_scheduled' | 'verdict_submitted';

/** Fire-and-forget staff email fan-out (non-fatal if it fails). */
export function notifyStaffEmail(event: StaffEmailEvent, interviewId: string): void {
  void supabase.functions
    .invoke('send-staff-email', { body: { event, interview_id: interviewId } })
    .then(({ error }) => {
      if (error) console.warn('Staff email notification failed:', error.message);
    });
}
