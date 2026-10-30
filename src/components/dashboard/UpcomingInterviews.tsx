import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
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
    <SectionCard
      title="Upcoming interviews"
      description={!isLoading && interviews.length > 0 ? `${interviews.length} in the next 7 days` : undefined}
      actions={
        <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-muted-foreground">
          <Link to="/calendar">See all</Link>
        </Button>
      }
      className="flex h-full flex-col"
      contentClassName="flex flex-1 flex-col"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-md" />)}
        </div>
      ) : interviews.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10">
          <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No interviews scheduled this week</p>
        </div>
      ) : (
        <div className="-mx-2 space-y-4">
          {dayKeys.map(day => (
            <div key={day}>
              <p className="px-2 pb-1 text-caption font-medium uppercase tracking-[0.04em] text-muted-foreground">
                {day}
              </p>
              <div className="space-y-0.5">
                {grouped[day].map(iv => {
                  const ModeIcon = iv.interview_mode ? MODE_ICON[iv.interview_mode] : null;
                  const time = format(parseISO(iv.scheduled_at), 'h:mm a');
                  return (
                    <div
                      key={iv.id}
                      className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors duration-instant ease-out hover:bg-accent/60"
                    >
                      <span className="w-16 shrink-0 pt-px text-sm font-medium tabular-nums text-foreground">{time}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{iv.candidate_name}</p>
                        <p className="truncate text-caption text-muted-foreground">{iv.stage_name} · {iv.job_title}</p>
                      </div>
                      {ModeIcon && (
                        <ModeIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label={iv.interview_mode?.replace('_', ' ')} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="px-2 text-center">
              <Link to="/calendar" className="text-caption font-medium text-primary-text hover:underline">
                See all {interviews.length} interviews
              </Link>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
