import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, X, Loader2, Briefcase, Mail, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';

type FileStatus = 'pending' | 'uploading' | 'parsing' | 'saving' | 'done' | 'error' | 'saved_incomplete';

interface ResumeFile {
  file: File;
  id: string;
  status: FileStatus;
  error?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidateId?: string;
  parsedData?: any;
  publicUrl?: string;
  manualEmail?: string;
}

export interface BulkResumeUploadPanelProps {
  active: boolean;
  defaultJobId?: string;
  onClose?: () => void;
  embedded?: boolean;
}

interface BulkResumeUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultJobId?: string;
}

interface JobOption {
  id: string;
  title: string;
}

const VALID_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function BulkResumeUploadPanel({ active, defaultJobId, onClose, embedded }: BulkResumeUploadPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ResumeFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string>(defaultJobId || '');
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);

  const isRecruiter = role === 'recruiter';
  const isAdminOrHr = role === 'admin' || role === 'hr';

  useEffect(() => {
    if (!active) return;
    const fetchJobs = async () => {
      setLoadingJobs(true);
      if (isRecruiter && user) {
        const { data: assignments } = await supabase
          .from('job_recruiters')
          .select('job_id')
          .eq('recruiter_user_id', user.id);

        const jobIds = (assignments || []).map(a => a.job_id);
        if (jobIds.length > 0) {
          const { data } = await supabase
            .from('jobs')
            .select('id, title')
            .in('id', jobIds)
            .order('title');
          setJobs(data || []);
        } else {
          setJobs([]);
        }
      } else {
        const { data } = await supabase
          .from('jobs')
          .select('id, title')
          .order('title');
        setJobs(data || []);
      }
      setLoadingJobs(false);
    };
    fetchJobs();
  }, [active, isRecruiter, user]);

  useEffect(() => {
    if (active) {
      setSelectedJobId(defaultJobId || '');
    }
  }, [active, defaultJobId]);

  useEffect(() => {
    if (!active && !isProcessing) {
      setFiles([]);
      setProcessedCount(0);
    }
  }, [active, isProcessing]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: ResumeFile[] = [];
    const errors: string[] = [];

    Array.from(fileList).forEach(file => {
      if (!VALID_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Not a PDF or Word file`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: Exceeds 10MB limit`);
        return;
      }
      if (files.some(f => f.file.name === file.name && f.file.size === file.size)) {
        return;
      }
      newFiles.push({
        file,
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        status: 'pending',
      });
    });

    if (errors.length > 0) {
      toast({
        variant: 'destructive',
        title: `${errors.length} file(s) skipped`,
        description: errors.slice(0, 3).join('\n'),
      });
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, [files, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFile = (id: string, patch: Partial<ResumeFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  const addEmailToCandidate = async (rf: ResumeFile) => {
    const email = rf.manualEmail?.trim();
    if (!email || !email.includes('@')) {
      toast({ variant: 'destructive', title: 'Enter a valid email address' });
      return;
    }
    if (!rf.candidateId) return;

    setSavingEmailId(rf.id);
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ email })
        .eq('id', rf.candidateId);

      if (error) {
        throw new Error(
          error.message.includes('duplicate')
            ? `${email} already exists`
            : error.message
        );
      }

      updateFile(rf.id, { status: 'done', candidateEmail: email });
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
    } catch (err: any) {
      updateFile(rf.id, { status: 'saved_incomplete', error: err.message });
      toast({ variant: 'destructive', title: 'Update failed', description: err.message });
    } finally {
      setSavingEmailId(null);
    }
  };

  const processFiles = async () => {
    setIsProcessing(true);
    setProcessedCount(0);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const jobId = (selectedJobId && selectedJobId !== '__none__') ? selectedJobId : null;
    let successCount = 0;
    let failCount = 0;
    let incompleteCount = 0;

    for (let i = 0; i < files.length; i++) {
      const rf = files[i];
      if (rf.status === 'done' || rf.status === 'saved_incomplete') {
        setProcessedCount(prev => prev + 1);
        if (rf.status === 'done') successCount++;
        else incompleteCount++;
        continue;
      }

      try {
        updateFile(rf.id, { status: 'uploading' });
        const fileExt = rf.file.name.split('.').pop();
        const storageName = `bulk-${authUser?.id}-${Date.now()}-${i}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('resumes').upload(storageName, rf.file);
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        updateFile(rf.id, { status: 'parsing' });
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
          body: { resume_url: storageName, ...getDevGeminiKeyBody() },
        });

        if (parseError) throw new Error(`Parse failed: ${parseError.message}`);

        if (!parseData?.success || !parseData?.data) {
          throw new Error(parseData?.error || 'No data extracted from resume');
        }

        const extracted = parseData.data;
        const candidateName = extracted.full_name || rf.file.name.replace(/\.[^/.]+$/, '');
        const candidateEmail = extracted.email || null;

        updateFile(rf.id, { status: 'saving' });
        const { data: inserted, error: insertError } = await supabase
          .from('candidates')
          .insert({
            name: candidateName,
            email: candidateEmail,
            phone: extracted.phone || null,
            linkedin_url: extracted.linkedin_url || null,
            role_applied: extracted.current_role || null,
            skills: (extracted.skills || []) as unknown as Json,
            resume_url: storageName,
            parse_score: extracted.parse_score || 0,
            experience_years: extracted.experience_years || null,
            candidate_current_role: extracted.current_role || null,
            candidate_current_company: extracted.current_company || null,
            work_experience: extracted.work_experience as unknown as Json || null,
            education: extracted.education as unknown as Json || null,
            certifications: extracted.certifications as unknown as Json || null,
            awards: extracted.awards as unknown as Json || null,
            credential_score: extracted.credential_score || null,
            source: 'bulk_resume',
            created_by: authUser?.id,
            uploaded_by: authUser?.id || null,
            job_id: jobId,
          } as any)
          .select('id')
          .single();

        if (insertError) {
          if (insertError.message.includes('duplicate') || insertError.code === '23505') {
            updateFile(rf.id, {
              status: 'error',
              error: `Skipped — ${candidateEmail ?? 'candidate'} already exists in the system`,
            });
            setProcessedCount(prev => prev + 1);
            failCount++;
            continue;
          }
          throw new Error(insertError.message);
        }

        if (inserted?.id && jobId && authUser?.id && isRecruiter) {
          const { data: existing } = await supabase
            .from('job_recruiters')
            .select('id')
            .eq('job_id', jobId)
            .eq('recruiter_user_id', authUser.id)
            .maybeSingle();
          if (!existing) {
            const { data: hasPrimary } = await supabase
              .from('job_recruiters')
              .select('id')
              .eq('job_id', jobId)
              .eq('is_primary', true)
              .maybeSingle();
            await supabase.from('job_recruiters').insert({
              job_id: jobId,
              recruiter_user_id: authUser.id,
              assigned_by: authUser.id,
              is_primary: !hasPrimary,
            } as any);
          }
        }

        if (!candidateEmail) {
          updateFile(rf.id, {
            status: 'saved_incomplete',
            candidateName,
            candidateId: inserted?.id,
            parsedData: extracted,
          });
          incompleteCount++;
        } else {
          updateFile(rf.id, { status: 'done', candidateName, candidateEmail });
          successCount++;
        }
      } catch (err: any) {
        updateFile(rf.id, { status: 'error', error: err.message });
        failCount++;
      }

      setProcessedCount(prev => prev + 1);
    }

    setIsProcessing(false);
    await queryClient.invalidateQueries({ queryKey: ['candidates'] });
    await queryClient.invalidateQueries({ queryKey: ['pending-approval'] });
    await queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });

    const parts = [`${successCount} added`];
    if (incompleteCount > 0) parts.push(`${incompleteCount} saved (missing info)`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    toast({
      title: 'Bulk upload complete',
      description: `${parts.join(', ')} out of ${files.length} resumes`,
    });
  };

  const handleClose = () => {
    if (isProcessing) return;
    setFiles([]);
    setProcessedCount(0);
    onClose?.();
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const incompleteCount = files.filter(f => f.status === 'saved_incomplete').length;
  const progress = files.length > 0 ? (processedCount / files.length) * 100 : 0;

  const canProcess = pendingCount > 0 && !isProcessing && (!isRecruiter || selectedJobId);

  const statusIcon = (status: FileStatus) => {
    switch (status) {
      case 'pending':
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'uploading':
      case 'parsing':
      case 'saving':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'saved_incomplete':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const statusLabel = (status: FileStatus) => {
    switch (status) {
      case 'pending': return 'Queued';
      case 'uploading': return 'Uploading…';
      case 'parsing': return 'AI Parsing…';
      case 'saving': return 'Saving…';
      case 'done': return 'Done';
      case 'saved_incomplete': return 'Saved (incomplete)';
      case 'error': return 'Failed';
    }
  };

  const selectedJobName = jobs.find(j => j.id === selectedJobId)?.title;

  const footerButtons = (
    <>
      <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
        {doneCount > 0 && !isProcessing ? 'Done' : 'Cancel'}
      </Button>
      {pendingCount > 0 && !isProcessing && (
        <Button onClick={processFiles} disabled={!canProcess} className="gap-2">
          <Upload className="h-4 w-4" />
          Process {pendingCount} Resume{pendingCount !== 1 ? 's' : ''}
        </Button>
      )}
    </>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">
              Assign to Job
              {isRecruiter && <span className="text-destructive ml-1">*</span>}
            </label>
          </div>
          {loadingJobs ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {isRecruiter
                ? 'No jobs assigned to you. Contact an admin to assign you to a job first.'
                : 'No jobs available. Create a job first.'}
            </p>
          ) : (
            <Select value={selectedJobId} onValueChange={setSelectedJobId} disabled={isProcessing}>
              <SelectTrigger>
                <SelectValue placeholder={isRecruiter ? 'Select a job (required)' : 'Select a job (optional)'} />
              </SelectTrigger>
              <SelectContent>
                {isAdminOrHr && (
                  <SelectItem value="__none__">— No job (unassigned) —</SelectItem>
                )}
                {jobs.map(j => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isRecruiter && !selectedJobId && (
            <p className="text-xs text-destructive">Please select a job to upload resumes for.</p>
          )}
        </div>

        {!isProcessing && (
          <div
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-1">
              Drop resumes here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              PDF or Word files, up to 10MB each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Processing {processedCount} of {files.length}…
              </span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {files.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{files.length} file{files.length !== 1 ? 's' : ''}</Badge>
            {selectedJobName && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                {selectedJobName}
              </Badge>
            )}
            {doneCount > 0 && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                {doneCount} done
              </Badge>
            )}
            {incompleteCount > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
                {incompleteCount} incomplete
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
                {errorCount} failed
              </Badge>
            )}
            {pendingCount > 0 && !isProcessing && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
                {pendingCount} ready
              </Badge>
            )}
          </div>
        )}

        {files.length > 0 && (
          <ScrollArea className="h-[220px] border rounded-lg">
            <div className="divide-y">
              {files.map(rf => (
                <div
                  key={rf.id}
                  className={`px-4 py-3 ${rf.status === 'saved_incomplete' ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {statusIcon(rf.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {rf.candidateName || rf.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {rf.status === 'done'
                          ? `→ ${rf.candidateName} (${rf.candidateEmail})`
                          : rf.status === 'saved_incomplete'
                          ? 'Saved — email missing. Add it below or edit on the Candidates page.'
                          : rf.status === 'error'
                          ? rf.error
                          : `${(rf.file.size / 1024).toFixed(0)} KB`}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        rf.status === 'done'
                          ? 'text-green-600 shrink-0'
                          : rf.status === 'saved_incomplete'
                          ? 'text-amber-600 border-amber-300 shrink-0'
                          : rf.status === 'error'
                          ? 'text-destructive shrink-0'
                          : 'shrink-0'
                      }
                    >
                      {statusLabel(rf.status)}
                    </Badge>
                    {rf.status === 'pending' && !isProcessing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => removeFile(rf.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {rf.status === 'saved_incomplete' && (
                    <div className="mt-2 flex gap-2 pl-7">
                      <Input
                        type="email"
                        placeholder="Add email (optional)"
                        value={rf.manualEmail || ''}
                        onChange={e => updateFile(rf.id, { manualEmail: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addEmailToCandidate(rf); }}
                        className="h-8 text-sm"
                        disabled={savingEmailId === rf.id}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0"
                        onClick={() => addEmailToCandidate(rf)}
                        disabled={!rf.manualEmail?.includes('@') || savingEmailId === rf.id}
                      >
                        {savingEmailId === rf.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Mail className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {embedded ? (
        <div className="flex justify-end gap-2 pt-4 border-t">
          {footerButtons}
        </div>
      ) : (
        <DialogFooter className="shrink-0 pt-2 border-t">
          {footerButtons}
        </DialogFooter>
      )}
    </>
  );
}

export function BulkResumeUploadDialog({ open, onOpenChange, defaultJobId }: BulkResumeUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90dvh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Bulk Resume Upload</DialogTitle>
          <DialogDescription>
            Upload multiple resumes (PDF/Word). Each will be parsed by AI and added as a candidate automatically.
          </DialogDescription>
        </DialogHeader>
        <BulkResumeUploadPanel
          active={open}
          defaultJobId={defaultJobId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
