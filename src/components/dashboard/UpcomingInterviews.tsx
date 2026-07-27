import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, Video, Phone, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';

const MAX_ITEMS = 4;

interface UpcomingIv {
  id: string;
  candidate_name: string;
  job_title: string;
  stage_name: string;
  scheduled_at: string;
  interview_mode: string | null;
}

const MODE_ICON: Record<string, React.ElementType> = {
  video: Video,
  phone: Phone,
  in_person: MapPin,
};

function dayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

export function UpcomingInterviews() {
  const { isInterviewer, user } = useAuth();

  const { data: interviews = [], isLoading } = useQuery<UpcomingIv[]>({
    queryKey: ['upcoming-interviews', isInterviewer, user?.id],
    staleTime: 300_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      type IvRaw = {
        id: string;
        candidate_id: string;
        job_interview_stage_id: string | null;
        scheduled_at: string;
        interview_mode: string | null;
      };

      let query = supabase
        .from('candidate_interviews')
        .select('id, candidate_id, job_interview_stage_id, scheduled_at, interview_mode')
        .gte('scheduled_at', now)
        .lte('scheduled_at', in7Days)
        .order('scheduled_at')
        .limit(50);

      if (isInterviewer) {
        query = query.eq('interviewer_user_id', user!.id);
      }

      const { data: ivs } = await query;
      const rawIvs = (ivs || []) as IvRaw[];
      if (!rawIvs.length) return [];

      const candidateIds = [...new Set(rawIvs.map(iv => iv.candidate_id))];
      const stageIds = [...new Set(rawIvs.map(iv => iv.job_interview_stage_id).filter(Boolean))] as string[];

      const [{ data: candidates }, { data: stageData }] = await Promise.all([
        supabase.from('candidates').select('id, name, job_id').in('id', candidateIds),
        stageIds.length
          ? supabase.from('job_interview_stages').select('id, stage_name, job_id').in('id', stageIds)
          : Promise.resolve({ data: [] as { id: string; stage_name: string; job_id: string }[] }),
      ]);

      const candidateMap = new Map((candidates || []).map(c => [c.id, c]));
      const stageMap = new Map((stageData || []).map(s => [s.id, s]));

      const jobIds = [...new Set([
        ...(candidates || []).map(c => c.job_id).filter(Boolean),
        ...(stageData || []).map(s => s.job_id).filter(Boolean),
      ])] as string[];

      const { data: jobs } = jobIds.length
        ? await supabase.from('jobs').select('id, title').in('id', jobIds)
        : { data: [] as { id: string; title: string }[] };

      const jobMap = new Map((jobs || []).map(j => [j.id, j]));

      return rawIvs.map(iv => {
        const cand = candidateMap.get(iv.candidate_id);
        const stage = iv.job_interview_stage_id ? stageMap.get(iv.job_interview_stage_id) : null;
        const jobId = stage?.job_id || cand?.job_id;
        const job = jobId ? jobMap.get(jobId) : null;
        return {
          id: iv.id,
          candidate_name: cand?.name || 'Unknown',
          job_title: job?.title || '—',
          stage_name: stage?.stage_name || '—',
          scheduled_at: iv.scheduled_at,
          interview_mode: iv.interview_mode,
        };
      });
    },
  });

  const visibleInterviews = interviews.slice(0, MAX_ITEMS);
  const hasMore = interviews.length > MAX_ITEMS;

  const grouped = visibleInterviews.reduce<Record<string, UpcomingIv[]>>((acc, iv) => {
    const label = dayLabel(iv.scheduled_at);
    if (!acc[label]) acc[label] = [];
    acc[label].push(iv);
    return acc;
  }, {});
  const dayKeys = Object.keys(grouped);

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <CalendarDays className="h-4 w-4" />
            Upcoming Interviews
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {!isLoading && interviews.length > 0 && (
              <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {interviews.length} this week
              </span>
            )}
            <Link
              to="/calendar"
              className="text-xs font-medium text-primary hover:underline"
            >
              See all →
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 pb-4">
        {isLoading ? (
          <div className="space-y-2 px-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : interviews.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2">
            <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No interviews scheduled this week</p>
          </div>
        ) : (
          <div className="px-4 space-y-3">
            {dayKeys.map(day => (
              <div key={day}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-1">
                  {day}
                </p>
                <div className="space-y-1">
                  {grouped[day].map(iv => {
                    const ModeIcon = iv.interview_mode ? MODE_ICON[iv.interview_mode] : null;
                    const time = format(parseISO(iv.scheduled_at), 'h:mm a');
                    return (
                      <div
                        key={iv.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex flex-col items-center pt-0.5 shrink-0 w-14">
                          <span className="text-xs font-bold text-primary">{time}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{iv.candidate_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{iv.stage_name} · {iv.job_title}</p>
                        </div>
                        {ModeIcon && (
                          <ModeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="pt-1 text-center">
                <Link to="/calendar" className="text-xs font-medium text-primary hover:underline">
                  See all {interviews.length} interviews →
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
