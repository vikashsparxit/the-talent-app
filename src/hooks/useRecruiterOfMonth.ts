import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useRecruiterPerformance } from '@/hooks/useRecruiterPerformance';
import {
  emptyActivityCounts,
  isFeedbackOnTime,
  rankRecruiters,
  type RecruiterActivityCounts,
  type RecruiterScore,
} from '@/lib/recruiterOfMonth';

type EligibleRole = 'recruiter' | 'hr';

interface Person {
  name: string;
  avatarUrl: string | null;
  role: EligibleRole;
}

interface MonthActivity {
  people: Map<string, Person>;
  activity: Map<string, RecruiterActivityCounts>;
}

export interface RecruiterOfMonth {
  score: RecruiterScore;
  name: string;
  avatarUrl: string | null;
  role: EligibleRole;
  runnerUpTotal: number | null;
  rankedCount: number;
}

/** Admin/HR only: reads every recruiter's activity for the current calendar month. */
export function useRecruiterOfMonth(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const monthKey = format(monthStart, 'yyyy-MM');
  const today = format(new Date(), 'yyyy-MM-dd');

  const sourcedQuery = useRecruiterPerformance(format(monthStart, 'yyyy-MM-dd'), today, { enabled });

  const activityQuery = useQuery<MonthActivity>({
    queryKey: ['recruiter-of-month', monthKey],
    enabled,
    staleTime: 300_000,
    queryFn: async () => {
      const startIso = monthStart.toISOString();

      const [rolesRes, hiresRes, advancesRes, feedbackRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, role').in('role', ['recruiter', 'hr']),
        supabase
          .from('candidates')
          .select('created_by')
          .gte('hired_at', startIso)
          .not('created_by', 'is', null),
        supabase
          .from('candidate_interviews')
          .select('advanced_by')
          .gte('advanced_at', startIso)
          .not('advanced_by', 'is', null),
        supabase
          .from('candidate_interviews')
          .select('interviewer_user_id, scheduled_at, completed_at, verdict')
          .gte('completed_at', startIso)
          .not('interviewer_user_id', 'is', null)
          .not('scheduled_at', 'is', null),
      ]);
      if (rolesRes.error) throw rolesRes.error;
      if (hiresRes.error) throw hiresRes.error;
      if (advancesRes.error) throw advancesRes.error;
      if (feedbackRes.error) throw feedbackRes.error;

      const roleByUser = new Map<string, EligibleRole>();
      for (const r of rolesRes.data ?? []) {
        if (r.role === 'recruiter' || !roleByUser.has(r.user_id)) {
          roleByUser.set(r.user_id, r.role as EligibleRole);
        }
      }

      const activity = new Map<string, RecruiterActivityCounts>();
      const bump = (userId: string | null, key: keyof RecruiterActivityCounts) => {
        if (!userId || !roleByUser.has(userId)) return;
        const counts = activity.get(userId) ?? emptyActivityCounts();
        counts[key] += 1;
        activity.set(userId, counts);
      };

      for (const c of hiresRes.data ?? []) bump(c.created_by, 'hires');
      for (const i of advancesRes.data ?? []) bump(i.advanced_by, 'advances');
      for (const i of feedbackRes.data ?? []) {
        if (i.verdict && i.verdict !== 'no_show' && i.scheduled_at && i.completed_at
          && isFeedbackOnTime(i.scheduled_at, i.completed_at)) {
          bump(i.interviewer_user_id, 'onTimeFeedback');
        }
      }

      const people = new Map<string, Person>();
      const ids = [...roleByUser.keys()];
      if (ids.length > 0) {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, avatar_url')
          .in('user_id', ids);
        if (error) throw error;
        for (const p of profiles ?? []) {
          people.set(p.user_id, {
            name: p.full_name?.trim() || p.email?.split('@')[0] || 'Unknown',
            avatarUrl: p.avatar_url ?? null,
            role: roleByUser.get(p.user_id) ?? 'recruiter',
          });
        }
      }
      return { people, activity };
    },
  });

  const data = useMemo<RecruiterOfMonth | null | undefined>(() => {
    if (!activityQuery.data || !sourcedQuery.data) return undefined;
    const { people, activity } = activityQuery.data;
    const merged = new Map([...activity].map(([id, c]) => [id, { ...c }]));
    for (const row of sourcedQuery.data) {
      if (!people.has(row.recruiter_id)) continue;
      const counts = merged.get(row.recruiter_id) ?? emptyActivityCounts();
      counts.sourced = row.sourced;
      merged.set(row.recruiter_id, counts);
    }
    const ranked = rankRecruiters(merged).filter(r => people.has(r.userId));
    const winner = ranked[0];
    if (!winner) return null;
    const person = people.get(winner.userId)!;
    return {
      score: winner,
      name: person.name,
      avatarUrl: person.avatarUrl,
      role: person.role,
      runnerUpTotal: ranked[1]?.total ?? null,
      rankedCount: ranked.length,
    };
  }, [activityQuery.data, sourcedQuery.data]);

  return {
    data,
    isLoading: activityQuery.isLoading || sourcedQuery.isLoading,
    isError: activityQuery.isError || sourcedQuery.isError,
  };
}
