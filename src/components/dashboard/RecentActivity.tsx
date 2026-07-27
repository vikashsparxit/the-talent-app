import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import {
  Activity,
  UserPlus,
  ClipboardCheck,
  Send,
  CheckCircle,
  Clock,
  Briefcase,
  AlertTriangle,
  Star,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'candidate_added' | 'assessment_assigned' | 'assessment_started' | 'assessment_completed' | 'assessment_evaluated' | 'assessment_expired' | 'job_application';
  title: string;
  description: string;
  actor?: string;    // who performed this action
  timestamp: string;
}

const TYPE_CONFIG: Record<ActivityItem['type'], { icon: React.ElementType; bg: string; fg: string }> = {
  candidate_added:       { icon: UserPlus,       bg: 'bg-blue-100 dark:bg-blue-900/30',     fg: 'text-blue-600 dark:text-blue-400' },
  job_application:       { icon: Briefcase,      bg: 'bg-orange-100 dark:bg-orange-900/30', fg: 'text-orange-600 dark:text-orange-400' },
  assessment_assigned:   { icon: Send,           bg: 'bg-violet-100 dark:bg-violet-900/30', fg: 'text-violet-600 dark:text-violet-400' },
  assessment_started:    { icon: Clock,          bg: 'bg-amber-100 dark:bg-amber-900/30',   fg: 'text-amber-600 dark:text-amber-400' },
  assessment_completed:  { icon: CheckCircle,    bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-600 dark:text-emerald-400' },
  assessment_evaluated:  { icon: Star,           bg: 'bg-teal-100 dark:bg-teal-900/30',     fg: 'text-teal-600 dark:text-teal-400' },
  assessment_expired:    { icon: AlertTriangle,  bg: 'bg-red-100 dark:bg-red-900/30',       fg: 'text-red-600 dark:text-red-400' },
};

export function RecentActivity() {
  const { isInterviewer } = useAuth();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['recent-activity', isInterviewer],
    staleTime: 30_000,
    queryFn: async () => {
      // Interviewers only see activity for their assigned candidates (RLS scopes queries automatically)
      const [
        { data: candidateAssessments },
        { data: recentCandidates },
        { data: recentApplications },
      ] = await Promise.all([
        supabase
          .from('candidate_assessments')
          .select('id, status, created_at, started_at, completed_at, candidate:candidates(name, email), assessment:assessments(title)')
          .order('updated_at', { ascending: false })
          .limit(20),
        supabase
          .from('candidates')
          .select('id, name, email, created_at, created_by')
          .order('created_at', { ascending: false })
          .limit(15),
        // Interviewers can't read job_applications — skip for them
        isInterviewer
          ? Promise.resolve({ data: [] })
          : supabase
              .from('job_applications')
              .select('id, applicant_name, applicant_email, created_at, job:jobs(title)')
              .order('created_at', { ascending: false })
              .limit(10),
      ]);

      // Fetch profiles for all candidate creators in one batch
      const creatorIds = [...new Set((recentCandidates || []).map((c: any) => c.created_by).filter(Boolean))];
      const profileMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', creatorIds);
        (profiles || []).forEach(p => { if (p.full_name) profileMap.set(p.user_id, p.full_name); });
      }

      const items: ActivityItem[] = [];

      recentApplications?.forEach(app => {
        const job = app.job as { title: string } | null;
        items.push({
          id: `application-${app.id}`,
          type: 'job_application',
          title: 'New Job Application',
          description: `${app.applicant_name} applied for "${job?.title || 'Unknown Position'}"`,
          timestamp: app.created_at,
        });
      });

      recentCandidates?.forEach((c: any) => {
        const actorName = c.created_by ? profileMap.get(c.created_by) : undefined;
        items.push({
          id: `candidate-${c.id}`,
          type: 'candidate_added',
          title: 'New Candidate Added',
          description: `${c.name} (${c.email})`,
          actor: actorName ? `Added by ${actorName}` : undefined,
          timestamp: c.created_at,
        });
      });

      candidateAssessments?.forEach(ca => {
        const candidate = ca.candidate as { name: string; email: string } | null;
        const assessment = ca.assessment as { title: string } | null;
        if (!candidate || !assessment) return;

        if (ca.status === 'completed' && ca.completed_at) {
          items.push({ id: `completed-${ca.id}`, type: 'assessment_completed', title: 'Assessment Completed', description: `${candidate.name} completed "${assessment.title}"`, timestamp: ca.completed_at });
        } else if (ca.status === 'in_progress' && ca.started_at) {
          items.push({ id: `started-${ca.id}`, type: 'assessment_started', title: 'Assessment Started', description: `${candidate.name} started "${assessment.title}"`, timestamp: ca.started_at });
        } else if (ca.status === 'invited') {
          items.push({ id: `invited-${ca.id}`, type: 'assessment_assigned', title: 'Assessment Assigned', description: `${candidate.name} invited to "${assessment.title}"`, timestamp: ca.created_at });
        } else if (ca.status === 'evaluated') {
          items.push({ id: `evaluated-${ca.id}`, type: 'assessment_evaluated', title: 'Assessment Evaluated', description: `${candidate.name}'s "${assessment.title}" was reviewed`, timestamp: ca.completed_at || ca.created_at });
        } else if (ca.status === 'expired') {
          items.push({ id: `expired-${ca.id}`, type: 'assessment_expired', title: 'Assessment Expired', description: `${candidate.name}'s "${assessment.title}" expired`, timestamp: ca.created_at });
        }
      });

      return items
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);
    },
  });

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <Activity className="h-4 w-4" />
          {isInterviewer ? 'My Recent Activity' : 'Recent Activity'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="space-y-4 p-6 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-28 bg-muted rounded" />
                  <div className="h-3 w-44 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <div className="p-3 rounded-full bg-muted">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="px-4 pb-4">
              {activities.map((activity, idx) => {
                const cfg = TYPE_CONFIG[activity.type];
                const IconComp = cfg.icon;
                return (
                  <div key={activity.id} className="flex items-start gap-3 py-3 relative">
                    {/* Vertical connector line */}
                    {idx < activities.length - 1 && (
                      <div className="absolute left-[15px] top-10 bottom-0 w-px bg-border/60" />
                    )}
                    <div className={`p-1.5 rounded-full shrink-0 z-10 ${cfg.bg}`}>
                      <IconComp className={`h-3.5 w-3.5 ${cfg.fg}`} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs font-semibold text-foreground">{activity.title}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{activity.description}</p>
                      <p className="text-[10px] mt-1 flex items-center gap-1.5">
                        {activity.actor && (
                          <span className="text-muted-foreground font-medium">{activity.actor}</span>
                        )}
                        {activity.actor && <span className="text-muted-foreground/40">·</span>}
                        <span className="text-muted-foreground/60">
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
