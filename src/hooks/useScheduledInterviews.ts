import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ScheduledInterviewPanelist {
  user_id: string;
  full_name: string;
  email: string;
}

export interface ScheduledInterview {
  id: string;
  candidate_id: string;
  job_interview_stage_id: string;
  interviewer_user_id?: string;
  panelists?: ScheduledInterviewPanelist[];
  scheduled_at: string;
  interview_mode?: 'video' | 'in_person' | 'phone';
  meeting_link?: string;
  verdict?: string;
  candidate?: { id: string; name: string; email: string };
  stage?: { id: string; stage_name: string; job_id: string; job?: { id: string; title: string } };
  interviewer?: { full_name: string; email: string };
  job?: { id: string; title: string };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ScheduledInterview;
}

export interface ScheduledInterviewsOptions {
  from?: Date;
  to?: Date;
}

type RpcScheduledRow = ScheduledInterview & {
  stage?: { id: string; stage_name: string; job_id: string; job?: { id: string; title: string } };
};

function mapRpcRow(row: RpcScheduledRow): ScheduledInterview {
  const job = row.stage?.job;
  return {
    ...row,
    job: job ?? undefined,
  };
}

function rangeDaySpan(from?: Date, to?: Date): number {
  if (!from || !to) return 365;
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

export function useScheduledInterviews(options?: ScheduledInterviewsOptions, view?: string) {
  const fromIso = options?.from?.toISOString();
  const toIso = options?.to?.toISOString();
  const daySpan = rangeDaySpan(options?.from, options?.to);
  const limit = daySpan > 120 ? 600 : daySpan > 45 ? 800 : 400;

  return useQuery({
    queryKey: ['scheduled-interviews', view, fromIso, toIso],
    staleTime: 30_000,
    retry: 1,
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      if (previousQuery.queryKey[1] !== view) return undefined;
      return previousData;
    },
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_scheduled_interviews', {
        p_from: fromIso ?? null,
        p_to: toIso ?? null,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data ?? []) as RpcScheduledRow[]).map(mapRpcRow);
    },
  });
}

export function toCalendarEvents(interviews: ScheduledInterview[]): CalendarEvent[] {
  return interviews.map(iv => {
    const start = new Date(iv.scheduled_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const candidate = iv.candidate;
    const stage = iv.stage;
    const job = iv.job;
    const title = [candidate?.name, stage?.stage_name, job?.title].filter(Boolean).join(' · ');
    return { id: iv.id, title, start, end, resource: iv };
  });
}
