import { useState, useRef, useEffect, useDeferredValue, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useSearchParams } from 'react-router';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus,
  Search,
  MoreVertical,
  Users,
  Edit,
  Trash2,
  Mail,
  Phone,
  ChevronRight,
  Briefcase,
  FileText,
  LinkIcon,
  Linkedin,
  Copy,
  CheckCircle,
  Upload,
  Download,
  Loader2,
  Sparkles,
  Target,
  MessageSquare,
  Building2,
  GraduationCap,
  Award,
  Medal,
  ThumbsUp,
  ThumbsDown,
  Eye,
  X,
  Clock,
  UserX,
  ClipboardEdit,
  ShieldAlert,
  AlertTriangle,
  Filter,
  Crown,
  Tag,
} from 'lucide-react';
import { useCandidates, usePageCandidateAssessments, usePageCandidateCoverLetters, type PipelineEnrollmentFilter } from '@/hooks/useCandidates';
import { useCandidateAssignees } from '@/hooks/useCandidateAssignees';
import { useAllCandidateTags, usePageCandidateTags } from '@/hooks/useCandidateTags';
import { useParsedProfiles } from '@/hooks/useParsedProfiles';
import { useAuth } from '@/hooks/useAuth';
import { AssignInterviewersDialog } from '@/components/candidates/AssignInterviewersDialog';
import { useJobs } from '@/hooks/useJobs';
import { AssignAssessmentDialog } from '@/components/candidates/AssignAssessmentDialog';
import { AddToJobDialog } from '@/components/candidates/AddToJobDialog';
import { ManageTagsDialog } from '@/components/candidates/ManageTagsDialog';
import { BulkImportDialog } from '@/components/candidates/BulkImportDialog';
import { BulkResumeUploadDialog, BulkResumeUploadPanel } from '@/components/candidates/BulkResumeUploadDialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportCandidatesDialog } from '@/components/candidates/ExportCandidatesDialog';
import { PreScreenDialog } from '@/components/candidates/PreScreenDialog';
import { CandidateDetailDrawer } from '@/components/candidates/CandidateDetailDrawer';
import { InterviewKitDrawer } from '@/components/pipeline/InterviewKitDrawer';
import { useInterviewKitDrawerHost } from '@/hooks/useInterviewKitDrawerHost';
import { InterviewFeedbackDialog } from '@/components/pipeline/InterviewFeedbackDialog';
import { format } from 'date-fns';
import type { Candidate, CandidateAssessmentStatus, StructuredSkill } from '@/types/database';
import { notifyStaffEmail } from '@/lib/staffEmail';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import { openCandidateDetailWithFetch, fetchFullCandidate } from '@/lib/candidateDetail';
import { openResumeUrl } from '@/lib/resumeStorage';
import { useIsMobile } from '@/hooks/use-mobile';

const statusColors: Record<CandidateAssessmentStatus, string> = {
  invited: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  evaluated: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  expired: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const candidateStatusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  reviewing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  shortlisted: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  hold: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  backout: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const candidateStatusLabels: Record<string, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  shortlisted: 'Hired',
  rejected: 'Rejected',
  hold: 'Hold',
  backout: 'Backout',
};

const candidateSourceLabels: Record<string, string> = {
  manual: 'Manual',
  portal: 'Portal',
  naukri: 'Naukri',
  linkedin: 'LinkedIn',
  referral: 'Referral',
  indeed: 'Indeed',
  talent_email: 'Talent Email',
};

const noticePeriodOptions = [
  'Immediate',
  'Serving',
  'Notice',
  '0 - 7 days',
  '7 - 15 days',
  '15 - 30 days',
  '30 - 45 days',
  '45 - 60 days',
  'More than 60 days',
];

interface CandidatesProps {
  mode?: 'pipeline' | 'database';
  embedded?: boolean;
}

const TERMINAL_STATUSES = ['shortlisted', 'rejected', 'backout'];

function getDaysStale(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
}

export default function Candidates({ mode = 'pipeline', embedded = false }: CandidatesProps) {
  const isDatabase = mode === 'database';
  usePageTitle(isDatabase ? 'Talent Database' : embedded ? 'Hiring' : 'Candidates');
  const [searchParams, setSearchParams] = useSearchParams();
  const { enrichProfile } = useParsedProfiles({ fetchList: false });
  const { jobs } = useJobs({ summary: true });
  const { user, isAdmin, isAdminOrHR, isRecruiter, isInterviewer } = useAuth();
  const { toast } = useToast();
  const canManageCandidates = isAdminOrHR || isRecruiter;
  const canDeleteCandidates = isAdminOrHR;
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [skillFilter, setSkillFilter] = useState<string[]>([]);
  const [missingFilter, setMissingFilter] = useState<string[]>([]);
  const [skillFilterInput, setSkillFilterInput] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<PipelineEnrollmentFilter>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [advSearch, setAdvSearch] = useState({
    name: '', email: '', company: '', role: '', expMin: '', expMax: '', source: '',
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');

  // Job filter from URL params
  const jobFilter = searchParams.get('job') || '';
  const selectedJobForFilter = jobs.find(j => j.id === jobFilter);

  // Status filter from URL params (set by dashboard Pipeline Funnel)
  const statusFilter = searchParams.get('status') || '';

  // Auto-open add dialog when navigated with ?action=add
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setIsFormOpen(true);
      // Remove action param but keep job filter
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);



  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [addToJobCandidate, setAddToJobCandidate] = useState<Candidate | null>(null);
  const [tagsCandidate, setTagsCandidate] = useState<Candidate | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isBulkResumeOpen, setIsBulkResumeOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [preScreenCandidate, setPreScreenCandidate] = useState<Candidate | null>(null);
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);

  const closeDetailCandidate = useCallback(() => {
    setDetailCandidate(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('profile');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const detailOpen = !!detailCandidate;
  const {
    drawerBackdropOpen,
    closeAll,
    interviewKitDrawerProps,
    candidateDrawerKitProps,
  } = useInterviewKitDrawerHost({
    detailOpen,
    onCloseDetail: closeDetailCandidate,
  });

  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const advSearchActive = Object.values(advSearch).some(v => v.trim() !== '');
  const hasBooleanSearch = /\b(AND|OR|NOT)\b/i.test(deferredSearch);
  // Simple text search is server-side paginated; boolean/skill/advanced/missing still need full pool
  const forceFullFetch =
    advSearchActive || missingFilter.length > 0 || skillFilter.length > 0
    || (!!deferredSearch.trim() && hasBooleanSearch);

  const { candidates, totalCount: serverTotalCount, isLoading, createCandidate, updateCandidate, deleteCandidate, refetch } = useCandidates({
    page: currentPage,
    pageSize,
    mode: isDatabase || isInterviewer ? 'database' : 'pipeline',
    jobId: jobFilter || undefined,
    status: statusFilter || undefined,
    search: deferredSearch.trim() || undefined,
    forceFullFetch,
    pipelineFilter: isDatabase ? pipelineFilter : 'all',
    tag: isDatabase && tagFilter ? tagFilter : undefined,
  });
  const [coverLetterDialog, setCoverLetterDialog] = useState<{ open: boolean; content: string }>({ open: false, content: '' });
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; candidate: Candidate | null; status: string; reason: string; sendEmail: boolean }>({ open: false, candidate: null, status: '', reason: '', sendEmail: false });
  const [interviewerDialog, setInterviewerDialog] = useState<{ open: boolean; candidateId: string; candidateName: string }>({ open: false, candidateId: '', candidateName: '' });
  const [feedbackDialog, setFeedbackDialog] = useState<{ open: boolean; interview: any | null }>({ open: false, interview: null });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  // Keep detailCandidate in sync with the candidates list after any refetch/mutation
  useEffect(() => {
    if (detailCandidate) {
      const updated = candidates.find(c => c.id === detailCandidate.id);
      if (updated) {
        setDetailCandidate(prev => prev ? { ...prev, ...updated, skills: updated.skills ?? prev.skills } : updated);
      }
    }
  }, [candidates]);

  // Auto-open candidate detail drawer from ?profile=<id> shareable link
  const [profileAccessDenied, setProfileAccessDenied] = useState(false);
  useEffect(() => {
    const profileId = searchParams.get('profile');
    if (profileId && !isLoading && !detailCandidate) {
      const candidate = candidates.find(c => c.id === profileId);
      if (candidate) {
        void openCandidateDetailWithFetch(candidate, setDetailCandidate);
        setProfileAccessDenied(false);
      } else if (candidates.length >= 0) {
        void fetchFullCandidate({ id: profileId, name: '', skills: [], created_at: '', updated_at: '' })
          .then((full) => {
            if (full.name) {
              setDetailCandidate(full);
              setProfileAccessDenied(false);
            } else {
              setProfileAccessDenied(true);
            }
          });
      }
    }
  }, [searchParams, candidates, isLoading, detailCandidate]);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    linkedin_url: '',
    role_applied: '',
    job_id: '',
    skills: '',
    notes: '',
    resume_url: '',
    parse_score: 0,
    experience_years: undefined as number | undefined,
    candidate_current_role: '',
    candidate_current_company: '',
    work_experience: undefined as any[] | undefined,
    education: undefined as any[] | undefined,
    certifications: undefined as any[] | undefined,
    awards: undefined as any[] | undefined,
    credential_score: undefined as number | undefined,
    source: 'manual',
    referred_by: '',
  });

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload a PDF or Word document', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `hr-${user?.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('resumes').upload(fileName, file);
      if (uploadError) throw uploadError;

      setForm(prev => ({ ...prev, resume_url: fileName }));
      toast({ title: 'Resume uploaded successfully' });

      // Parse resume with AI
      setIsParsing(true);
      toast({ title: 'Analyzing resume...', description: 'Extracting candidate details with AI' });

      try {
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
          body: { resume_url: fileName, ...getDevGeminiKeyBody() },
        });

        if (parseError) throw parseError;

        if (parseData?.success && parseData.data) {
          const extracted = parseData.data;
          setForm(prev => ({
            ...prev,
            name: extracted.full_name || prev.name,
            email: extracted.email || prev.email,
            phone: extracted.phone || prev.phone,
            linkedin_url: extracted.linkedin_url || prev.linkedin_url,
            role_applied: extracted.current_role || prev.role_applied,
            skills: extracted.skills?.join(', ') || prev.skills,
            parse_score: extracted.parse_score || 0,
            experience_years: extracted.experience_years,
            candidate_current_role: extracted.current_role || '',
            candidate_current_company: extracted.current_company || '',
            work_experience: extracted.work_experience || undefined,
            education: extracted.education || undefined,
            certifications: extracted.certifications || undefined,
            awards: extracted.awards || undefined,
            credential_score: extracted.credential_score || undefined,
          }));
          toast({ title: 'Resume parsed!', description: 'Candidate details auto-filled. Review and save.' });
        }
      } catch (parseErr: unknown) {
        console.error('Resume parse error:', parseErr);
        let description = 'You can still enter details manually.';
        const err = parseErr as { context?: { json?: () => Promise<{ error?: string }> }; message?: string };
        if (err?.context?.json) {
          try {
            const body = await err.context.json();
            if (typeof body?.error === 'string' && body.error.length > 0) description = body.error;
          } catch {
            // ignore
          }
        } else if (parseErr instanceof Error && parseErr.message) {
          description = parseErr.message;
        }
        toast({ title: 'Could not auto-fill from resume', description, variant: 'default' });
      } finally {
        setIsParsing(false);
      }
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Reset to page 1 when search/filter changes
  const prevFilterKey = useRef('');
  const filterKey = `${deferredSearch}|${skillFilter.join(',')}|${jobFilter}|${statusFilter}|${missingFilter.join(',')}|${pipelineFilter}|${tagFilter}|${JSON.stringify(advSearch)}`;
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (currentPage !== 1) setCurrentPage(1);
  }

  // Boolean search parser: supports AND / OR / NOT (case-insensitive)
  // "React AND Python NOT Java"  → must have React+Python, must not have Java
  // "React OR Angular"           → must have at least one
  // Plain text                   → simple substring (OR across all fields)
  const parseBooleanSearch = (query: string, haystack: string): boolean => {
    const q = query.trim();
    if (!q) return true;
    const h = haystack.toLowerCase();
    // Split on AND/OR/NOT keeping delimiters
    if (/\b(AND|OR|NOT)\b/i.test(q)) {
      // Tokenise: split by whitespace-surrounded AND/OR/NOT
      const tokens = q.split(/\s+(AND|OR|NOT)\s+/i);
      const ops: string[] = [];
      // Extract operators from original string
      const opMatches = q.match(/\s+(AND|OR|NOT)\s+/gi) || [];
      opMatches.forEach(m => ops.push(m.trim().toUpperCase()));

      let result: boolean | null = null;
      let notNext = false;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].trim().replace(/^"|"$/g, '').toLowerCase();
        const op = ops[i - 1]?.toUpperCase();

        if (!token) continue;

        const matches = notNext ? !h.includes(token) : h.includes(token);
        notNext = false;

        if (op === 'NOT') { notNext = true; result = result === null ? true : result; continue; }
        if (result === null) { result = matches; }
        else if (op === 'OR') { result = result || matches; }
        else { result = result && matches; } // AND (default)
      }
      return result ?? true;
    }
    return h.includes(q.toLowerCase());
  };

  const hasActiveFilters = forceFullFetch;
  const mobileFiltersCount =
    (jobFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (isDatabase && pipelineFilter !== 'all' ? 1 : 0) +
    (isDatabase && tagFilter ? 1 : 0) +
    skillFilter.length +
    missingFilter.length;

  const { data: allTags = [] } = useAllCandidateTags(isDatabase);
  const showDatabaseTagsColumn = isDatabase && allTags.length > 0;
  const jobFilterOptions = isDatabase ? jobs : jobs.filter((j: { status: string }) => j.status === 'open');
  const showJobMatch = !isDatabase || !!jobFilter;

  const filteredCandidates = candidates.filter(c => {
    if (!forceFullFetch) {
      // Job and status filters are applied server-side when not doing a full fetch
    } else {
      if (jobFilter && (c as any).job_id !== jobFilter) return false;
      if (statusFilter && ((c as any).candidate_status || 'new') !== statusFilter) return false;
      if (!isDatabase && !isInterviewer) {
        const job = jobs.find(j => j.id === (c as any).job_id);
        if (job?.status !== 'open') return false;
      }
    }

    // Main search — client-side only for boolean operators / notes / skills (server handles plain text)
    if (forceFullFetch && deferredSearch.trim()) {
      const haystack = [
        c.name,
        c.email,
        c.role_applied,
        (c as any).candidate_current_company,
        (c as any).candidate_current_role,
        (c as any).notes,
        c.skills.join(' '),
      ].filter(Boolean).join(' ');
      if (!parseBooleanSearch(deferredSearch, haystack)) return false;
    }

    // Advanced field-level filters
    if (advancedOpen && advSearchActive) {
      const adv = advSearch;
      if (adv.name && !c.name.toLowerCase().includes(adv.name.toLowerCase())) return false;
      if (adv.email && !(c.email?.toLowerCase() ?? '').includes(adv.email.toLowerCase())) return false;
      if (adv.company && !((c as any).candidate_current_company?.toLowerCase() ?? '').includes(adv.company.toLowerCase())) return false;
      if (adv.role && !(c.role_applied?.toLowerCase() ?? '').includes(adv.role.toLowerCase())) return false;
      if (adv.source && !((c as any).source?.toLowerCase() ?? '').includes(adv.source.toLowerCase())) return false;
      const exp = (c as any).experience_years;
      if (adv.expMin && (exp == null || exp < Number(adv.expMin))) return false;
      if (adv.expMax && (exp == null || exp > Number(adv.expMax))) return false;
    }

    if (skillFilter.length > 0) {
      const candidateSkillNames = (c.structured_skills || []).map(s => s.name.toLowerCase());
      const flatSkills = c.skills.map(s => s.toLowerCase());
      const allSkills = [...new Set([...candidateSkillNames, ...flatSkills])];
      if (!skillFilter.every(f => allSkills.some(s => s.includes(f.toLowerCase())))) return false;
    }

    if (missingFilter.length > 0) {
      for (const m of missingFilter) {
        if (m === 'email' && c.email) return false;
        if (m === 'phone' && (c as any).phone) return false;
        if (m === 'linkedin' && (c as any).linkedin_url) return false;
        if (m === 'resume' && (c as any).resume_url) return false;
        if (m === 'enrichment' && (c as any).enrichment_score != null) return false;
      }
    }

    return true;
  });

  const listTotal = forceFullFetch ? filteredCandidates.length : serverTotalCount;
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const pagedCandidates = forceFullFetch
    ? filteredCandidates.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : filteredCandidates;

  const pageCandidateIdsKey = pagedCandidates.map((c) => c.id).join(',');
  const pageCandidateIds = useMemo(
    () => (pageCandidateIdsKey ? pageCandidateIdsKey.split(',') : []),
    [pageCandidateIdsKey],
  );

  const { recruiterMap, interviewerMap } = useCandidateAssignees(isDatabase ? [] : pageCandidateIds);
  const { data: pageTagsMap = new Map<string, string[]>() } = usePageCandidateTags(isDatabase ? pageCandidateIds : []);
  const { data: pageAssignments = [] } = usePageCandidateAssessments(pageCandidateIds);
  const { data: pageCoverLetters = [] } = usePageCandidateCoverLetters(pageCandidateIds);

  const { data: rawPipelineRows } = useQuery({
    queryKey: ['candidate-pipeline-stages', pageCandidateIdsKey, isDatabase],
    staleTime: 30_000,
    enabled: pageCandidateIds.length > 0,
    queryFn: async () => {
      const select = isDatabase
        ? 'candidate_id, job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name, order_index, job:jobs(id, title))'
        : 'candidate_id, job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name, order_index)';
      const { data } = await supabase
        .from('candidate_interviews')
        .select(select)
        .in('candidate_id', pageCandidateIds)
        .is('removed_from_pipeline_at', null);
      return data || [];
    },
  });

  const candidateStageMap = useMemo(() => {
    const map = new Map<string, string>();
    (rawPipelineRows || []).forEach((row: any) => {
      const stage = row.job_interview_stage;
      if (!stage) return;
      const current = map.get(row.candidate_id);
      if (!current) {
        map.set(row.candidate_id, JSON.stringify({ name: stage.stage_name, order: stage.order_index }));
      } else {
        const prev = JSON.parse(current);
        if (stage.order_index > prev.order) {
          map.set(row.candidate_id, JSON.stringify({ name: stage.stage_name, order: stage.order_index }));
        }
      }
    });
    const result = new Map<string, string>();
    map.forEach((val, key) => result.set(key, JSON.parse(val).name));
    return result;
  }, [rawPipelineRows]);

  const candidatePipelineSummaryMap = useMemo(() => {
    if (!isDatabase) return new Map<string, Array<{ jobTitle: string; stageName: string }>>();
    const byCandidate = new Map<string, Map<string, { jobTitle: string; stageName: string; order: number }>>();
    (rawPipelineRows || []).forEach((row: any) => {
      const stage = row.job_interview_stage;
      const job = stage?.job;
      if (!stage || !job?.id) return;
      if (!byCandidate.has(row.candidate_id)) {
        byCandidate.set(row.candidate_id, new Map());
      }
      const jobMap = byCandidate.get(row.candidate_id)!;
      const existing = jobMap.get(job.id);
      if (!existing || stage.order_index > existing.order) {
        jobMap.set(job.id, { jobTitle: job.title, stageName: stage.stage_name, order: stage.order_index });
      }
    });
    const result = new Map<string, Array<{ jobTitle: string; stageName: string }>>();
    byCandidate.forEach((jobMap, candidateId) => {
      const summaries = [...jobMap.values()]
        .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle))
        .map(({ jobTitle, stageName }) => ({ jobTitle, stageName }));
      result.set(candidateId, summaries);
    });
    return result;
  }, [rawPipelineRows, isDatabase]);

  const getCandidateAssignments = (candidateId: string) =>
    pageAssignments.filter(a => a.candidate_id === candidateId);

  const openCandidateDetail = (candidate: Candidate) => {
    void openCandidateDetailWithFetch(candidate, setDetailCandidate);
  };

  // Get cover letter for a candidate from job_applications
  const getCoverLetter = (candidateId: string): string | null => {
    const app = pageCoverLetters.find(a => a.candidate_id === candidateId);
    return app?.cover_letter || null;
  };

  const resetAddFormMode = () => {
    setAddMode('single');
  };

  const handleFormOpenChange = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) resetAddFormMode();
  };

  const openCreate = () => {
    setSelectedCandidate(null);
    resetAddFormMode();
    setForm({ name: '', email: '', phone: '', linkedin_url: '', role_applied: '', job_id: jobFilter || '', skills: '', notes: '', resume_url: '', parse_score: 0, experience_years: undefined, candidate_current_role: '', candidate_current_company: '', work_experience: undefined, education: undefined, certifications: undefined, awards: undefined, credential_score: undefined, source: 'manual', referred_by: '' });
    setIsFormOpen(true);
  };

  const openEdit = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setForm({
      name: candidate.name,
      email: candidate.email || '',
      phone: candidate.phone || '',
      linkedin_url: (candidate as any).linkedin_url || '',
      role_applied: candidate.role_applied || '',
      job_id: (candidate as any).job_id || '',
      skills: candidate.skills.join(', '),
      notes: candidate.notes || '',
      resume_url: (candidate as any).resume_url || '',
      parse_score: (candidate as any).parse_score || 0,
      experience_years: (candidate as any).experience_years,
      candidate_current_role: (candidate as any).candidate_current_role || '',
      candidate_current_company: (candidate as any).candidate_current_company || '',
      work_experience: (candidate as any).work_experience || undefined,
      education: (candidate as any).education || undefined,
      certifications: (candidate as any).certifications || undefined,
      awards: (candidate as any).awards || undefined,
      credential_score: (candidate as any).credential_score || undefined,
      source: (candidate as any).source || 'manual',
      referred_by: (candidate as any).referred_by || '',
    });
    setIsFormOpen(true);
  };

  const openAssign = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsAssignOpen(true);
  };

  const openAddToJob = (candidate: Candidate) => {
    setAddToJobCandidate(candidate);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) return;

    const roleApplied = form.role_applied;

    // Auto-upgrade structured_skills from premium certifications
    let structuredSkills = selectedCandidate?.structured_skills || [];
    const premiumCerts = (form.certifications || []).filter((c: any) => c.is_premium && c.skill_upgrade);
    if (premiumCerts.length > 0) {
      const updatedSkills = [...structuredSkills];
      for (const cert of premiumCerts) {
        const existingIdx = updatedSkills.findIndex(
          (s: any) => s.name.toLowerCase() === cert.skill_upgrade.toLowerCase()
        );
        const proficiency = cert.tier === 1 ? 'expert' : cert.tier === 2 ? 'intermediate' : 'beginner';
        const confidence = cert.tier === 1 ? 0.95 : cert.tier === 2 ? 0.8 : 0.6;
        if (existingIdx >= 0) {
          const existing = updatedSkills[existingIdx] as any;
          const profOrder = { beginner: 0, intermediate: 1, expert: 2 } as any;
          if (profOrder[proficiency] > profOrder[existing.proficiency || 'beginner']) {
            updatedSkills[existingIdx] = {
              ...existing,
              proficiency,
              confidence: Math.max(existing.confidence || 0, confidence),
              sources: [...new Set([...(existing.sources || []), 'certification'])],
            };
          } else if (!existing.sources?.includes('certification')) {
            updatedSkills[existingIdx] = {
              ...existing,
              sources: [...(existing.sources || []), 'certification'],
            };
          }
        } else {
          updatedSkills.push({
            name: cert.skill_upgrade,
            category: cert.category || 'other',
            proficiency,
            confidence,
            sources: ['certification'],
          });
        }
      }
      structuredSkills = updatedSkills;
    }

    const candidateData: any = {
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      linkedin_url: form.linkedin_url || undefined,
      role_applied: roleApplied || undefined,
      job_id: form.job_id || undefined,
      skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
      notes: form.notes || undefined,
      resume_url: form.resume_url || undefined,
      parse_score: form.parse_score || undefined,
      experience_years: form.experience_years,
      candidate_current_role: form.candidate_current_role || undefined,
      candidate_current_company: form.candidate_current_company || undefined,
      work_experience: form.work_experience || undefined,
      education: form.education || undefined,
      certifications: form.certifications || undefined,
      awards: form.awards || undefined,
      credential_score: form.credential_score || undefined,
      source: form.source || 'manual',
      referred_by: form.source === 'referral' ? (form.referred_by.trim() || null) : null,
    };

    if (premiumCerts.length > 0) {
      candidateData.structured_skills = structuredSkills;
    }

    if (selectedCandidate) {
      await updateCandidate.mutateAsync({ id: selectedCandidate.id, ...candidateData });
    } else {
      await createCandidate.mutateAsync(candidateData);
    }
    handleFormOpenChange(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this candidate and all their assessment data?')) {
      await deleteCandidate.mutateAsync(id);
    }
  };

  const handleAnalyze = async (candidateId: string) => {
    setAnalyzingId(candidateId);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-candidate', {
        body: { candidate_id: candidateId, ...getDevGeminiKeyBody() },
      });
      if (error) {
        const err = error as { context?: { json?: () => Promise<{ error?: string }> } };
        if (err.context?.json) {
          try {
            const body = await err.context.json();
            if (typeof body?.error === 'string') throw new Error(body.error);
          } catch (e) {
            if (e instanceof Error && e.message !== error.message) throw e;
          }
        }
        throw error;
      }
      if (data?.error) {
        toast({ title: 'Analysis failed', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Suitability analyzed', description: `Score: ${data.analysis.suitability_score}% match` });
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      toast({ title: 'Analysis failed', description: message, variant: 'destructive' });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleEnrich = async (candidateId: string) => {
    setEnrichingId(candidateId);
    try {
      await enrichProfile.mutateAsync(candidateId);
      await refetch();
    } finally {
      setEnrichingId(null);
    }
  };

  const handleStatusChange = async (candidate: Candidate, newStatus: string, sendEmail: boolean = false, reason: string = '') => {
    try {
      const updatePayload: Record<string, unknown> = { id: candidate.id, candidate_status: newStatus };
      if (newStatus === 'shortlisted') {
        updatePayload.hired_at = new Date().toISOString();
      }
      await updateCandidate.mutateAsync(updatePayload as any);

      // Also update job_applications status if there's a linked application
      if ((candidate as any).job_id) {
        await supabase
          .from('job_applications')
          .update({ status: newStatus })
          .eq('candidate_id', candidate.id);
      }

      // Send email only if explicitly opted in and candidate has an email
      if (sendEmail && candidate.email && (newStatus === 'shortlisted' || newStatus === 'rejected' || newStatus === 'hold' || newStatus === 'backout')) {
        const jobTitle = (candidate as any).job?.title || (candidate as any).role_applied || 'the position';
        const emailTypeMap: Record<string, string> = { shortlisted: 'shortlist', rejected: 'reject', hold: 'hold', backout: 'backout' };
        try {
          await supabase.functions.invoke('send-applicant-email', {
            body: {
              type: emailTypeMap[newStatus],
              applicant_name: candidate.name,
              applicant_email: candidate.email,
              job_title: jobTitle,
              ...(reason ? { rejection_reason: reason } : {}),
            },
          });
          toast({ title: `Candidate ${candidateStatusLabels[newStatus] || newStatus}`, description: 'Status updated & email sent.' });
        } catch {
          toast({ title: `Candidate ${candidateStatusLabels[newStatus] || newStatus}`, description: 'Status updated but email failed to send.' });
        }
      } else {
        toast({ title: `Candidate ${candidateStatusLabels[newStatus] || newStatus}`, description: 'Status updated.' });
      }
    } catch (err: any) {
      toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' });
    }
  };

  const openStatusDialog = (candidate: Candidate, status: string) => {
    setStatusDialog({ open: true, candidate, status, reason: '', sendEmail: false });
  };

  const confirmStatusChange = async () => {
    if (!statusDialog.candidate) return;
    const needsReason = statusDialog.sendEmail && (statusDialog.status === 'rejected' || statusDialog.status === 'backout');
    if (needsReason && !statusDialog.reason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason before sending the rejection email.', variant: 'destructive' });
      return;
    }
    await handleStatusChange(statusDialog.candidate, statusDialog.status, statusDialog.sendEmail, statusDialog.reason);
    setStatusDialog({ open: false, candidate: null, status: '', reason: '', sendEmail: false });
  };

  const copyMagicLink = (accessToken: string) => {
    const link = `${window.location.origin}/exam?token=${accessToken}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(accessToken);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleOpenFeedback = async (candidateId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // First, check if this interviewer already has an interview record for this candidate
      const { data: existingInterview, error: fetchError } = await supabase
        .from('candidate_interviews')
        .select('*, candidates(name), job_interview_stages(stage_name)')
        .eq('candidate_id', candidateId)
        .eq('interviewer_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        toast({ title: 'Error fetching interview', description: fetchError.message, variant: 'destructive' });
        return;
      }

      if (existingInterview) {
        setFeedbackDialog({
          open: true,
          interview: {
            ...existingInterview,
            candidate_name: (existingInterview as any).candidates?.name || '',
            stage_name: (existingInterview as any).job_interview_stages?.stage_name || 'Interview',
          },
        });
        return;
      }

      // No record for this interviewer — find the candidate's current stage and create one
      const { data: latestInterview } = await supabase
        .from('candidate_interviews')
        .select('job_interview_stage_id, candidates(name), job_interview_stages(stage_name)')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const stageId = latestInterview?.job_interview_stage_id || null;
      const candidateName = (latestInterview as any)?.candidates?.name || '';
      const stageName = (latestInterview as any)?.job_interview_stages?.stage_name || 'Interview';

      // Create a new interview record for this interviewer
      const { data: newInterview, error: createError } = await supabase
        .from('candidate_interviews')
        .insert({
          candidate_id: candidateId,
          job_interview_stage_id: stageId,
          interviewer_user_id: user.id,
          sort_order: 0,
        })
        .select()
        .single();

      if (createError) {
        toast({ title: 'Error creating interview record', description: createError.message, variant: 'destructive' });
        return;
      }

      setFeedbackDialog({
        open: true,
        interview: {
          ...newInterview,
          candidate_name: candidateName,
          stage_name: stageName,
        },
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleFeedbackSubmit = async (feedbackData: any) => {
    if (!feedbackDialog.interview) return;
    setFeedbackSubmitting(true);
    try {
      const { error } = await supabase
        .from('candidate_interviews')
        .update({
          verdict: feedbackData.verdict,
          overall_score: feedbackData.overall_score,
          rating_categories: feedbackData.rating_categories,
          feedback: feedbackData.feedback,
          interview_mode: feedbackData.interview_mode || null,
          completed_at: feedbackData.completed_at,
        })
        .eq('id', feedbackDialog.interview.id);

      if (error) throw error;
      notifyStaffEmail('verdict_submitted', feedbackDialog.interview.id);
      toast({ title: 'Feedback submitted', description: 'Interview feedback saved successfully.' });
      setFeedbackDialog({ open: false, interview: null });
    } catch (err: any) {
      toast({ title: 'Failed to submit feedback', description: err.message, variant: 'destructive' });
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const clearJobFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('job');
    setSearchParams(newParams, { replace: true });
  };

  const isPending = createCandidate.isPending || updateCandidate.isPending;

  const databaseEmptyState = (() => {
    if (pipelineFilter === 'in_pipeline') {
      return {
        title: 'No candidates in pipeline',
        description: 'No candidates are currently in an active pipeline.',
      };
    }
    if (pipelineFilter === 'not_in_job') {
      return {
        title: 'No unassigned candidates',
        description: 'No unassigned candidates in the pool.',
      };
    }
    return {
      title: jobFilter ? 'No candidates for this job yet' : 'No candidates yet',
      description: jobFilter
        ? 'Add a candidate or share the public careers page.'
        : 'Add your first candidate to get started.',
    };
  })();

  const renderSecondaryFilters = (stacked = false) => (
    <div className={stacked ? 'flex flex-col gap-3' : 'flex flex-wrap gap-3'}>
      {isDatabase && (
        <Select
          value={pipelineFilter}
          onValueChange={(value) => setPipelineFilter(value as PipelineEnrollmentFilter)}
        >
          <SelectTrigger className={stacked ? 'w-full' : 'w-[200px]'}>
            <SelectValue placeholder="Pipeline status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All candidates</SelectItem>
            <SelectItem value="in_pipeline">In pipeline</SelectItem>
            <SelectItem value="not_in_job">Not in any job</SelectItem>
          </SelectContent>
        </Select>
      )}

      {isDatabase && allTags.length > 0 && (
        <Select
          value={tagFilter || 'all'}
          onValueChange={(value) => setTagFilter(value === 'all' ? '' : value)}
        >
          <SelectTrigger className={stacked ? 'w-full' : 'w-[180px]'}>
            <SelectValue placeholder="Filter by tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!isInterviewer && !embedded && (
        <Select
          value={jobFilter || 'all'}
          onValueChange={(value) => {
            const newParams = new URLSearchParams(searchParams);
            if (value === 'all') {
              newParams.delete('job');
            } else {
              newParams.set('job', value);
            }
            setSearchParams(newParams, { replace: true });
          }}
        >
          <SelectTrigger className={stacked ? 'w-full' : 'w-[220px]'}>
            <SelectValue placeholder="Filter by Job" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isDatabase ? 'All Jobs' : 'All Open Jobs'}</SelectItem>
            {jobFilterOptions.map((job: any) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}{job.status === 'paused' ? ' (Paused)' : job.status === 'closed' ? ' (Closed)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {jobFilter && !embedded && (
        <Button variant="ghost" size="sm" onClick={clearJobFilter} className="gap-1 self-start">
          <X className="h-3 w-3" />
          Clear Filter
        </Button>
      )}

      <div className={stacked ? 'space-y-2' : 'flex items-center gap-2'}>
        <Input
          placeholder="Filter by skill..."
          className={stacked ? 'w-full' : 'w-48'}
          value={skillFilterInput}
          onChange={(e) => setSkillFilterInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && skillFilterInput.trim()) {
              setSkillFilter(prev => [...new Set([...prev, skillFilterInput.trim()])]);
              setSkillFilterInput('');
            }
          }}
        />
        {skillFilter.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {skillFilter.map(s => (
              <Badge key={s} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setSkillFilter(prev => prev.filter(f => f !== s))}>
                {s} ×
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSkillFilter([])}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {statusFilter && (
        <Badge variant="secondary" className="text-xs gap-1 h-8 px-3 cursor-pointer self-start" onClick={() => {
          const p = new URLSearchParams(searchParams);
          p.delete('status');
          setSearchParams(p, { replace: true });
        }}>
          Status: {candidateStatusLabels[statusFilter] || statusFilter} ×
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={missingFilter.length > 0 ? 'default' : 'outline'} size="sm" className="gap-2 self-start">
            <Filter className="h-3.5 w-3.5" />
            Missing Info
            {missingFilter.length > 0 && <span className="ml-1 rounded-full bg-background/20 px-1.5 text-xs">{missingFilter.length}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Show candidates missing:</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {([
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'linkedin', label: 'LinkedIn' },
            { key: 'resume', label: 'Resume' },
            { key: 'enrichment', label: 'Enrichment' },
          ] as const).map(({ key, label }) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={missingFilter.includes(key)}
              onCheckedChange={(checked) =>
                setMissingFilter(prev => checked ? [...prev, key] : prev.filter(f => f !== key))
              }
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
          {missingFilter.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-muted-foreground justify-center" onClick={() => setMissingFilter([])}>
                Clear filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const candidatesContent = (
    <>
      <main className={embedded ? 'space-y-4' : 'container mx-auto px-4 sm:px-6 py-4 md:py-8 pb-safe'}>
        {!embedded && (
        <div className="flex items-start justify-between gap-3 mb-4 md:mb-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {isDatabase ? 'Talent Database' : 'Candidates'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 md:mt-1 line-clamp-2 md:line-clamp-none">
              {selectedJobForFilter
                ? `Showing candidates for: ${selectedJobForFilter.title}`
                : isDatabase
                  ? 'All CVs ever uploaded — your full talent pool'
                  : 'Active candidates mapped to an open job'}
            </p>
          </div>

          {canManageCandidates && isDatabase && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0 md:hidden">
                    <MoreVertical className="h-4 w-4" />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setIsExportOpen(true)} className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsBulkImportOpen(true)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsBulkResumeOpen(true)} className="gap-2">
                    <FileText className="h-4 w-4" />
                    Upload Resumes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="hidden md:flex flex-wrap gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setIsExportOpen(true)} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsBulkImportOpen(true)} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsBulkResumeOpen(true)} className="gap-2">
                  <FileText className="h-4 w-4" />
                  Upload Resumes
                </Button>
              </div>
            </>
          )}
        </div>
        )}
        
        <ExportCandidatesDialog
          open={isExportOpen}
          onOpenChange={setIsExportOpen}
          candidates={filteredCandidates}
        />

        <div className="mb-4 md:mb-6 space-y-2 md:space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isMobile ? 'Search candidates…' : 'Search… or use AND / OR / NOT (e.g. "React AND Python NOT Java")'}
              className="pl-10 pr-4 h-9 md:h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant={advancedOpen ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5 shrink-0 h-9 md:h-10"
            onClick={() => setAdvancedOpen(v => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Advanced</span>
            {advSearchActive && <span className="rounded-full bg-background/20 px-1.5 text-xs">ON</span>}
          </Button>
          <Button
            variant={mobileFiltersCount > 0 ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5 shrink-0 h-9 md:hidden"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {mobileFiltersCount > 0 && (
              <span className="rounded-full bg-background/20 px-1.5 text-xs">{mobileFiltersCount}</span>
            )}
          </Button>
        </div>

        {/* Advanced search panel */}
        {advancedOpen && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Name</label>
                <Input placeholder="e.g. Rahul" value={advSearch.name} onChange={e => setAdvSearch(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Email</label>
                <Input placeholder="e.g. @gmail.com" value={advSearch.email} onChange={e => setAdvSearch(p => ({ ...p, email: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Current Company</label>
                <Input placeholder="e.g. Infosys" value={advSearch.company} onChange={e => setAdvSearch(p => ({ ...p, company: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Role Applied</label>
                <Input placeholder="e.g. Data Engineer" value={advSearch.role} onChange={e => setAdvSearch(p => ({ ...p, role: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Experience (years)</label>
                <div className="flex items-center gap-1">
                  <Input placeholder="Min" type="number" min={0} value={advSearch.expMin} onChange={e => setAdvSearch(p => ({ ...p, expMin: e.target.value }))} className="h-8 text-sm w-20" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input placeholder="Max" type="number" min={0} value={advSearch.expMax} onChange={e => setAdvSearch(p => ({ ...p, expMax: e.target.value }))} className="h-8 text-sm w-20" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Source</label>
                <Input placeholder="e.g. bulk_resume" value={advSearch.source} onChange={e => setAdvSearch(p => ({ ...p, source: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            {advSearchActive && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setAdvSearch({ name: '', email: '', company: '', role: '', expMin: '', expMax: '', source: '' })}>
                Clear advanced filters
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: main search box supports <strong>AND</strong>, <strong>OR</strong>, <strong>NOT</strong> — e.g. <code className="bg-muted px-1 rounded">React AND Python NOT Java</code>
            </p>
          </div>
        )}

        <div className="hidden md:block">
          {renderSecondaryFilters()}
        </div>
        </div>

        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl pb-safe">
            <SheetHeader className="text-left pb-2">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            {renderSecondaryFilters(true)}
          </SheetContent>
        </Sheet>

        {isLoading ? (
          <Card className="animate-pulse">
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-muted rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : filteredCandidates.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              {searchQuery || skillFilter.length > 0 || jobFilter ? (
                <>
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No matching candidates</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or filters.
                  </p>
                  <Button variant="outline" onClick={() => { setSearchQuery(''); setSkillFilter([]); }}>
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {isDatabase
                      ? databaseEmptyState.title
                      : jobFilter
                        ? 'No candidates for this job yet'
                        : 'No active candidates'}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {isInterviewer
                      ? 'No candidates have been assigned to you yet.'
                      : isDatabase
                        ? databaseEmptyState.description
                        : !isDatabase && !jobFilter
                          ? 'Candidates appear here when assigned to an open job. Find unassigned candidates in the Database.'
                          : jobFilter
                            ? 'Add a candidate or share the public careers page.'
                            : 'Add your first candidate to get started.'}
                  </p>
                  <div className="flex gap-2 justify-center">
                    {canManageCandidates && (
                      <Button onClick={openCreate} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Candidate
                      </Button>
                    )}
                    {!isDatabase && !jobFilter && canManageCandidates && (
                      <Button variant="outline" onClick={() => window.location.href = '/database'} className="gap-2">
                        <Users className="h-4 w-4" />
                        Go to Database
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border">
            <div className="max-md:max-h-[calc(100dvh-12rem)] max-md:overflow-auto">
              <Table unwrapped>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 md:[&_th]:top-14 [&_th]:z-10 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[220px]">Candidate</TableHead>
                    <TableHead className="min-w-[180px]">Current Position</TableHead>
                    <TableHead className="min-w-[120px]">{isDatabase ? 'Jobs' : 'Job'}</TableHead>
                    <TableHead className="min-w-[80px]">Source</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    {!isDatabase && <TableHead className="min-w-[140px]">Scores</TableHead>}
                    <TableHead className="min-w-[160px]">{isDatabase ? 'Owner' : 'Assigned To'}</TableHead>
                    {showDatabaseTagsColumn && <TableHead className="min-w-[120px]">Tags</TableHead>}
                    {!isDatabase && <TableHead className="min-w-[180px]">Assessments</TableHead>}
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCandidates.map(candidate => {
                    const candidateAssignments = getCandidateAssignments(candidate.id);
                    const coverLetter = getCoverLetter(candidate.id);
                    const candidateStatus = (candidate as any).candidate_status || 'new';
                    const source = (candidate as any).source || 'manual';
                    const jobTitle = (candidate as any).job?.title || '';
                    const isMissingInfo = !candidate.email || !candidate.phone;
                    return (
                      <TableRow
                        key={candidate.id}
                        className={`group cursor-pointer ${isDatabase ? '[&_td]:py-2.5' : ''} ${isMissingInfo ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/30' : ''}`}
                        onClick={() => openCandidateDetail(candidate)}
                      >
                        {/* Candidate name, email, phone */}
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-primary">
                                {candidate.name}
                              </span>
                              {isMissingInfo && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-xs px-1.5 py-0 h-5">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Incomplete
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-0.5 mt-0.5">
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {candidate.email
                                  ? candidate.email
                                  : <span className="italic text-amber-500">No email — click to edit</span>}
                              </div>
                              {candidate.phone ? (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {candidate.phone}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 italic text-amber-500">
                                  <Phone className="h-3 w-3" />
                                  No phone — click to edit
                                </div>
                              )}
                              {(candidate as any).linkedin_url && (
                                <div className="flex items-center gap-1">
                                  <Linkedin className="h-3 w-3" />
                                  <a href={(candidate as any).linkedin_url.startsWith('http') ? (candidate as any).linkedin_url : `https://${(candidate as any).linkedin_url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[180px]">
                                    LinkedIn
                                  </a>
                                </div>
                              )}
                            </div>
                          {(candidate as any).ai_summary && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 max-w-[260px] leading-relaxed border-l-2 border-primary/30 pl-2">
                              {(candidate as any).ai_summary}
                            </p>
                          )}
                          {candidate.owner_name && !isDatabase && (
                            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground" title={`Owner: ${candidate.owner_name}`}>
                              <Crown className="h-2.5 w-2.5 text-amber-500 fill-amber-400 shrink-0" />
                              <span className="truncate max-w-[180px]">{candidate.owner_name}</span>
                            </div>
                          )}
                          </div>
                        </TableCell>
                        {/* Current Position */}
                        <TableCell>
                          <div className="space-y-1">
                            {((candidate as any).candidate_current_role || (candidate as any).candidate_current_company) ? (
                              <div>
                                {(candidate as any).candidate_current_role && (
                                  <div className="flex items-center gap-1 text-sm font-medium">
                                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                                    {(candidate as any).candidate_current_role}
                                  </div>
                                )}
                                {(candidate as any).candidate_current_company && (
                                  <div className="text-xs text-muted-foreground ml-5">
                                    at {(candidate as any).candidate_current_company}
                                  </div>
                                )}
                              </div>
                            ) : null}
                            {(showJobMatch && (candidate as any).suitability_score != null) ? (
                              <div className="flex items-center gap-1.5">
                                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                  (candidate as any).suitability_score >= 75 
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : (candidate as any).suitability_score >= 50 
                                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {(candidate as any).suitability_score}% Match
                                </span>
                              </div>
                            ) : (showJobMatch && (candidate as any).job_id) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary px-1"
                                onClick={(e) => { e.stopPropagation(); handleAnalyze(candidate.id); }}
                                disabled={analyzingId === candidate.id}
                              >
                                {analyzingId === candidate.id ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing...</>
                                ) : (
                                  <><Sparkles className="h-3 w-3" /> Analyze Job Match</>
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        {/* Job / Jobs */}
                        <TableCell>
                          {isDatabase ? (
                            (() => {
                              const summaries = candidatePipelineSummaryMap.get(candidate.id) || [];
                              if (summaries.length === 0) {
                                return <span className="text-xs text-muted-foreground italic">Not in pipeline</span>;
                              }
                              const [first, ...rest] = summaries;
                              return (
                                <div className="space-y-0.5">
                                  <span className="text-sm font-medium">
                                    {first.jobTitle} · {first.stageName}
                                  </span>
                                  {rest.length > 0 && (
                                    <span className="text-xs text-muted-foreground">+{rest.length} more</span>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                          (() => {
                            const candidateJob = jobs.find(j => j.id === (candidate as any).job_id);
                            const currentStage = candidateStageMap.get(candidate.id);
                            if (!candidateJob && !jobTitle) {
                              return <span className="text-sm text-muted-foreground">—</span>;
                            }
                            if (candidateJob && candidateJob.status !== 'open') {
                              return (
                                <div className="space-y-0.5">
                                  <span className="text-sm text-muted-foreground line-through">{candidateJob.title}</span>
                                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40 block w-fit">
                                    {candidateJob.status === 'closed' ? 'Job closed' : `Job ${candidateJob.status}`}
                                  </Badge>
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-0.5">
                                <span className="text-sm font-medium">{jobTitle}</span>
                                {currentStage && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <ChevronRight className="h-3 w-3 shrink-0" />{currentStage}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                          )}
                        </TableCell>
                        {/* Source */}
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {candidateSourceLabels[source] || source}
                          </Badge>
                        </TableCell>
                        {/* Status */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${candidateStatusColors[candidateStatus] || ''}`}
                            >
                              {candidateStatusLabels[candidateStatus] || candidateStatus}
                            </Badge>
                            {!TERMINAL_STATUSES.includes(candidateStatus) && (candidate as any).updated_at && (() => {
                              const days = getDaysStale((candidate as any).updated_at);
                              if (days >= 7) return (
                                <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                                  <Clock className="h-2.5 w-2.5" />{days}d stale
                                </span>
                              );
                              if (days >= 3) return (
                                <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  <Clock className="h-2.5 w-2.5" />{days}d stale
                                </span>
                              );
                              return null;
                            })()}
                          </div>
                        </TableCell>
                        {/* Scores — pipeline mode only */}
                        {!isDatabase && (
                        <TableCell>
                          <div className="space-y-2 min-w-[140px]">
                            {(candidate as any).parse_score > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] text-muted-foreground font-medium">Parse</span>
                                  <span className="text-[10px] font-semibold">{(candidate as any).parse_score}%</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                    style={{ width: `${(candidate as any).parse_score}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {(candidate as any).enrichment_score != null ? (
                              <div>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] text-muted-foreground font-medium">Enrich</span>
                                  <span className="text-[10px] font-semibold">{(candidate as any).enrichment_score}%</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-success transition-all duration-500"
                                    style={{ width: `${(candidate as any).enrichment_score}%` }}
                                  />
                                </div>
                              </div>
                            ) : (candidate as any).parse_score > 0 ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground border-dashed">
                                Not Enriched
                              </Badge>
                            ) : null}
                            {(candidate as any).credential_score != null && (candidate as any).credential_score > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] text-muted-foreground font-medium">Credential</span>
                                  <span className="text-[10px] font-semibold">{(candidate as any).credential_score}%</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-warning transition-all duration-500"
                                    style={{ width: `${(candidate as any).credential_score}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {!(candidate as any).parse_score && (candidate as any).enrichment_score == null && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        )}
                        {/* Owner / Assigned To */}
                        <TableCell>
                          {isDatabase ? (
                            candidate.owner_name ? (
                              <div className="flex items-center gap-1.5 text-sm font-medium" title={`Owner: ${candidate.owner_name}`}>
                                <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />
                                <span className="truncate max-w-[140px]">{candidate.owner_name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Unassigned</span>
                            )
                          ) : (() => {
                            const recruiters = recruiterMap.get(candidate.id) || [];
                            const interviewers = interviewerMap.get(candidate.id) || [];
                            if (recruiters.length === 0 && interviewers.length === 0) {
                              return <span className="text-xs text-muted-foreground">—</span>;
                            }
                            return (
                              <div className="space-y-1 text-xs">
                                {recruiters.map((r, idx) => (
                                  <div key={idx} className="flex items-center gap-1 text-muted-foreground" title={`${r.is_primary ? 'Primary ' : ''}Recruiter: ${r.recruiter_name}`}>
                                    <Briefcase className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[120px] font-medium text-foreground">{r.recruiter_name}</span>
                                    {r.is_primary && <Crown className="h-2.5 w-2.5 text-amber-500 fill-amber-400 shrink-0" />}
                                  </div>
                                ))}
                                {interviewers.map((iv, idx) => (
                                  <div key={idx} className="flex items-center gap-1 text-muted-foreground" title={`Interviewer: ${iv.interviewer_name}`}>
                                    <Users className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[120px]">{iv.interviewer_name}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </TableCell>
                        {showDatabaseTagsColumn && (
                          <TableCell>
                            {(pageTagsMap.get(candidate.id) || []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {(pageTagsMap.get(candidate.id) || []).map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {/* Assessments — pipeline mode only */}
                        {!isDatabase && (
                        <TableCell>
                          {candidateAssignments.length === 0 ? (
                            <span className="text-sm text-muted-foreground">None assigned</span>
                          ) : (
                            <div className="space-y-2">
                              {candidateAssignments.slice(0, 2).map(assignment => (
                                <div key={assignment.id} className="space-y-0.5">
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-xs whitespace-nowrap ${statusColors[assignment.status]}`}
                                  >
                                    {assignment.status.replace('_', ' ')}
                                  </Badge>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                      {assignment.assessment?.title}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 shrink-0"
                                      onClick={(e) => { e.stopPropagation(); copyMagicLink(assignment.access_token); }}
                                    >
                                      {copiedLink === assignment.access_token ? (
                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              {candidateAssignments.length > 2 && (
                                <span className="text-xs text-muted-foreground">
                                  +{candidateAssignments.length - 2} more
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        )}
                        {/* Actions - visible on hover */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isDatabase ? (
                                  <>
                                    {canManageCandidates && (candidateStatus === 'new' || candidateStatus === 'reviewing') && (
                                      <DropdownMenuItem onClick={() => openStatusDialog(candidate, 'shortlisted')}>
                                        <ThumbsUp className="h-4 w-4 mr-2" />
                                        Mark as Hired
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => {
                                      const link = `${window.location.origin}/hiring?view=list&profile=${candidate.id}`;
                                      navigator.clipboard.writeText(link);
                                      toast({ title: 'Profile link copied', description: 'Shareable link copied to clipboard' });
                                    }}>
                                      <LinkIcon className="h-4 w-4 mr-2" />
                                      Copy Profile Link
                                    </DropdownMenuItem>
                                    {canManageCandidates && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => openEdit(candidate)}>
                                          <Edit className="h-4 w-4 mr-2" />
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => openAddToJob(candidate)}>
                                          <Briefcase className="h-4 w-4 mr-2" />
                                          Add to Job
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleEnrich(candidate.id)}
                                          disabled={enrichingId === candidate.id}
                                        >
                                          <Sparkles className="h-4 w-4 mr-2" />
                                          {enrichingId === candidate.id ? 'Enriching...' : (candidate as any).enrichment_score != null ? 'Re-enrich' : 'Enrich Profile'}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setTagsCandidate(candidate)}>
                                          <Tag className="h-4 w-4 mr-2" />
                                          Manage Tags
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {canDeleteCandidates && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => handleDelete(candidate.id)}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                {/* Status actions - only for those who can manage */}
                                {canManageCandidates && candidateStatus === 'new' && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(candidate, 'reviewing')}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Mark as Reviewing
                                  </DropdownMenuItem>
                                )}
                                {canManageCandidates && (candidateStatus === 'new' || candidateStatus === 'reviewing') && (
                                  <DropdownMenuItem onClick={() => openStatusDialog(candidate, 'shortlisted')}>
                                    <ThumbsUp className="h-4 w-4 mr-2" />
                                    Mark as Hired
                                  </DropdownMenuItem>
                                )}
                                {canManageCandidates && candidateStatus !== 'rejected' && (
                                  <DropdownMenuItem onClick={() => openStatusDialog(candidate, 'rejected')}>
                                    <ThumbsDown className="h-4 w-4 mr-2" />
                                    Reject
                                  </DropdownMenuItem>
                                )}
                                {canManageCandidates && candidateStatus !== 'hold' && candidateStatus !== 'backout' && (
                                  <DropdownMenuItem onClick={() => openStatusDialog(candidate, 'hold')}>
                                    <Clock className="h-4 w-4 mr-2" />
                                    Put on Hold
                                  </DropdownMenuItem>
                                )}
                                {canManageCandidates && candidateStatus !== 'backout' && (
                                  <DropdownMenuItem onClick={() => openStatusDialog(candidate, 'backout')}>
                                    <UserX className="h-4 w-4 mr-2" />
                                    Mark as Backout
                                  </DropdownMenuItem>
                                )}
                                {coverLetter && (
                                  <DropdownMenuItem onClick={() => setCoverLetterDialog({ open: true, content: coverLetter })}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    View Cover Letter
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => {
                                  const link = `${window.location.origin}/hiring?view=list&profile=${candidate.id}`;
                                  navigator.clipboard.writeText(link);
                                  toast({ title: 'Profile link copied', description: 'Shareable link copied to clipboard' });
                                }}>
                                  <LinkIcon className="h-4 w-4 mr-2" />
                                  Copy Profile Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {canManageCandidates && (
                                  <>
                                    <DropdownMenuItem onClick={() => openAssign(candidate)}>
                                      <FileText className="h-4 w-4 mr-2" />
                                      Assign Assessment
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setPreScreenCandidate(candidate)}>
                                      <MessageSquare className="h-4 w-4 mr-2" />
                                      Pre-Screen
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {(isAdminOrHR || isRecruiter) && (
                                  <DropdownMenuItem onClick={() => setInterviewerDialog({ open: true, candidateId: candidate.id, candidateName: candidate.name })}>
                                    <Users className="h-4 w-4 mr-2" />
                                    Assign Interviewers
                                  </DropdownMenuItem>
                                )}
                                {isInterviewer && (
                                  <DropdownMenuItem onClick={() => handleOpenFeedback(candidate.id)}>
                                    <ClipboardEdit className="h-4 w-4 mr-2" />
                                    Add Feedback
                                  </DropdownMenuItem>
                                )}
                                {canManageCandidates && (candidate as any).job_id && (
                                  <DropdownMenuItem onClick={() => handleAnalyze(candidate.id)} disabled={analyzingId === candidate.id}>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    {analyzingId === candidate.id ? 'Analyzing...' : 'Analyze Job Match'}
                                  </DropdownMenuItem>
                                )}
                                {canManageCandidates && (
                                  <>
                                    <DropdownMenuItem onClick={() => openEdit(candidate)}>
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleEnrich(candidate.id)} 
                                      disabled={enrichingId === candidate.id}
                                    >
                                      <Sparkles className="h-4 w-4 mr-2" />
                                      {enrichingId === candidate.id ? 'Enriching...' : (candidate as any).enrichment_score != null ? 'Re-enrich Profile' : 'Enrich Profile'}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {canDeleteCandidates && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => handleDelete(candidate.id)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
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
        )}

        {/* Pagination */}
        {filteredCandidates.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <span>
                {listTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, listTotal)} of {listTotal}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</Button>
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>‹</Button>
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages}>›</Button>
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>»</Button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Candidate Dialog */}
        <Dialog open={isFormOpen} onOpenChange={handleFormOpenChange}>
          <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedCandidate ? 'Edit Candidate' : 'Add Candidate'}</DialogTitle>
              <DialogDescription>
                {selectedCandidate
                  ? 'Update candidate information.'
                  : addMode === 'bulk'
                    ? 'Upload multiple resumes — each will be parsed and added automatically.'
                    : 'Upload a resume to auto-fill details, then review and save.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!selectedCandidate && (
                <Tabs value={addMode} onValueChange={(v) => setAddMode(v as 'single' | 'bulk')}>
                  <TabsList className="w-full">
                    <TabsTrigger value="single" className="flex-1">Single</TabsTrigger>
                    <TabsTrigger value="bulk" className="flex-1">Bulk Resumes</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              {!selectedCandidate && addMode === 'bulk' && (
                <BulkResumeUploadPanel
                  active={isFormOpen}
                  defaultJobId={jobFilter || form.job_id || undefined}
                  onClose={() => handleFormOpenChange(false)}
                  embedded
                />
              )}

              {(selectedCandidate || addMode === 'single') && (
              <>
              {/* Resume Upload Section */}
              {(selectedCandidate || addMode === 'single') && (
              <div className="space-y-2">
                <Label>Upload Resume (PDF/Word)</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleResumeUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isParsing}
                    className="gap-2"
                  >
                    {isUploading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                    ) : isParsing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Parsing with AI...</>
                    ) : (
                      <><Upload className="h-4 w-4" /> Upload CV to Auto-fill</>
                    )}
                  </Button>
                  {form.resume_url && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <button
                        type="button"
                        onClick={() => openResumeUrl(form.resume_url)}
                        className="text-primary underline"
                      >
                        {selectedCandidate ? 'View Resume' : 'Resume uploaded'}
                      </button>
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  AI will extract candidate details from the resume automatically.
                </p>
              </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Rahul Sharma"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="rahul@example.com"
                    value={form.email}
                    onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    placeholder="https://linkedin.com/in/rahulsharma"
                    value={form.linkedin_url}
                    onChange={(e) => setForm(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Apply for Job</Label>
                  <Select
                    value={form.job_id}
                    onValueChange={(value) => setForm(prev => ({ ...prev, job_id: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific job</SelectItem>
                      {jobs.map(job => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.title}{job.status !== 'open' ? ` (${job.status})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Role Applied</Label>
                  <Input
                    id="role"
                    placeholder="Frontend Developer"
                    value={form.role_applied}
                    onChange={(e) => setForm(prev => ({ ...prev, role_applied: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={form.source}
                    onValueChange={(value) => setForm(prev => ({ ...prev, source: value, referred_by: value !== 'referral' ? '' : prev.referred_by }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(candidateSourceLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Referred by — only shown when source = referral */}
              {form.source === 'referral' && (
                <div className="space-y-2">
                  <Label htmlFor="referred_by">Referred by <span className="text-muted-foreground font-normal text-xs">(employee name)</span></Label>
                  <Input
                    id="referred_by"
                    placeholder="e.g. Rahul Mehta — Engineering"
                    value={form.referred_by}
                    onChange={(e) => setForm(prev => ({ ...prev, referred_by: e.target.value }))}
                  />
                </div>
              )}

              {/* Current Position */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="current_role">Current Role</Label>
                  <Input
                    id="current_role"
                    placeholder="Software Engineer"
                    value={form.candidate_current_role}
                    onChange={(e) => setForm(prev => ({ ...prev, candidate_current_role: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_company">Current Company</Label>
                  <Input
                    id="current_company"
                    placeholder="Google"
                    value={form.candidate_current_company}
                    onChange={(e) => setForm(prev => ({ ...prev, candidate_current_company: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="experience_years">Experience (Years)</Label>
                  <Input
                    id="experience_years"
                    type="number"
                    placeholder="5"
                    value={form.experience_years ?? ''}
                    onChange={(e) => setForm(prev => ({ ...prev, experience_years: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skills">Skills (comma separated)</Label>
                  <Input
                    id="skills"
                    placeholder="React, TypeScript, Node.js"
                    value={form.skills}
                    onChange={(e) => setForm(prev => ({ ...prev, skills: e.target.value }))}
                  />
                </div>
              </div>

              {/* Work Experience Section */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1 text-base font-semibold">
                    <Building2 className="h-4 w-4" />
                    Work Experience
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm(prev => ({ ...prev, work_experience: [...(prev.work_experience || []), { company: '', title: '', start_date: '', end_date: '', description: '' }] }))}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {(!form.work_experience || form.work_experience.length === 0) && (
                  <p className="text-sm text-muted-foreground">No experience added. Upload a resume to auto-fill or add manually.</p>
                )}
                {(form.work_experience || []).map((exp: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Experience {idx + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm(prev => ({ ...prev, work_experience: (prev.work_experience || []).filter((_: any, i: number) => i !== idx) }))}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input placeholder="Company" value={exp.company || ''} onChange={e => setForm(prev => ({ ...prev, work_experience: (prev.work_experience || []).map((item: any, i: number) => i === idx ? { ...item, company: e.target.value } : item) }))} />
                      <Input placeholder="Job Title" value={exp.title || ''} onChange={e => setForm(prev => ({ ...prev, work_experience: (prev.work_experience || []).map((item: any, i: number) => i === idx ? { ...item, title: e.target.value } : item) }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input placeholder="Start (e.g. 2020-01)" value={exp.start_date || ''} onChange={e => setForm(prev => ({ ...prev, work_experience: (prev.work_experience || []).map((item: any, i: number) => i === idx ? { ...item, start_date: e.target.value } : item) }))} />
                      <Input placeholder="End (e.g. Present)" value={exp.end_date || ''} onChange={e => setForm(prev => ({ ...prev, work_experience: (prev.work_experience || []).map((item: any, i: number) => i === idx ? { ...item, end_date: e.target.value } : item) }))} />
                    </div>
                    <Textarea placeholder="Brief description of role" value={exp.description || ''} rows={2} onChange={e => setForm(prev => ({ ...prev, work_experience: (prev.work_experience || []).map((item: any, i: number) => i === idx ? { ...item, description: e.target.value } : item) }))} />
                  </div>
                ))}
              </div>

              {/* Education Section */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1 text-base font-semibold">
                    <GraduationCap className="h-4 w-4" />
                    Education
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, education: [...(prev.education || []), { institution: '', degree: '', field: '', start_date: '', end_date: '' }] }))}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {(!form.education || form.education.length === 0) && (
                  <p className="text-sm text-muted-foreground">No education added. Upload a resume to auto-fill or add manually.</p>
                )}
                {(form.education || []).map((edu: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Education {idx + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm(prev => ({ ...prev, education: (prev.education || []).filter((_: any, i: number) => i !== idx) }))}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input placeholder="Institution" value={edu.institution || ''} onChange={e => setForm(prev => ({ ...prev, education: (prev.education || []).map((item: any, i: number) => i === idx ? { ...item, institution: e.target.value } : item) }))} />
                      <Input placeholder="Degree" value={edu.degree || ''} onChange={e => setForm(prev => ({ ...prev, education: (prev.education || []).map((item: any, i: number) => i === idx ? { ...item, degree: e.target.value } : item) }))} />
                    </div>
                    <Input placeholder="Field of Study" value={edu.field || ''} onChange={e => setForm(prev => ({ ...prev, education: (prev.education || []).map((item: any, i: number) => i === idx ? { ...item, field: e.target.value } : item) }))} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input placeholder="Start Year" value={edu.start_date || ''} onChange={e => setForm(prev => ({ ...prev, education: (prev.education || []).map((item: any, i: number) => i === idx ? { ...item, start_date: e.target.value } : item) }))} />
                      <Input placeholder="End Year" value={edu.end_date || ''} onChange={e => setForm(prev => ({ ...prev, education: (prev.education || []).map((item: any, i: number) => i === idx ? { ...item, end_date: e.target.value } : item) }))} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Certifications Section */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1 text-base font-semibold">
                    <Award className="h-4 w-4" />
                    Certifications
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, certifications: [...(prev.certifications || []), { name: '', issuer: '', year: '' }] }))}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {(!form.certifications || form.certifications.length === 0) && (
                  <p className="text-sm text-muted-foreground">No certifications added. Upload a resume to auto-fill or add manually.</p>
                )}
                {(form.certifications || []).map((cert: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        Certification {idx + 1}
                        {cert.tier && <Badge variant="outline" className="ml-2 text-[10px]">Tier {cert.tier}</Badge>}
                        {cert.is_premium && <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-800 border-amber-300">🏅 Premium</Badge>}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm(prev => ({ ...prev, certifications: (prev.certifications || []).filter((_: any, i: number) => i !== idx) }))}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input placeholder="Certification Name" className="sm:col-span-2" value={cert.name || ''} onChange={e => setForm(prev => ({ ...prev, certifications: (prev.certifications || []).map((item: any, i: number) => i === idx ? { ...item, name: e.target.value } : item) }))} />
                      <Input placeholder="Year" value={cert.year || ''} onChange={e => setForm(prev => ({ ...prev, certifications: (prev.certifications || []).map((item: any, i: number) => i === idx ? { ...item, year: e.target.value } : item) }))} />
                    </div>
                    <Input placeholder="Issuer (e.g. AWS, PMI)" value={cert.issuer || ''} onChange={e => setForm(prev => ({ ...prev, certifications: (prev.certifications || []).map((item: any, i: number) => i === idx ? { ...item, issuer: e.target.value } : item) }))} />
                  </div>
                ))}
              </div>

              {/* Awards Section */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1 text-base font-semibold">
                    <Medal className="h-4 w-4" />
                    Awards & Achievements
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, awards: [...(prev.awards || []), { title: '', issuer: '', year: '' }] }))}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {(!form.awards || form.awards.length === 0) && (
                  <p className="text-sm text-muted-foreground">No awards added. Upload a resume to auto-fill or add manually.</p>
                )}
                {(form.awards || []).map((award: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Award {idx + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm(prev => ({ ...prev, awards: (prev.awards || []).filter((_: any, i: number) => i !== idx) }))}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input placeholder="Award Title" className="sm:col-span-2" value={award.title || ''} onChange={e => setForm(prev => ({ ...prev, awards: (prev.awards || []).map((item: any, i: number) => i === idx ? { ...item, title: e.target.value } : item) }))} />
                      <Input placeholder="Year" value={award.year || ''} onChange={e => setForm(prev => ({ ...prev, awards: (prev.awards || []).map((item: any, i: number) => i === idx ? { ...item, year: e.target.value } : item) }))} />
                    </div>
                    <Input placeholder="Issuer / Organization" value={award.issuer || ''} onChange={e => setForm(prev => ({ ...prev, awards: (prev.awards || []).map((item: any, i: number) => i === idx ? { ...item, issuer: e.target.value } : item) }))} />
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the candidate..."
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Credential Score (read-only if parsed) */}
              {form.credential_score != null && (
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                  <Award className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium">Credential Score:</span>
                  <span className="text-sm font-bold text-amber-700">{form.credential_score}/100</span>
                  <span className="text-xs text-muted-foreground ml-auto">Auto-calculated from certifications & education</span>
                </div>
              )}
              </>
              )}
            </div>
            {(selectedCandidate || addMode === 'single') && (
            <DialogFooter>
              <Button variant="outline" onClick={() => handleFormOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={isPending || isUploading || isParsing || !form.name.trim() || !form.email.trim()}>
                {isPending ? 'Saving...' : selectedCandidate ? 'Update' : 'Add Candidate'}
              </Button>
            </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {/* Cover Letter Dialog */}
        <Dialog open={coverLetterDialog.open} onOpenChange={(open) => setCoverLetterDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cover Letter</DialogTitle>
            </DialogHeader>
            <div className="whitespace-pre-wrap text-sm text-muted-foreground max-h-[400px] overflow-y-auto">
              {coverLetterDialog.content}
            </div>
          </DialogContent>
        </Dialog>

        {/* Status Change Dialog */}
        <Dialog open={statusDialog.open} onOpenChange={(open) => !open && setStatusDialog({ open: false, candidate: null, status: '', reason: '', sendEmail: false })}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {candidateStatusLabels[statusDialog.status] || statusDialog.status} — {statusDialog.candidate?.name}
              </DialogTitle>
              <DialogDescription>
                Change status to <strong>{candidateStatusLabels[statusDialog.status]}</strong>. You can optionally send an email notification.
              </DialogDescription>
            </DialogHeader>
            {(statusDialog.status === 'rejected' || statusDialog.status === 'hold' || statusDialog.status === 'backout') && (
              <Textarea
                placeholder={statusDialog.sendEmail && (statusDialog.status === 'rejected' || statusDialog.status === 'backout')
                  ? 'Reason (required when sending email)...'
                  : 'Reason (optional)...'}
                value={statusDialog.reason}
                onChange={(e) => setStatusDialog(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-email-toggle"
                checked={statusDialog.sendEmail}
                onCheckedChange={(checked) => setStatusDialog(prev => ({ ...prev, sendEmail: !!checked }))}
              />
              <label htmlFor="send-email-toggle" className="text-sm font-medium cursor-pointer">
                Send email notification to candidate
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialog({ open: false, candidate: null, status: '', reason: '', sendEmail: false })}>Cancel</Button>
              <Button
                variant={statusDialog.status === 'rejected' || statusDialog.status === 'backout' ? 'destructive' : 'default'}
                onClick={confirmStatusChange}
              >
                {statusDialog.sendEmail ? `${candidateStatusLabels[statusDialog.status]} & Send Email` : `${candidateStatusLabels[statusDialog.status]}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Assessment Dialog */}
        {selectedCandidate && (
          <AssignAssessmentDialog
            open={isAssignOpen}
            onOpenChange={setIsAssignOpen}
            candidate={selectedCandidate}
          />
        )}

        {/* Add to Job Dialog */}
        {addToJobCandidate && (
          <AddToJobDialog
            open={!!addToJobCandidate}
            onOpenChange={(open) => { if (!open) setAddToJobCandidate(null); }}
            candidate={addToJobCandidate}
          />
        )}

        {tagsCandidate && (
          <ManageTagsDialog
            open={!!tagsCandidate}
            onOpenChange={(open) => { if (!open) setTagsCandidate(null); }}
            candidate={tagsCandidate}
          />
        )}

        {/* Bulk Import Dialog */}
        <BulkImportDialog
          open={isBulkImportOpen}
          onOpenChange={setIsBulkImportOpen}
        />

        {/* Bulk Resume Upload Dialog */}
        <BulkResumeUploadDialog
          open={isBulkResumeOpen}
          onOpenChange={setIsBulkResumeOpen}
        />
        {/* Pre-Screen Dialog */}
        {preScreenCandidate && (
          <PreScreenDialog
            open={!!preScreenCandidate}
            onOpenChange={(open) => !open && setPreScreenCandidate(null)}
            candidateId={preScreenCandidate.id}
            candidateName={preScreenCandidate.name}
          />
        )}

        {/* Access Denied Dialog for shared profile links */}
        <Dialog open={profileAccessDenied} onOpenChange={(open) => {
          if (!open) {
            setProfileAccessDenied(false);
            searchParams.delete('profile');
            setSearchParams(searchParams, { replace: true });
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Access Denied
              </DialogTitle>
              <DialogDescription>
                You do not have permission to view this candidate's profile. Please contact your administrator to request access.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setProfileAccessDenied(false);
                searchParams.delete('profile');
                setSearchParams(searchParams, { replace: true });
              }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Candidate Detail Drawer */}
        <InterviewKitDrawer {...interviewKitDrawerProps} />
        <CandidateDetailDrawer
          candidate={detailCandidate}
          open={detailOpen}
          drawerContext={isDatabase ? 'database' : 'application'}
          onAddToJob={isDatabase && canManageCandidates ? openAddToJob : undefined}
          onEdit={isDatabase && canManageCandidates ? openEdit : undefined}
          onOpenChange={(open) => {
            if (!open) closeDetailCandidate();
          }}
          onEnrich={handleEnrich}
          isEnriching={enrichingId === detailCandidate?.id}
          isInterviewerOnly={isInterviewer && !isAdminOrHR}
          onAddFeedback={isInterviewer ? handleOpenFeedback : undefined}
          {...candidateDrawerKitProps}
        />
        {drawerBackdropOpen && (
          <button
            type="button"
            aria-label="Close drawer"
            className="fixed inset-0 z-[39] bg-black/80 animate-in fade-in-0"
            onClick={closeAll}
          />
        )}

        {/* Assign Interviewers Dialog */}
        <AssignInterviewersDialog
          open={interviewerDialog.open}
          onOpenChange={(open) => !open && setInterviewerDialog({ open: false, candidateId: '', candidateName: '' })}
          candidateId={interviewerDialog.candidateId}
          candidateName={interviewerDialog.candidateName}
        />

        {/* Interview Feedback Dialog */}
        <InterviewFeedbackDialog
          open={feedbackDialog.open}
          onOpenChange={(open) => !open && setFeedbackDialog({ open: false, interview: null })}
          interview={feedbackDialog.interview}
          onSubmit={handleFeedbackSubmit}
          isSubmitting={feedbackSubmitting}
        />
      </main>
    </>
  );

  if (embedded) return candidatesContent;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onAddCandidate={canManageCandidates ? openCreate : undefined} />
      {candidatesContent}
      <Footer />
    </div>
  );
}
