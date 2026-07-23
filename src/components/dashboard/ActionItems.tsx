import { useActionItems } from '@/hooks/useCandidates';
import { Link, useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Zap,
  Clock,
  Briefcase,
  ClipboardCheck,
  MessageSquareWarning,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';

const MAX_ITEMS = 4;

interface ActionRow {
  key: string;
  icon: React.ElementType;
  iconBg: string;
  iconFg: string;
  label: string;
  sub: string;
  href: string;
}

export function ActionItems() {
  const { data, isLoading } = useActionItems();
  const navigate = useNavigate();

  const rows: ActionRow[] = [];

  data?.staleCandidates.forEach((c: any) => {
    const days = Math.floor(
      (Date.now() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    rows.push({
      key: `stale-${c.id}`,
      icon: Clock,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconFg: 'text-red-600 dark:text-red-400',
      label: c.name,
      sub: `${days}d in "${c.candidate_status || 'new'}" — needs action`,
      href: `/hiring?view=list`,
    });
  });

  data?.urgentJobs.forEach((j: any) => {
    const daysLeft = Math.ceil(
      (new Date(j.application_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    rows.push({
      key: `job-${j.id}`,
      icon: Briefcase,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconFg: 'text-amber-600 dark:text-amber-400',
      label: j.title,
      sub: `Deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${format(new Date(j.application_deadline), 'dd MMM')}`,
      href: `/jobs`,
    });
  });

  data?.expiringAssessments.forEach((a: any) => {
    const candidate = a.candidate as { id: string; name: string } | null;
    rows.push({
      key: `assessment-${a.id}`,
      icon: ClipboardCheck,
      iconBg: 'bg-violet-100 dark:bg-violet-900/30',
      iconFg: 'text-violet-600 dark:text-violet-400',
      label: candidate?.name ?? 'Candidate',
      sub: `Assessment expires ${formatDistanceToNow(new Date(a.deadline), { addSuffix: true })}`,
      href: `/hiring?view=list`,
    });
  });

  data?.upcomingInterviews?.forEach((v: any) => {
    const candidate = v.candidate as { id: string; name: string } | null;
    const stage = v.stage as { stage_name: string } | null;
    rows.push({
      key: `upcoming-${v.id}`,
      icon: CalendarDays,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconFg: 'text-blue-600 dark:text-blue-400',
      label: candidate?.name ?? 'Candidate',
      sub: `${stage?.stage_name ?? 'Interview'} at ${format(new Date(v.scheduled_at), 'h:mm a')} today`,
      href: `/calendar`,
    });
  });

  data?.pendingVerdicts.forEach((v: any) => {
    const candidate = v.candidate as { id: string; name: string } | null;
    const stage = v.stage as { stage_name: string; name?: string } | null;
    rows.push({
      key: `verdict-${v.id}`,
      icon: MessageSquareWarning,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconFg: 'text-orange-600 dark:text-orange-400',
      label: candidate?.name ?? 'Candidate',
      sub: `"${stage?.stage_name ?? 'Interview'}" verdict pending since ${formatDistanceToNow(new Date(v.scheduled_at), { addSuffix: true })}`,
      href: `/hiring?view=board`,
    });
  });

  const visibleRows = rows.slice(0, MAX_ITEMS);
  const hasMore = rows.length > MAX_ITEMS;
  const isEmpty = !isLoading && rows.length === 0;

  return (
    <Card className="border-border/60 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Zap className="h-4 w-4" />
            Action Items
            {!isLoading && rows.length > 0 && (
              <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {rows.length}
              </span>
            )}
          </CardTitle>
          <Link
            to="/hiring?view=board"
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            See all →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="space-y-3 p-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 bg-muted rounded" />
                  <div className="h-2.5 w-48 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground">No pending actions right now</p>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-1">
            {visibleRows.map(row => {
              const Icon = row.icon;
              return (
                <button
                  key={row.key}
                  className="w-full flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/60 transition-colors text-left group"
                  onClick={() => navigate(row.href)}
                >
                  <div className={`p-1.5 rounded-full shrink-0 ${row.iconBg}`}>
                    <Icon className={`h-3.5 w-3.5 ${row.iconFg}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{row.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{row.sub}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
            {hasMore && (
              <div className="pt-2 text-center">
                <Link to="/hiring?view=board" className="text-xs font-medium text-primary hover:underline">
                  See all {rows.length} items →
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
