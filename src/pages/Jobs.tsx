import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Search,
  MoreVertical,
  Briefcase,
  Edit,
  Trash2,
  MapPin,
  IndianRupee,
  Users,
  ExternalLink,
  Copy,
  Eye,
  Pause,
  Play,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  LayoutGrid,
  List,
  Filter,
  CalendarDays,
  Award,
  Gift,
  Crown,
  Clock,
  Workflow,
  ClipboardCheck,
  UserCheck,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useJobs } from '@/hooks/useJobs';
import { useJobHiredCandidates, fetchHiredCandidatesForJobs, type HiredCandidateSummary } from '@/hooks/useJobHiredCandidates';
import { useAuth } from '@/hooks/useAuth';
import { CandidateDetailDrawer } from '@/components/candidates/CandidateDetailDrawer';
import { openCandidateDetailWithFetch } from '@/lib/candidateDetail';
import type { Candidate } from '@/types/database';
import {
  useSystemConfig,
  parseAssessmentOrgDefaults,
} from '@/hooks/useSystemConfig';
import { useAssessments } from '@/hooks/useAssessments';
import { defaultAssessmentConfig, parseJobAssessmentConfig } from '@/hooks/useJobAssessment';
import { AssignRecruitersDialog } from '@/components/jobs/AssignRecruitersDialog';
import {
  AssignHiredCandidateDialog,
  type AssignHiredCandidateDialogState,
} from '@/components/jobs/AssignHiredCandidateDialog';
import { formatSalaryRange, SALARY_PLACEHOLDERS } from '@/lib/indianLocale';
import { cn } from '@/lib/utils';
import { format, isPast, differenceInDays } from 'date-fns';
import type { Job, JobStatus, JobType, ExperienceLevel, PositionType, ExperienceYearsRange } from '@/types/jobs';
import { jobTypeLabels, experienceLevelLabels, jobStatusLabels, experienceYearsLabels, positionTypeLabels, isActiveJobStatus } from '@/types/jobs';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PullToRefresh } from '@/components/PullToRefresh';

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  draft:  { label: 'Draft',  className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
  open:   { label: 'Open',   className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800' },
  paused: { label: 'Paused', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800' },
  closed: { label: 'Closed', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800' },
};

type JobRow = Job & { candidate_count?: number };

function ClosedJobTooltipWrap({
  closed,
  children,
  className,
}: {
  closed: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!closed) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex', className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>Job is closed</TooltipContent>
    </Tooltip>
  );
}

function ClosedDropdownItem({
  closed,
  onClick,
  children,
}: {
  closed: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (closed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block w-full">
            <DropdownMenuItem disabled className="w-full opacity-50">
              {children}
            </DropdownMenuItem>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">Job is closed</TooltipContent>
      </Tooltip>
    );
  }
  return <DropdownMenuItem onClick={onClick}>{children}</DropdownMenuItem>;
}

function HiredNamesCell({
  hired,
  onOpenCandidate,
  canManage,
  onAssignHired,
}: {
  hired: HiredCandidateSummary[];
  onOpenCandidate: (candidate: HiredCandidateSummary) => void;
  canManage?: boolean;
  onAssignHired?: () => void;
}) {
  if (hired.length === 0) {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-muted-foreground italic">No hire recorded</span>
        {canManage && onAssignHired && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onAssignHired();
            }}
          >
            Assign hired
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {hired.map((c) => (
        <button
          key={c.id}
          type="button"
          className="text-left text-xs font-medium text-primary hover:underline truncate max-w-[180px]"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCandidate(c);
          }}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

export default function Jobs() {
  usePageTitle('Jobs');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { jobs, isLoading, createJob, updateJob, deleteJob } = useJobs();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    await queryClient.invalidateQueries({ queryKey: ['jobs-iv-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['hired-candidates'] });
  };
  const { assessments } = useAssessments();
  const activeAssessments = assessments.filter((a) => a.status === 'active');
  const { isAdminOrHR, role } = useAuth();
  const { configValue: domains } = useSystemConfig('job_domains');
  const { configValue: teams } = useSystemConfig('job_teams');
  const { configValue: orgDefaultsRaw } = useSystemConfig('assessment_org_defaults');
  const orgDefaults = parseAssessmentOrgDefaults(orgDefaultsRaw);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
  const [jobListTab, setJobListTab] = useState<'active' | 'completed'>('active');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterPositionType, setFilterPositionType] = useState<string>('all');
  const [filterExperience, setFilterExperience] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailJob, setDetailJob] = useState<JobRow | null>(null);
  const [closeJobDialog, setCloseJobDialog] = useState<{ job: JobRow; positionsFilled: number } | null>(null);
  const [detailJobRecruiters, setDetailJobRecruiters] = useState<{ name: string; email: string; is_primary: boolean }[]>([]);
  const [recruiterDialog, setRecruiterDialog] = useState<{ open: boolean; jobId: string; jobTitle: string }>({ open: false, jobId: '', jobTitle: '' });
  const [hiredDialog, setHiredDialog] = useState<AssignHiredCandidateDialogState | null>(null);
  const [jobRecruitersMap, setJobRecruitersMap] = useState<Map<string, { name: string; is_primary: boolean }[]>>(new Map());

  // Fetch all recruiters for all jobs once jobs list loads
  useEffect(() => {
    if (!jobs.length) return;
    (async () => {
      const jobIds = jobs.map(j => j.id);
      const { data: assignments } = await supabase
        .from('job_recruiters')
        .select('job_id, recruiter_user_id, is_primary')
        .in('job_id', jobIds);
      if (!assignments?.length) return;
      const uids = [...new Set(assignments.map((a: any) => a.recruiter_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', uids);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const map = new Map<string, { name: string; is_primary: boolean }[]>();
      (assignments as any[]).forEach((a: any) => {
        const p = profileMap.get(a.recruiter_user_id);
        const n = (p?.full_name || '').trim();
        const name = n && !n.includes('@') ? n : (p?.email?.split('@')[0] || '—');
        const list = map.get(a.job_id) || [];
        list.push({ name, is_primary: a.is_primary ?? false });
        map.set(a.job_id, list);
      });
      setJobRecruitersMap(map);
    })();
  }, [jobs.length]);

  useEffect(() => {
    if (!detailJob) { setDetailJobRecruiters([]); return; }
    (async () => {
      const { data: assignments } = await supabase
        .from('job_recruiters')
        .select('recruiter_user_id, is_primary')
        .eq('job_id', detailJob.id)
        .order('created_at' as any);
      if (!assignments?.length) { setDetailJobRecruiters([]); return; }
      const ids = (assignments as any[]).map((a: any) => a.recruiter_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      setDetailJobRecruiters(
        (assignments as any[]).map((a: any) => {
          const p = profileMap.get(a.recruiter_user_id);
          const name = (p?.full_name || '').trim();
          return {
            name: name && !name.includes('@') ? name : (p?.email?.split('@')[0] || '—'),
            email: p?.email || '—',
            is_primary: a.is_primary ?? false,
          };
        })
      );
    })();
  }, [detailJob?.id]);

  // Per-job pipeline stats: scheduled interviews + pending feedback
  const { data: ivStats = {} } = useQuery<Record<string, { scheduled: number; pendingFeedback: number }>>({
    queryKey: ['jobs-iv-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('candidate_interviews')
        .select('scheduled_at, verdict, job_interview_stages!inner(job_id)');
      const map: Record<string, { scheduled: number; pendingFeedback: number }> = {};
      for (const iv of data ?? []) {
        const jobId = (iv.job_interview_stages as any)?.job_id;
        if (!jobId) continue;
        if (!map[jobId]) map[jobId] = { scheduled: 0, pendingFeedback: 0 };
        if (iv.scheduled_at) {
          map[jobId].scheduled++;
          if (!iv.verdict) map[jobId].pendingFeedback++;
        }
      }
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });

  const canManageJobs = isAdminOrHR;

  const activeJobs = useMemo(() => jobs.filter((j) => isActiveJobStatus(j.status)), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'closed'), [jobs]);
  const closedJobIds = useMemo(() => completedJobs.map((j) => j.id), [completedJobs]);
  const { data: hiredByJob = new Map<string, HiredCandidateSummary[]>() } = useJobHiredCandidates(closedJobIds);

  const domainList: string[] = Array.isArray(domains) ? domains : [];
  const teamList: string[] = Array.isArray(teams) ? teams : [];

  const jobAssessmentDefaults = (): ReturnType<typeof defaultAssessmentConfig> =>
    defaultAssessmentConfig(orgDefaults);

  const [form, setForm] = useState({
    title: '',
    description: '',
    domain: '',
    department: '', // Team
    location: '',
    job_type: 'full_time' as JobType,
    experience_level: '' as ExperienceLevel | '',
    experience_years_range: '' as ExperienceYearsRange | '',
    position_type: 'tech' as PositionType,
    total_openings: '1',
    salary_min: '',
    salary_max: '',
    required_skills: '',
    benefits: '',
    application_deadline: '',
    require_digital_application_form: true,
    assessment_enabled: false,
    default_assessment_id: '' as string,
    assessment_config: jobAssessmentDefaults(),
  });

  // Derive unique values for filter dropdowns
  const uniqueDomains = [...new Set(jobs.map(j => (j as any).domain).filter(Boolean))] as string[];
  const uniqueTeams = [...new Set(jobs.map(j => j.department).filter(Boolean))] as string[];

  const tabJobs = jobListTab === 'active' ? activeJobs : completedJobs;

  const filteredJobs = tabJobs.filter(j => {
    const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.domain?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = jobListTab !== 'active' || filterStatus === 'all' || j.status === filterStatus;
    const matchesDomain = filterDomain === 'all' || j.domain === filterDomain;
    const matchesTeam = filterTeam === 'all' || j.department === filterTeam;
    const matchesPositionType = filterPositionType === 'all' || j.position_type === filterPositionType;
    const matchesExperience = filterExperience === 'all' || j.experience_years_range === filterExperience;
    return matchesSearch && matchesStatus && matchesDomain && matchesTeam && matchesPositionType && matchesExperience;
  });

  const activeFilterCount = [
    jobListTab === 'active' ? filterStatus : 'all',
    filterDomain,
    filterTeam,
    filterPositionType,
    filterExperience,
  ].filter(f => f !== 'all').length;

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterDomain('all');
    setFilterTeam('all');
    setFilterPositionType('all');
    setFilterExperience('all');
  };

  const openCreate = () => {
    setSelectedJob(null);
    setForm({
      title: '',
      description: '',
      domain: '',
      department: '',
      location: '',
      job_type: 'full_time',
      experience_level: '',
      experience_years_range: '',
      position_type: 'tech',
      total_openings: '1',
      salary_min: '',
      salary_max: '',
      required_skills: '',
      benefits: '',
      application_deadline: '',
      require_digital_application_form: true,
      assessment_enabled: false,
      default_assessment_id: '',
      assessment_config: jobAssessmentDefaults(),
    });
    setIsFormOpen(true);
  };

  const openEdit = (job: Job) => {
    setSelectedJob(job);
    const config = parseJobAssessmentConfig((job as Job).assessment_config, orgDefaults);
    setForm({
      title: job.title,
      description: job.description || '',
      domain: (job as any).domain || '',
      department: job.department || '',
      location: job.location || '',
      job_type: job.job_type,
      experience_level: job.experience_level || '',
      experience_years_range: (job as any).experience_years_range || '',
      position_type: (job as any).position_type || 'tech',
      total_openings: ((job as any).total_openings || 1).toString(),
      salary_min: job.salary_min?.toString() || '',
      salary_max: job.salary_max?.toString() || '',
      required_skills: job.required_skills?.join(', ') || '',
      benefits: job.benefits?.join(', ') || '',
      application_deadline: job.application_deadline?.split('T')[0] || '',
      require_digital_application_form: job.require_digital_application_form !== false,
      assessment_enabled: job.assessment_enabled === true,
      default_assessment_id: job.default_assessment_id || '',
      assessment_config: config,
    });
    setIsFormOpen(true);
  };


  const handleSubmit = async () => {
    if (!form.title.trim()) return;

    const jobData: any = {
      title: form.title,
      description: form.description || undefined,
      domain: form.domain || undefined,
      department: form.department || undefined,
      location: form.location || undefined,
      job_type: form.job_type,
      experience_level: form.experience_level || undefined,
      experience_years_range: form.experience_years_range || undefined,
      position_type: form.position_type,
      total_openings: form.total_openings ? parseInt(form.total_openings) : 1,
      salary_min: form.salary_min ? parseFloat(form.salary_min) : undefined,
      salary_max: form.salary_max ? parseFloat(form.salary_max) : undefined,
      required_skills: form.required_skills.split(',').map(s => s.trim()).filter(Boolean),
      benefits: form.benefits.split(',').map(s => s.trim()).filter(Boolean),
      application_deadline: form.application_deadline ? new Date(form.application_deadline).toISOString() : undefined,
      require_digital_application_form: form.require_digital_application_form,
      assessment_enabled: form.assessment_enabled,
      default_assessment_id: form.default_assessment_id || null,
      assessment_config: form.assessment_config,
    };

    if (selectedJob) {
      await updateJob.mutateAsync({ id: selectedJob.id, ...jobData });
    } else {
      await createJob.mutateAsync(jobData);
    }
    setIsFormOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this job posting? Applications will also be deleted.')) {
      await deleteJob.mutateAsync(id);
    }
  };

  const handleStatusChange = async (job: JobRow, newStatus: JobStatus) => {
    if (newStatus === 'closed') {
      const map = await fetchHiredCandidatesForJobs([job.id]);
      const hiredCount = map.get(job.id)?.length ?? 0;
      setCloseJobDialog({ job, positionsFilled: hiredCount });
      return;
    }
    if (newStatus === 'open' && job.status === 'closed') {
      await updateJob.mutateAsync({ id: job.id, status: 'open', positions_filled: 0 });
      if (detailJob?.id === job.id) {
        setDetailJob({ ...detailJob, status: 'open', positions_filled: 0 });
      }
      return;
    }
    await updateJob.mutateAsync({ id: job.id, status: newStatus });
  };

  const openHiredCandidate = (summary: HiredCandidateSummary) => {
    const stub = {
      id: summary.id,
      name: summary.name,
      email: summary.email,
      hired_at: summary.hired_at,
    } as Candidate;
    void openCandidateDetailWithFetch(stub, setDetailCandidate);
  };

  const openAssignHiredDialog = (
    job: JobRow,
    mode: 'add' | 'change',
    replaceCandidate?: HiredCandidateSummary,
  ) => {
    const currentHired = hiredByJob.get(job.id) ?? [];
    setHiredDialog({
      jobId: job.id,
      jobTitle: job.title,
      mode,
      replaceCandidate,
      currentHiredIds: currentHired.map((c) => c.id),
    });
  };

  const handleHiredAssignmentSuccess = (positionsFilled: number) => {
    if (detailJob && hiredDialog && detailJob.id === hiredDialog.jobId) {
      setDetailJob({ ...detailJob, positions_filled: positionsFilled });
    }
  };

  const handleConfirmClose = async () => {
    if (!closeJobDialog) return;
    await updateJob.mutateAsync({
      id: closeJobDialog.job.id,
      status: 'closed',
      positions_filled: closeJobDialog.positionsFilled,
    });
    setCloseJobDialog(null);
    if (detailJob?.id === closeJobDialog.job.id) setDetailJob(null);
  };

  const copyPublicLink = (jobId: string) => {
    const link = `${window.location.origin}/careers/${jobId}`;
    navigator.clipboard.writeText(link);
    toast({ title: 'Link copied to clipboard' });
  };

  // Returns urgency level for deadline colouring
  type DeadlineUrgency = 'passed' | 'critical' | 'urgent' | 'warning' | 'normal' | 'none';
  const deadlineUrgency = (deadline?: string | null): DeadlineUrgency => {
    if (!deadline) return 'none';
    const d = new Date(deadline);
    if (isPast(d)) return 'passed';
    const days = differenceInDays(d, new Date());
    if (days <= 5)  return 'critical';
    if (days <= 10) return 'urgent';
    if (days <= 20) return 'warning';
    return 'normal';
  };
  const deadlineClasses: Record<DeadlineUrgency, string> = {
    passed:   'text-red-600 font-semibold line-through',
    critical: 'text-red-600 font-semibold',
    urgent:   'text-orange-600 font-semibold',
    warning:  'text-yellow-600 font-medium',
    normal:   'text-muted-foreground',
    none:     'text-muted-foreground',
  };
  const deadlineBadge: Partial<Record<DeadlineUrgency, string>> = {
    passed:   '🔴 Expired',
    critical: '🔴 ≤5 days',
    urgent:   '🟠 ≤10 days',
    warning:  '🟡 ≤20 days',
  };

  const isPending = createJob.isPending || updateJob.isPending;
  const tableHeadSticky = 'sticky top-0 z-10 bg-background shadow-sm';

  const renderJobFilters = (stacked = false) => (
    <>
      {jobListTab === 'active' && (
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className={cn('h-9', stacked ? 'w-full' : 'w-[140px]')}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(jobStatusLabels)
              .filter(([val]) => isActiveJobStatus(val as JobStatus))
              .map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}

      {uniqueDomains.length > 0 && (
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className={cn('h-9', stacked ? 'w-full' : 'w-[150px]')}>
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {uniqueDomains.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {uniqueTeams.length > 0 && (
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className={cn('h-9', stacked ? 'w-full' : 'w-[150px]')}>
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {uniqueTeams.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filterPositionType} onValueChange={setFilterPositionType}>
        <SelectTrigger className={cn('h-9', stacked ? 'w-full' : 'w-[140px]')}>
          <SelectValue placeholder="Position" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {Object.entries(positionTypeLabels).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filterExperience} onValueChange={setFilterExperience}>
        <SelectTrigger className={cn('h-9', stacked ? 'w-full' : 'w-[160px]')}>
          <SelectValue placeholder="Experience" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Experience</SelectItem>
          {Object.entries(experienceYearsLabels).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className={cn('h-9 text-muted-foreground', stacked && 'col-span-2')}
        >
          Clear filters ({activeFilterCount})
        </Button>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <PullToRefresh onRefresh={handleRefresh}>
      <main className="container mx-auto px-4 py-4 md:py-8 pb-safe">
        <div className="flex items-start justify-between gap-3 mb-4 md:mb-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Jobs</h1>
            <p className="text-sm text-muted-foreground mt-0.5 md:mt-1 hidden sm:block">
              Create and manage job postings
            </p>
          </div>

          <div className="flex gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 md:hidden"
              onClick={() => navigate('/careers')}
              aria-label="View public careers page"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            {canManageJobs && (
              <Button size="icon" className="h-9 w-9 md:hidden" onClick={openCreate} aria-label="New job">
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <div className="hidden md:flex gap-2">
              <Button variant="outline" onClick={() => navigate('/careers')} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                View Public Page
              </Button>
              {canManageJobs && (
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Job
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 md:mb-6 flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              className="pl-10 h-9 md:h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex border rounded-md shrink-0">
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={activeFilterCount > 0 ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5 shrink-0 h-9 md:hidden"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-background/20 px-1.5 text-xs">{activeFilterCount}</span>
            )}
          </Button>
        </div>

        <div className="hidden md:flex mb-6 flex-wrap items-center gap-3">
          {renderJobFilters()}
        </div>

        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetContent side="bottom" className="rounded-t-xl pb-safe">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              {renderJobFilters(true)}
            </div>
          </SheetContent>
        </Sheet>

        <Tabs
          value={jobListTab}
          onValueChange={(v) => {
            setJobListTab(v as 'active' | 'completed');
            if (v === 'completed') setFilterStatus('all');
          }}
          className="mb-4 md:mb-6"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="active" className="gap-2">
              Active
              <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
                {activeJobs.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              Completed
              <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
                {completedJobs.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {jobListTab === 'completed' ? 'No completed jobs' : 'No job postings yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {jobListTab === 'completed'
                  ? 'Closed jobs will appear here with their hired candidates.'
                  : activeFilterCount > 0 || searchQuery
                    ? 'No jobs match your filters.'
                    : 'Create your first job posting to start receiving applications.'}
              </p>
              {jobListTab === 'active' && canManageJobs && activeFilterCount === 0 && !searchQuery && (
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Job Posting
                </Button>
              )}
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <Table unwrapped>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn('min-w-[160px]', tableHeadSticky)}>Job</TableHead>
                  <TableHead className={cn('min-w-[100px]', tableHeadSticky)}>Status</TableHead>
                  <TableHead className={cn('min-w-[100px]', tableHeadSticky)}>Domain</TableHead>
                  <TableHead className={cn('min-w-[100px]', tableHeadSticky)}>Team</TableHead>
                  <TableHead className={cn('min-w-[120px]', tableHeadSticky)}>Position Type</TableHead>
                  <TableHead className={cn('min-w-[110px]', tableHeadSticky)}>Experience</TableHead>
                  <TableHead className={cn('text-center min-w-[80px]', tableHeadSticky)}>Openings</TableHead>
                  <TableHead className={cn('min-w-[150px]', tableHeadSticky)}>
                    {jobListTab === 'completed' ? 'Hired' : 'Candidates & Pipeline'}
                  </TableHead>
                  <TableHead className={cn('min-w-[130px]', tableHeadSticky)}>Salary (Min–Max)</TableHead>
                  <TableHead className={cn('min-w-[120px]', tableHeadSticky)}>Recruiters</TableHead>
                  <TableHead className={cn('min-w-[140px]', tableHeadSticky)}>Application Deadline</TableHead>
                  <TableHead className={cn('w-10', tableHeadSticky)}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map(job => {
                  const config = statusConfig[job.status];
                  const urgency = deadlineUrgency(job.application_deadline);
                  const recruiters = jobRecruitersMap.get(job.id) || [];
                  const isClosed = job.status === 'closed';
                  const hired = hiredByJob.get(job.id) ?? [];
                  return (
                    <TableRow key={job.id} className="group cursor-pointer" onClick={() => setDetailJob(job)}>
                      <TableCell className="font-medium max-w-[200px]">
                        <div className="truncate">{job.title}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge className={cn("text-xs border", config.className)}>{config.label}</Badge>
                          {(urgency === 'passed' || urgency === 'critical') && job.status === 'open' && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{(job as any).domain || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{job.department || '—'}</TableCell>
                      <TableCell>
                        {(job as any).position_type
                          ? positionTypeLabels[(job as any).position_type as PositionType] || (job as any).position_type
                          : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(job as any).experience_years_range
                          ? experienceYearsLabels[(job as any).experience_years_range as ExperienceYearsRange] || (job as any).experience_years_range
                          : job.experience_level
                            ? experienceLevelLabels[job.experience_level]
                            : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {isClosed && job.positions_filled != null
                          ? <span className="font-medium">{job.positions_filled}<span className="text-muted-foreground font-normal">/{job.total_openings || 1}</span></span>
                          : job.total_openings || 1}
                      </TableCell>
                      <TableCell>
                        {jobListTab === 'completed' ? (
                          <HiredNamesCell
                            hired={hired}
                            onOpenCandidate={openHiredCandidate}
                            canManage={canManageJobs && isClosed}
                            onAssignHired={() => openAssignHiredDialog(job, 'add')}
                          />
                        ) : (
                          <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1 font-medium text-foreground" title="Total candidates">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              {job.candidate_count ?? 0}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground" title="Scheduled interviews">
                              <CalendarDays className="h-3 w-3" />
                              {ivStats[job.id]?.scheduled ?? 0}
                            </span>
                            {(ivStats[job.id]?.pendingFeedback ?? 0) > 0 && (
                              <span className="flex items-center gap-1 text-orange-600 font-medium" title="Pending feedback">
                                <Clock className="h-3 w-3" />
                                {ivStats[job.id].pendingFeedback}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(job.salary_min || job.salary_max)
                          ? formatSalaryRange(job.salary_min, job.salary_max)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {recruiters.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {recruiters.map((r, i) => (
                              <span key={i} className="flex items-center gap-1 text-xs">
                                {r.is_primary && <Crown className="h-2.5 w-2.5 text-amber-500 fill-amber-400 shrink-0" />}
                                <span className={r.is_primary ? 'font-medium' : 'text-muted-foreground'}>{r.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.application_deadline ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={job.status === 'open' ? deadlineClasses[urgency] : 'text-muted-foreground'}>
                              {format(new Date(job.application_deadline), 'dd MMM yyyy')}
                            </span>
                            {deadlineBadge[urgency] && job.status === 'open' && (
                              <span className="text-[10px] leading-none">{deadlineBadge[urgency]}</span>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <ClosedDropdownItem
                                closed={isClosed}
                                onClick={() => navigate(`/hiring?view=list&job=${job.id}`)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Candidates
                              </ClosedDropdownItem>
                              {canManageJobs && (
                                <DropdownMenuItem onClick={() => openEdit(job)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              <ClosedDropdownItem
                                closed={isClosed}
                                onClick={() => copyPublicLink(job.id)}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Public Link
                              </ClosedDropdownItem>
                              {canManageJobs && (
                                <ClosedDropdownItem
                                  closed={isClosed}
                                  onClick={() => setRecruiterDialog({ open: true, jobId: job.id, jobTitle: job.title })}
                                >
                                  <Users className="h-4 w-4 mr-2" />
                                  Assign Recruiters
                                </ClosedDropdownItem>
                              )}
                              <DropdownMenuSeparator />
                              {canManageJobs && job.status === 'draft' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(job, 'open')}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Publish
                                </DropdownMenuItem>
                              )}
                              {canManageJobs && job.status === 'open' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(job, 'paused')}>
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause
                                </DropdownMenuItem>
                              )}
                              {canManageJobs && job.status === 'paused' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(job, 'open')}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Resume
                                </DropdownMenuItem>
                              )}
                              {canManageJobs && job.status !== 'closed' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(job, 'closed')}>
                                  <Archive className="h-4 w-4 mr-2" />
                                  Close
                                </DropdownMenuItem>
                              )}
                              {canManageJobs && job.status === 'closed' && (
                                <DropdownMenuItem onClick={() => handleStatusChange(job, 'open')}>
                                  <ArchiveRestore className="h-4 w-4 mr-2" />
                                  Re-open
                                </DropdownMenuItem>
                              )}
                              {canManageJobs && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => handleDelete(job.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
            {filteredJobs.map(job => {
              const config = statusConfig[job.status];
              const urgency = deadlineUrgency(job.application_deadline);
              const isClosed = job.status === 'closed';
              const hired = hiredByJob.get(job.id) ?? [];
              return (
                <Card
                  key={job.id}
                  className="group min-w-0 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setDetailJob(job)}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2 min-w-0">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{job.title}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-xs border", config.className)}>{config.label}</Badge>
                        <Badge variant="outline">{jobTypeLabels[job.job_type]}</Badge>
                        {(job as any).position_type && (
                          <Badge variant="outline" className="text-xs">
                            {positionTypeLabels[(job as any).position_type as PositionType] || (job as any).position_type}
                          </Badge>
                        )}
                        {deadlineBadge[urgency] && job.status === 'open' && (
                          <Badge variant={urgency === 'passed' || urgency === 'critical' ? 'destructive' : 'outline'}
                            className={`text-xs gap-1 ${urgency === 'warning' ? 'border-yellow-400 text-yellow-700' : urgency === 'urgent' ? 'border-orange-400 text-orange-700' : ''}`}>
                            <AlertTriangle className="h-3 w-3" />
                            {deadlineBadge[urgency]}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <ClosedDropdownItem
                          closed={isClosed}
                          onClick={() => navigate(`/hiring?view=list&job=${job.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Candidates
                        </ClosedDropdownItem>
                        {canManageJobs && (
                          <DropdownMenuItem onClick={() => openEdit(job)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <ClosedDropdownItem
                          closed={isClosed}
                          onClick={() => copyPublicLink(job.id)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Public Link
                        </ClosedDropdownItem>
                        {canManageJobs && (
                          <ClosedDropdownItem
                            closed={isClosed}
                            onClick={() => setRecruiterDialog({ open: true, jobId: job.id, jobTitle: job.title })}
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Assign Recruiters
                          </ClosedDropdownItem>
                        )}
                        <DropdownMenuSeparator />
                        {canManageJobs && job.status === 'draft' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job, 'open')}>
                            <Play className="h-4 w-4 mr-2" />
                            Publish
                          </DropdownMenuItem>
                        )}
                        {canManageJobs && job.status === 'open' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job, 'paused')}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </DropdownMenuItem>
                        )}
                        {canManageJobs && job.status === 'paused' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job, 'open')}>
                            <Play className="h-4 w-4 mr-2" />
                            Resume
                          </DropdownMenuItem>
                        )}
                        {canManageJobs && job.status !== 'closed' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job, 'closed')}>
                            <Archive className="h-4 w-4 mr-2" />
                            Close
                          </DropdownMenuItem>
                        )}
                        {canManageJobs && job.status === 'closed' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job, 'open')}>
                            <ArchiveRestore className="h-4 w-4 mr-2" />
                            Re-open
                          </DropdownMenuItem>
                        )}
                        {canManageJobs && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(job.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    {job.description && (
                      <CardDescription className="line-clamp-2 mb-4">
                        {job.description}
                      </CardDescription>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                      {jobListTab === 'completed' ? (
                        hired.length > 0 ? (
                          <span className="flex items-center gap-1 font-medium text-primary">
                            <Award className="h-4 w-4 shrink-0" />
                            Hired:{' '}
                            {hired.map((c, i) => (
                              <span key={c.id}>
                                {i > 0 && ', '}
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openHiredCandidate(c);
                                  }}
                                >
                                  {c.name}
                                </button>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs italic">No hire recorded</span>
                        )
                      ) : (
                        <>
                          <span className="flex items-center gap-1 font-medium text-primary" title="Total candidates">
                            <Users className="h-4 w-4 shrink-0" />
                            {job.candidate_count || 0} candidate{job.candidate_count !== 1 ? 's' : ''}
                            {(job.total_openings ?? 0) > 1 && (
                              <span className="text-muted-foreground font-normal text-xs">/ {job.total_openings}</span>
                            )}
                          </span>
                          {(ivStats[job.id]?.scheduled ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Scheduled interviews">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              {ivStats[job.id].scheduled} scheduled
                            </span>
                          )}
                          {(ivStats[job.id]?.pendingFeedback ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-xs font-medium text-orange-600" title="Interviews pending feedback">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {ivStats[job.id].pendingFeedback} pending
                            </span>
                          )}
                        </>
                      )}
                      {(job as any).domain && (
                        <div className="flex items-center gap-1 min-w-0 max-w-full">
                          <Briefcase className="h-4 w-4 shrink-0" />
                          <span className="truncate">{(job as any).domain}</span>
                        </div>
                      )}
                      {job.department && (
                        <div className="flex items-center gap-1 text-xs min-w-0 max-w-full">
                          <span className="truncate">{job.department}</span>
                        </div>
                      )}
                      {job.location && (
                        <div className="flex items-center gap-1 min-w-0 max-w-full">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{job.location}</span>
                        </div>
                      )}
                      {(job.salary_min || job.salary_max) && (
                        <div className="flex items-center gap-1 min-w-0 max-w-full">
                          <IndianRupee className="h-4 w-4 shrink-0" />
                          <span className="truncate">{formatSalaryRange(job.salary_min, job.salary_max)}</span>
                        </div>
                      )}
                    </div>
                    {job.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {job.required_skills.slice(0, 3).map(skill => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {job.required_skills.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{job.required_skills.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Job Detail Sheet */}
        <Sheet open={!!detailJob} onOpenChange={(open) => !open && setDetailJob(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            {detailJob && (() => {
              const cfg = statusConfig[detailJob.status];
              const urgency = deadlineUrgency(detailJob.application_deadline);
              const isClosed = detailJob.status === 'closed';
              const detailHired = hiredByJob.get(detailJob.id) ?? [];
              return (
                <>
                  <SheetHeader className="pb-4">
                    <SheetTitle className="text-xl pr-8">{detailJob.title}</SheetTitle>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge className={cn("text-xs border", cfg.className)}>{cfg.label}</Badge>
                      <Badge variant="outline">{jobTypeLabels[detailJob.job_type]}</Badge>
                      {(detailJob as any).position_type && (
                        <Badge variant="outline">{positionTypeLabels[(detailJob as any).position_type as PositionType] || (detailJob as any).position_type}</Badge>
                      )}
                      {deadlineBadge[urgency] && detailJob.status === 'open' && (
                        <Badge variant={urgency === 'passed' || urgency === 'critical' ? 'destructive' : 'outline'}
                          className={`gap-1 ${urgency === 'warning' ? 'border-yellow-400 text-yellow-700' : urgency === 'urgent' ? 'border-orange-400 text-orange-700' : ''}`}>
                          <AlertTriangle className="h-3 w-3" />
                          {deadlineBadge[urgency]}
                        </Badge>
                      )}
                    </div>
                  </SheetHeader>

                  {/* Key details grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
                    {detailJob.location && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Location</p>
                          <p className="font-medium">{detailJob.location}</p>
                        </div>
                      </div>
                    )}
                    {(detailJob as any).domain && (
                      <div className="flex items-start gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Domain</p>
                          <p className="font-medium">{(detailJob as any).domain}</p>
                        </div>
                      </div>
                    )}
                    {detailJob.department && (
                      <div className="flex items-start gap-2">
                        <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Team</p>
                          <p className="font-medium">{detailJob.department}</p>
                        </div>
                      </div>
                    )}
                    {((detailJob as any).experience_years_range || detailJob.experience_level) && (
                      <div className="flex items-start gap-2">
                        <Award className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Experience</p>
                          <p className="font-medium">
                            {(detailJob as any).experience_years_range
                              ? experienceYearsLabels[(detailJob as any).experience_years_range as ExperienceYearsRange] || (detailJob as any).experience_years_range
                              : experienceLevelLabels[detailJob.experience_level!]}
                          </p>
                        </div>
                      </div>
                    )}
                    {(detailJob as any).total_openings && (
                      <div className="flex items-start gap-2">
                        <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Openings</p>
                          <p className="font-medium">{(detailJob as any).total_openings}</p>
                        </div>
                      </div>
                    )}
                    {(detailJob.salary_min || detailJob.salary_max) && (
                      <div className="flex items-start gap-2">
                        <IndianRupee className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Salary (Annual)</p>
                          <p className="font-medium">{formatSalaryRange(detailJob.salary_min, detailJob.salary_max)}</p>
                        </div>
                      </div>
                    )}
                    {detailJob.application_deadline && (
                      <div className="flex items-start gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground text-xs">Application Deadline</p>
                          <p className={`font-medium ${detailJob.status === 'open' ? deadlineClasses[urgency] : 'text-muted-foreground'}`}>
                            {format(new Date(detailJob.application_deadline), 'dd MMM yyyy')}
                            {deadlineBadge[urgency] && detailJob.status === 'open' && <span className="ml-2 text-xs font-normal">{deadlineBadge[urgency]}</span>}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator className="my-4" />

                  {/* Job Description */}
                  {detailJob.description && (
                    <>
                      <div className="mb-5">
                        <h3 className="text-sm font-semibold mb-2">Job Description</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {detailJob.description}
                        </p>
                      </div>
                      <Separator className="my-4" />
                    </>
                  )}

                  {/* Required Skills */}
                  {detailJob.required_skills?.length > 0 && (
                    <>
                      <div className="mb-5">
                        <h3 className="text-sm font-semibold mb-2">Required Skills</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {detailJob.required_skills.map(skill => (
                            <Badge key={skill} variant="secondary">{skill}</Badge>
                          ))}
                        </div>
                      </div>
                      <Separator className="my-4" />
                    </>
                  )}

                  {/* Benefits */}
                  {detailJob.benefits?.length > 0 && (
                    <>
                      <div className="mb-5">
                        <h3 className="text-sm font-semibold mb-2">Benefits</h3>
                        <div className="flex flex-wrap gap-2">
                          {detailJob.benefits.map(b => (
                            <div key={b} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
                              {b}
                            </div>
                          ))}
                        </div>
                      </div>
                      <Separator className="my-4" />
                    </>
                  )}

                  {/* Assigned Recruiters */}
                  {detailJobRecruiters.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div className="mb-5">
                        <h3 className="text-sm font-semibold mb-2">Assigned Recruiters</h3>
                        <div className="flex flex-wrap gap-2">
                          {detailJobRecruiters.map((r, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className={`gap-1 ${r.is_primary ? 'bg-amber-500/10 text-amber-700 border-amber-300' : ''}`}
                            >
                              {r.is_primary
                                ? <Crown className="h-3 w-3 fill-amber-400 text-amber-500" />
                                : <Users className="h-3 w-3" />}
                              {r.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {(isClosed || detailHired.length > 0) && (
                    <>
                      <Separator className="my-4" />
                      <div className="mb-5">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="text-sm font-semibold">Hired candidates</h3>
                          {canManageJobs && isClosed && detailHired.length < (detailJob.total_openings || 1) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5"
                              onClick={() => openAssignHiredDialog(detailJob, 'add')}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Assign hired
                            </Button>
                          )}
                        </div>
                        {detailHired.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No hire recorded</p>
                        ) : (
                          <div className="space-y-2">
                            {detailHired.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-start gap-2 rounded-lg border p-3"
                              >
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left hover:opacity-80 transition-opacity"
                                  onClick={() => openHiredCandidate(c)}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-primary truncate">{c.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                                  </div>
                                  {c.hired_at && (
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {format(new Date(c.hired_at), 'dd MMM yyyy')}
                                    </span>
                                  )}
                                </button>
                                {canManageJobs && isClosed && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 shrink-0 text-xs"
                                    onClick={() => openAssignHiredDialog(detailJob, 'change', c)}
                                  >
                                    Change
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <ClosedJobTooltipWrap closed={isClosed}>
                      <Button
                        disabled={isClosed}
                        onClick={() => { navigate(`/hiring?view=list&job=${detailJob.id}`); setDetailJob(null); }}
                        className="gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View Candidates ({detailJob.candidate_count || 0})
                      </Button>
                    </ClosedJobTooltipWrap>
                    <ClosedJobTooltipWrap closed={isClosed}>
                      <Button
                        variant="outline"
                        disabled={isClosed}
                        onClick={() => { navigate(`/hiring?view=board&job=${detailJob.id}`); setDetailJob(null); }}
                        className="gap-2"
                      >
                        <Workflow className="h-4 w-4" />
                        View Pipeline
                      </Button>
                    </ClosedJobTooltipWrap>
                    {canManageJobs && (
                      <Button variant="outline" onClick={() => { openEdit(detailJob); setDetailJob(null); }} className="gap-2">
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    <ClosedJobTooltipWrap closed={isClosed}>
                      <Button
                        variant="outline"
                        disabled={isClosed}
                        onClick={() => copyPublicLink(detailJob.id)}
                        className="gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        Copy Link
                      </Button>
                    </ClosedJobTooltipWrap>
                    {canManageJobs && (
                      <ClosedJobTooltipWrap closed={isClosed}>
                        <Button
                          variant="outline"
                          disabled={isClosed}
                          onClick={() => { setRecruiterDialog({ open: true, jobId: detailJob.id, jobTitle: detailJob.title }); setDetailJob(null); }}
                          className="gap-2"
                        >
                          <Users className="h-4 w-4" />
                          Assign Recruiters
                        </Button>
                      </ClosedJobTooltipWrap>
                    )}
                    {canManageJobs && detailJob.status === 'draft' && (
                      <Button variant="outline" onClick={() => { handleStatusChange(detailJob, 'open'); setDetailJob(null); }} className="gap-2">
                        <Play className="h-4 w-4" />
                        Publish
                      </Button>
                    )}
                    {canManageJobs && detailJob.status === 'open' && (
                      <Button variant="outline" onClick={() => { handleStatusChange(detailJob, 'paused'); setDetailJob(null); }} className="gap-2">
                        <Pause className="h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    {canManageJobs && detailJob.status !== 'closed' && (
                      <Button variant="outline" onClick={() => { handleStatusChange(detailJob, 'closed'); setDetailJob(null); }} className="gap-2">
                        <Archive className="h-4 w-4" />
                        Close
                      </Button>
                    )}
                    {canManageJobs && detailJob.status === 'closed' && (
                      <Button variant="outline" onClick={() => { handleStatusChange(detailJob, 'open'); setDetailJob(null); }} className="gap-2">
                        <ArchiveRestore className="h-4 w-4" />
                        Re-open
                      </Button>
                    )}
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>

        {/* Create/Edit Job Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedJob ? 'Edit Job' : 'Create Job Posting'}</DialogTitle>
              <DialogDescription>
                {selectedJob ? 'Update job details.' : 'Fill in the job details. You can publish it later.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Senior Frontend Developer"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Job Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the role, responsibilities, and requirements..."
                  className="min-h-[120px]"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Select
                    value={form.domain}
                    onValueChange={(value) => setForm(prev => ({ ...prev, domain: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {domainList.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Team</Label>
                  <Select
                    value={form.department}
                    onValueChange={(value) => setForm(prev => ({ ...prev, department: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamList.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g., Remote, Bangalore, Mumbai, Pune"
                    value={form.location}
                    onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job Type</Label>
                  <Select
                    value={form.job_type}
                    onValueChange={(value: JobType) => setForm(prev => ({ ...prev, job_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(jobTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Experience Level</Label>
                  <Select
                    value={form.experience_level}
                    onValueChange={(value: ExperienceLevel) => setForm(prev => ({ ...prev, experience_level: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(experienceLevelLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Experience (in Years)</Label>
                  <Select
                    value={form.experience_years_range}
                    onValueChange={(value: ExperienceYearsRange) => setForm(prev => ({ ...prev, experience_years_range: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(experienceYearsLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Position Type</Label>
                  <Select
                    value={form.position_type}
                    onValueChange={(value: PositionType) => setForm(prev => ({ ...prev, position_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(positionTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_openings">Total Openings</Label>
                  <Input
                    id="total_openings"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={form.total_openings}
                    onChange={(e) => setForm(prev => ({ ...prev, total_openings: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Min Salary - Annual (₹)</Label>
                  <Input
                    id="salary_min"
                    type="number"
                    placeholder={SALARY_PLACEHOLDERS.min}
                    value={form.salary_min}
                    onChange={(e) => setForm(prev => ({ ...prev, salary_min: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Max Salary - Annual (₹)</Label>
                  <Input
                    id="salary_max"
                    type="number"
                    placeholder={SALARY_PLACEHOLDERS.max}
                    value={form.salary_max}
                    onChange={(e) => setForm(prev => ({ ...prev, salary_max: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="required_skills">Required Skills (comma separated)</Label>
                <Input
                  id="required_skills"
                  placeholder="React, TypeScript, Node.js"
                  value={form.required_skills}
                  onChange={(e) => setForm(prev => ({ ...prev, required_skills: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="benefits">Benefits (comma separated)</Label>
                <Input
                  id="benefits"
                  placeholder="Health Insurance, Remote Work, Stock Options"
                  value={form.benefits}
                  onChange={(e) => setForm(prev => ({ ...prev, benefits: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Application Deadline (optional)</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={form.application_deadline}
                  onChange={(e) => setForm(prev => ({ ...prev, application_deadline: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  A visual warning will appear when the deadline passes. The job won't auto-close.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="require-application-form">Digital application form</Label>
                  <p className="text-xs text-muted-foreground">
                    Require applicants to complete the pre-screen form before interviews.
                  </p>
                </div>
                <Switch
                  id="require-application-form"
                  checked={form.require_digital_application_form}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, require_digital_application_form: checked }))}
                />
              </div>

              <Separator />

              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="assessment-enabled" className="flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" />
                      Job assessment
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Link an assessment to this job for pipeline tracking and pass gating.
                    </p>
                  </div>
                  <Switch
                    id="assessment-enabled"
                    checked={form.assessment_enabled}
                    onCheckedChange={(checked) => setForm(prev => ({ ...prev, assessment_enabled: checked }))}
                  />
                </div>

                {form.assessment_enabled && (
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Default assessment</Label>
                      <Select
                        value={form.default_assessment_id || 'none'}
                        onValueChange={(value) =>
                          setForm(prev => ({
                            ...prev,
                            default_assessment_id: value === 'none' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select assessment" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None selected</SelectItem>
                          {activeAssessments.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="deadline-days">Default deadline (days)</Label>
                        <Input
                          id="deadline-days"
                          type="number"
                          min={1}
                          max={30}
                          value={form.assessment_config.deadline_days ?? 7}
                          onChange={(e) =>
                            setForm(prev => ({
                              ...prev,
                              assessment_config: {
                                ...prev.assessment_config,
                                deadline_days: Math.max(1, parseInt(e.target.value) || 7),
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pass-override">Pass threshold override (%)</Label>
                        <Input
                          id="pass-override"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="Use assessment default"
                          value={form.assessment_config.pass_threshold_override ?? ''}
                          onChange={(e) =>
                            setForm(prev => ({
                              ...prev,
                              assessment_config: {
                                ...prev.assessment_config,
                                pass_threshold_override: e.target.value ? parseInt(e.target.value) : null,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify-on-complete">Notify recruiter on completion</Label>
                        <p className="text-xs text-muted-foreground">In-app + email when candidate submits.</p>
                      </div>
                      <Switch
                        id="notify-on-complete"
                        checked={form.assessment_config.notify_recruiter_on_complete !== false}
                        onCheckedChange={(checked) =>
                          setForm(prev => ({
                            ...prev,
                            assessment_config: {
                              ...prev.assessment_config,
                              notify_recruiter_on_complete: checked,
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="require-pass">Require pass to advance</Label>
                        <p className="text-xs text-muted-foreground">Block pipeline advance until assessment passed (admin/HR can override).</p>
                      </div>
                      <Switch
                        id="require-pass"
                        checked={form.assessment_config.require_pass_before_interview !== false}
                        onCheckedChange={(checked) =>
                          setForm(prev => ({
                            ...prev,
                            assessment_config: {
                              ...prev.assessment_config,
                              require_pass_before_interview: checked,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={isPending || !form.title.trim()}>
                {isPending ? 'Saving...' : selectedJob ? 'Update Job' : 'Create Job'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Recruiters Dialog */}
        <AssignRecruitersDialog
          open={recruiterDialog.open}
          onOpenChange={(open) => !open && setRecruiterDialog({ open: false, jobId: '', jobTitle: '' })}
          jobId={recruiterDialog.jobId}
          jobTitle={recruiterDialog.jobTitle}
        />

        <AssignHiredCandidateDialog
          state={hiredDialog}
          onOpenChange={(open) => !open && setHiredDialog(null)}
          onSuccess={handleHiredAssignmentSuccess}
        />

        {/* Close Job Dialog */}
        <Dialog open={!!closeJobDialog} onOpenChange={(open) => !open && setCloseJobDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Close Job — {closeJobDialog?.job.title}</DialogTitle>
              <DialogDescription>
                This job has <strong>{closeJobDialog?.job.total_openings ?? 1}</strong> opening{(closeJobDialog?.job.total_openings ?? 1) !== 1 ? 's' : ''}.
                Positions filled is based on candidates marked as hired.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="positions-filled">Candidates who joined</Label>
              <Input
                id="positions-filled"
                type="number"
                readOnly
                className="bg-muted"
                value={closeJobDialog?.positionsFilled ?? 0}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloseJobDialog(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleConfirmClose}
                disabled={updateJob.isPending}
              >
                {updateJob.isPending ? 'Closing…' : 'Close Job'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CandidateDetailDrawer
          candidate={detailCandidate}
          open={!!detailCandidate}
          onOpenChange={(open) => !open && setDetailCandidate(null)}
          isInterviewerOnly={role === 'interviewer' && !isAdminOrHR}
        />
      </main>
      </PullToRefresh>
      <Footer />
    </div>
  );
}
