import { useActionItems } from '@/hooks/useCandidates';
import { Link, useNavigate } from 'react-router';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
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
      iconBg: 'bg-[hsl(var(--chip-danger-bg))]',
      iconFg: 'text-[hsl(var(--chip-danger-text))]',
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
      iconBg: 'bg-[hsl(var(--chip-warning-bg))]',
      iconFg: 'text-[hsl(var(--chip-warning-text))]',
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
      iconBg: 'bg-chitra-bg',
      iconFg: 'text-chitra',
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
      iconBg: 'bg-[hsl(var(--chip-neutral-bg))]',
      iconFg: 'text-[hsl(var(--chip-neutral-text))]',
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
      iconBg: 'bg-[hsl(var(--chip-warning-bg))]',
      iconFg: 'text-[hsl(var(--chip-warning-text))]',
      label: candidate?.name ?? 'Candidate',
      sub: `"${stage?.stage_name ?? 'Interview'}" verdict pending since ${formatDistanceToNow(new Date(v.scheduled_at), { addSuffix: true })}`,
      href: `/hiring?view=board`,
    });
  });

  const visibleRows = rows.slice(0, MAX_ITEMS);
  const hasMore = rows.length > MAX_ITEMS;
  const isEmpty = !isLoading && rows.length === 0;

  return (
    <SectionCard
      title="Action items"
      description={isLoading ? undefined : rows.length > 0 ? `${rows.length} need attention` : undefined}
      actions={
        <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-muted-foreground">
          <Link to="/hiring?view=board">See all</Link>
        </Button>
      }
      className="flex h-full flex-col"
      contentClassName="flex-1"
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <div className="rounded-full bg-[hsl(var(--chip-success-bg))] p-3">
            <Zap className="h-5 w-5 text-[hsl(var(--chip-success-text))]" />
          </div>
          <p className="text-sm font-medium text-foreground">All caught up</p>
          <p className="text-caption text-muted-foreground">No pending actions right now</p>
        </div>
      ) : (
        <div className="-mx-2 space-y-0.5">
          {visibleRows.map(row => {
            const Icon = row.icon;
            return (
              <button
                key={row.key}
                type="button"
                className="group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors duration-instant ease-out hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => navigate(row.href)}
              >
                <div className={`shrink-0 rounded-full p-1.5 ${row.iconBg}`}>
                  <Icon className={`h-3.5 w-3.5 ${row.iconFg}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">{row.sub}</p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity duration-fast ease-out group-hover:opacity-100" />
              </button>
            );
          })}
          {hasMore && (
            <div className="px-2 pt-2 text-center">
              <Link to="/hiring?view=board" className="text-caption font-medium text-primary-text hover:underline">
                See all {rows.length} items
              </Link>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
