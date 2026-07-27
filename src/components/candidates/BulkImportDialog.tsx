import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, AlertCircle, AlertTriangle, CheckCircle2, X, Download, ArrowRight, ArrowLeft, Pencil, Briefcase, Building2, Tags } from 'lucide-react';
import { useVendors } from '@/hooks/useVendors';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

type Step = 'upload' | 'map' | 'preview' | 'done';

interface ParsedCandidate {
  rowNumber: number;
  name: string;
  email: string;
  phone?: string;
  role_applied?: string;
  candidate_current_role?: string;
  candidate_current_company?: string;
  experience_years?: number;
  skills?: string[];
  notes?: string;
  linkedin_url?: string;
  current_location?: string;
  preferred_location?: string;
  isValid: boolean;
  isDuplicate: boolean;
  warnings: string[];
  errors: string[];
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Field definitions ────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: '__skip__', label: '— Skip column —' },
  { value: 'name', label: 'Full Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'role_applied', label: 'Role Applied' },
  { value: 'candidate_current_role', label: 'Current Role' },
  { value: 'candidate_current_company', label: 'Current Company' },
  { value: 'experience_years', label: 'Experience (Years)' },
  { value: 'skills', label: 'Skills' },
  { value: 'notes', label: 'Notes / Summary' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'current_location', label: 'Current Location' },
  { value: 'preferred_location', label: 'Preferred Location' },
];

const COLUMN_ALIASES: Record<string, string> = {
  name: 'name', full_name: 'name', fullname: 'name', 'full name': 'name',
  candidate_name: 'name', 'candidate name': 'name', 'applicant name': 'name',
  'first name': 'name', first_name: 'name', 'name of candidate': 'name',
  'applicant': 'name', 'prospect name': 'name',
  email: 'email', email_address: 'email', 'email address': 'email',
  'email id': 'email', 'e-mail': 'email', 'e-mail id': 'email',
  'applicant email': 'email', 'email address 1': 'email',
  phone: 'phone', phone_number: 'phone', 'phone number': 'phone',
  mobile: 'phone', mobile_number: 'phone', 'mobile number': 'phone',
  cell: 'phone', 'contact number': 'phone', 'contact no': 'phone',
  'phone no': 'phone', 'mobile no': 'phone', telephone: 'phone',
  role: 'role_applied', role_applied: 'role_applied', position: 'role_applied',
  job_title: 'role_applied', 'job title': 'role_applied',
  'applied for': 'role_applied', applied_for: 'role_applied',
  'desired role': 'role_applied', 'applying for': 'role_applied',
  'position applied': 'role_applied', 'position applied for': 'role_applied',
  current_role: 'candidate_current_role', 'current role': 'candidate_current_role',
  current_title: 'candidate_current_role', 'current title': 'candidate_current_role',
  'current designation': 'candidate_current_role', designation: 'candidate_current_role',
  headline: 'candidate_current_role', 'job function': 'candidate_current_role',
  'present designation': 'candidate_current_role', 'designation/role': 'candidate_current_role',
  company: 'candidate_current_company', current_company: 'candidate_current_company',
  'current company': 'candidate_current_company', employer: 'candidate_current_company',
  organization: 'candidate_current_company', organisation: 'candidate_current_company',
  company_name: 'candidate_current_company', 'company name': 'candidate_current_company',
  'present company': 'candidate_current_company', 'current employer': 'candidate_current_company',
  'latest company': 'candidate_current_company',
  experience: 'experience_years', experience_years: 'experience_years',
  years_of_experience: 'experience_years', 'years of experience': 'experience_years',
  exp: 'experience_years', exp_years: 'experience_years', yoe: 'experience_years',
  total_experience: 'experience_years', 'total experience': 'experience_years',
  'experience (years)': 'experience_years', 'experience (in years)': 'experience_years',
  'total exp': 'experience_years', 'total exp (years)': 'experience_years',
  'work experience': 'experience_years', 'years exp': 'experience_years',
  skills: 'skills', skill_set: 'skills', skillset: 'skills',
  technologies: 'skills', tech_stack: 'skills', 'tech stack': 'skills',
  'key skills': 'skills', key_skills: 'skills', expertise: 'skills',
  'skill set': 'skills', 'primary skills': 'skills', 'technical skills': 'skills',
  notes: 'notes', note: 'notes', comments: 'notes', remarks: 'notes',
  summary: 'notes', bio: 'notes', additional_info: 'notes', description: 'notes',
  'notice period': 'notes', notice_period: 'notes',
  linkedin: 'linkedin_url', linkedin_url: 'linkedin_url', 'linkedin url': 'linkedin_url',
  linkedin_profile: 'linkedin_url', 'linkedin profile': 'linkedin_url',
  linkedin_link: 'linkedin_url', profile_url: 'linkedin_url', 'profile url': 'linkedin_url',
  'naukri profile url': 'linkedin_url', 'resume link': 'linkedin_url',
  'profile link': 'linkedin_url', 'candidate profile': 'linkedin_url',
  current_location: 'current_location', 'current location': 'current_location',
  location: 'current_location', 'present location': 'current_location',
  'current city': 'current_location', current_city: 'current_location',
  preferred_location: 'preferred_location', 'preferred location': 'preferred_location',
  'preferred city': 'preferred_location', preferred_city: 'preferred_location',
  'desired location': 'preferred_location', desired_location: 'preferred_location',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
    else { current += char; }
  }
  values.push(current.trim());
  return values;
}

function detectSkillsDelimiter(samples: string[]): RegExp {
  const combined = samples.join('');
  if ((combined.match(/\|/g) || []).length > (combined.match(/;/g) || []).length) return /\|/;
  if (combined.includes(';')) return /;/;
  return /;|,/;
}

/** Parse batch "Apply to all" skills from comma/semicolon input. */
function parseBatchSkills(raw: string): string[] {
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

/** Merge skill lists case-insensitively, keeping first-seen casing. */
function mergeSkills(...lists: (string[] | undefined)[]): string[] | undefined {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const skill of list) {
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(skill);
    }
  }
  return result.length > 0 ? result : undefined;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function buildCandidate(
  rowNumber: number,
  values: string[],
  mappings: string[],
  skillsDelimiter: RegExp,
  existingEmails: Set<string>,
  existingPhones: Set<string>,
  seenEmails: Set<string>,
  seenPhones: Set<string>,
): ParsedCandidate {
  const get = (field: string) => {
    const idx = mappings.indexOf(field);
    return idx >= 0 ? (values[idx] || '').trim() : '';
  };
  const getAll = (field: string) =>
    mappings.map((m, i) => m === field ? (values[i] || '').trim() : null)
      .filter(Boolean).join('\n') || undefined;

  const name = get('name');
  const email = get('email').toLowerCase();
  const phone = get('phone') || undefined;
  const role_applied = get('role_applied') || undefined;
  const candidate_current_role = get('candidate_current_role') || undefined;
  const candidate_current_company = get('candidate_current_company') || undefined;
  const notes = getAll('notes');
  const linkedin_url = get('linkedin_url') || undefined;
  const current_location = get('current_location') || undefined;
  const preferred_location = get('preferred_location') || undefined;

  const expRaw = get('experience_years');
  let experience_years: number | undefined;
  if (expRaw) {
    const yearsMatch = expRaw.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/i);
    const monthsMatch = expRaw.match(/(\d+)\s*(?:month|mo)/i);
    if (yearsMatch || monthsMatch) {
      const yrs = yearsMatch ? parseFloat(yearsMatch[1]) : 0;
      const mos = monthsMatch ? parseInt(monthsMatch[1]) / 12 : 0;
      experience_years = Math.round((yrs + mos) * 10) / 10 || undefined;
    } else {
      const plain = parseFloat(expRaw);
      experience_years = isNaN(plain) ? undefined : plain;
    }
  }

  const skillsRaw = get('skills');
  const skills = skillsRaw ? skillsRaw.split(skillsDelimiter).map(s => s.trim()).filter(Boolean) : undefined;

  const normalizedPhone = phone ? normalizePhone(phone) : '';
  const warnings: string[] = [];
  const errors: string[] = [];
  let isDuplicate = false;

  if (!name) warnings.push('Name missing');
  if (!email && !phone) errors.push('Email or phone required');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');

  if (email && existingEmails.has(email)) {
    errors.push('Already exists in database'); isDuplicate = true;
  } else if (!email && normalizedPhone && existingPhones.has(normalizedPhone)) {
    errors.push('Already exists in database'); isDuplicate = true;
  }

  if (email && seenEmails.has(email)) {
    errors.push('Duplicate in this file'); isDuplicate = true;
  } else if (!email && normalizedPhone && seenPhones.has(normalizedPhone)) {
    errors.push('Duplicate in this file'); isDuplicate = true;
  }

  if (email) seenEmails.add(email);
  if (normalizedPhone) seenPhones.add(normalizedPhone);

  return {
    rowNumber, name, email, phone, role_applied,
    candidate_current_role, candidate_current_company,
    experience_years, skills, notes, linkedin_url,
    current_location, preferred_location,
    isValid: errors.length === 0, isDuplicate, warnings, errors,
  };
}

// ─── Inline-editable cell ─────────────────────────────────────────────────────

function EditableCell({
  value, rowIdx, field, editingCell, editValue, placeholder = '—',
  onStart, onSave, onChange, onCancel,
}: {
  value: string; rowIdx: number; field: 'name' | 'email' | 'phone';
  editingCell: { row: number; field: string } | null; editValue: string; placeholder?: string;
  onStart: (row: number, field: 'name' | 'email' | 'phone', val: string) => void;
  onSave: () => void; onChange: (v: string) => void; onCancel: () => void;
}) {
  const isEditing = editingCell?.row === rowIdx && editingCell?.field === field;
  if (isEditing) {
    return (
      <input
        autoFocus
        className="w-full min-w-[100px] text-xs border border-primary/50 rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        value={editValue}
        onChange={e => onChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(); }
          if (e.key === 'Escape') onCancel();
        }}
      />
    );
  }
  return (
    <span
      className="cursor-pointer group inline-flex items-center gap-1 hover:text-primary"
      onClick={() => onStart(rowIdx, field, value)}
    >
      {value || <span className="text-muted-foreground/50 italic text-xs">{placeholder}</span>}
      <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-40" />
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkImportDialog({ open, onOpenChange }: BulkImportDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number } | null>(null);

  // Stored after handleApplyMappings — used by revalidateCandidates
  const [dbEmails, setDbEmails] = useState<Set<string>>(new Set());
  const [dbPhones, setDbPhones] = useState<Set<string>>(new Set());

  // Batch role / pipeline context
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importRole, setImportRole] = useState('');
  const [vendorSourceKey, setVendorSourceKey] = useState<string | null>(null);
  const [batchSkills, setBatchSkills] = useState('');

  const { data: vendors = [] } = useVendors(true); // active vendors only

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ row: number; field: 'name' | 'email' | 'phone' } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Active jobs for the job picker — only fetched when on map step
  const { data: jobs = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['jobs-active-for-import'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('status', 'open')
        .order('title');
      return data ?? [];
    },
    enabled: step === 'map',
  });

  // Whether the file already has a role column mapped
  const hasRoleColumn = mappings.includes('role_applied');

  // Effective role label (for display)
  const selectedJob = jobs.find(j => j.id === importJobId);
  const effectiveRoleLabel = importJobId ? selectedJob?.title : importRole;

  // ── Re-validate all candidates in-place ────────────────────────────────────

  const revalidateCandidates = (cands: ParsedCandidate[]): ParsedCandidate[] => {
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    return cands.map(c => {
      const normalizedPhone = c.phone ? normalizePhone(c.phone) : '';
      const warnings: string[] = [];
      const errors: string[] = [];
      let isDuplicate = false;

      if (!c.name) warnings.push('Name missing');
      if (!c.email && !c.phone) errors.push('Email or phone required');
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('Invalid email format');

      if (c.email && dbEmails.has(c.email)) {
        errors.push('Already exists in database'); isDuplicate = true;
      } else if (!c.email && normalizedPhone && dbPhones.has(normalizedPhone)) {
        errors.push('Already exists in database'); isDuplicate = true;
      }

      if (c.email && seenEmails.has(c.email)) {
        errors.push('Duplicate in this file'); isDuplicate = true;
      } else if (!c.email && normalizedPhone && seenPhones.has(normalizedPhone)) {
        errors.push('Duplicate in this file'); isDuplicate = true;
      }

      if (c.email) seenEmails.add(c.email);
      if (normalizedPhone) seenPhones.add(normalizedPhone);

      return { ...c, warnings, errors, isDuplicate, isValid: errors.length === 0 };
    });
  };

  // ── Inline cell editing ────────────────────────────────────────────────────

  const startEdit = (row: number, field: 'name' | 'email' | 'phone', val: string) => {
    setEditingCell({ row, field });
    setEditValue(val);
  };
  const cancelEdit = () => { setEditingCell(null); setEditValue(''); };
  const saveEdit = () => {
    if (!editingCell) return;
    const { row, field } = editingCell;
    const trimmed = editValue.trim();
    const updated = candidates.map((c, i) => {
      if (i !== row) return c;
      return { ...c, [field]: field === 'email' ? trimmed.toLowerCase() : trimmed };
    });
    setCandidates(revalidateCandidates(updated));
    setEditingCell(null);
    setEditValue('');
  };

  // ── File parsing ───────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isCsv = name.endsWith('.csv');
    if (!isXlsx && !isCsv) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please upload a CSV or Excel (.xlsx / .xls) file' });
      return;
    }
    setFileName(file.name);
    setImportResults(null);
    const reader = new FileReader();
    if (isCsv) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) {
          toast({ variant: 'destructive', title: 'Empty file', description: 'File has no data rows' });
          return;
        }
        const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const rows = lines.slice(1).filter(l => l.trim().replace(/,/g, '')).map(l => parseCSVLine(l));
        const autoMappings = headers.map(h => COLUMN_ALIASES[h.toLowerCase()] ?? '__skip__');
        setRawHeaders(headers); setRawRows(rows); setMappings(autoMappings);
        setStep('map');
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const allRows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (allRows.length < 2) {
          toast({ variant: 'destructive', title: 'Empty file', description: 'File has no data rows' });
          return;
        }
        const headers = allRows[0].map(h => String(h).trim());
        const rows = allRows.slice(1).filter(r => r.some(c => String(c).trim())).map(r => r.map(c => String(c)));
        const autoMappings = headers.map(h => COLUMN_ALIASES[h.toLowerCase()] ?? '__skip__');
        setRawHeaders(headers); setRawRows(rows); setMappings(autoMappings);
        setStep('map');
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // ── Apply mappings → build preview ────────────────────────────────────────

  const handleApplyMappings = async () => {
    const hasIdentifier = mappings.includes('email') || mappings.includes('phone');
    if (!hasIdentifier) {
      toast({ variant: 'destructive', title: 'Missing identifier column', description: 'Map at least an Email or Phone column.' });
      return;
    }
    // Prompt if no role info anywhere
    if (!hasRoleColumn && !effectiveRoleLabel) {
      toast({ variant: 'destructive', title: 'Role context required', description: 'No role column in file — please select a job or enter a role name above.' });
      return;
    }

    const { data: existing } = await supabase.from('candidates').select('email, phone');
    const existingEmails = new Set((existing || []).map(r => r.email?.toLowerCase()).filter(Boolean) as string[]);
    const existingPhones = new Set((existing || []).map(r => r.phone ? normalizePhone(r.phone) : '').filter(Boolean) as string[]);

    const skillsColIdx = mappings.indexOf('skills');
    const skillsSamples = skillsColIdx >= 0 ? rawRows.slice(0, 10).map(r => r[skillsColIdx] || '') : [];
    const delimiter = detectSkillsDelimiter(skillsSamples);

    setDbEmails(existingEmails);
    setDbPhones(existingPhones);

    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    const parsed = rawRows.map((row, i) =>
      buildCandidate(i + 2, row, mappings, delimiter, existingEmails, existingPhones, seenEmails, seenPhones),
    );

    // Fill role_applied for rows that don't have one, using the batch role
    const withRole = effectiveRoleLabel
      ? parsed.map(c => (!c.role_applied ? { ...c, role_applied: effectiveRoleLabel } : c))
      : parsed;

    // Merge batch skills into every row (dedupe case-insensitive; keep first casing)
    const batchSkillList = parseBatchSkills(batchSkills);
    const withSkills = batchSkillList.length > 0
      ? withRole.map(c => ({ ...c, skills: mergeSkills(c.skills, batchSkillList) }))
      : withRole;

    setCandidates(withSkills);
    setStep('preview');
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const valid = candidates.filter(c => c.isValid);
    if (valid.length === 0) {
      toast({ variant: 'destructive', title: 'No valid candidates', description: 'Fix errors before importing' });
      return;
    }
    setIsImporting(true);
    let successCount = 0;
    let failedCount = 0;
    const insertedIds: string[] = [];

    for (const c of valid) {
      const { data: inserted, error } = await supabase.from('candidates').insert({
        name: c.name || null,
        email: c.email || null,
        phone: c.phone || null,
        role_applied: c.role_applied || null,
        candidate_current_role: c.candidate_current_role || null,
        candidate_current_company: c.candidate_current_company || null,
        experience_years: c.experience_years ?? null,
        skills: (c.skills || []) as unknown as Json,
        notes: c.notes || null,
        linkedin_url: c.linkedin_url || null,
        source: vendorSourceKey ?? 'csv_import',
        created_by: user?.id,
        uploaded_by: user?.id || null,
      } as any).select('id').single();

      if (error) {
        failedCount++;
        const idx = candidates.findIndex(x => x.email === c.email && x.rowNumber === c.rowNumber);
        if (idx >= 0) {
          candidates[idx].isValid = false;
          candidates[idx].errors.push(error.message.includes('duplicate') ? 'Email already exists' : error.message);
        }
      } else {
        successCount++;
        const candidateId = (inserted as { id?: string } | null)?.id;
        if (candidateId) {
          insertedIds.push(candidateId);
          const hasLocation = !!(c.current_location || c.preferred_location);
          if (hasLocation) {
            const { data: existingPrescreen } = await supabase
              .from('candidate_prescreens')
              .select('id')
              .eq('candidate_id', candidateId)
              .maybeSingle();

            const locationPayload = {
              candidate_id: candidateId,
              ...(c.current_location ? { current_location: c.current_location } : {}),
              ...(c.preferred_location ? { preferred_location: c.preferred_location } : {}),
            };

            if (existingPrescreen) {
              await supabase
                .from('candidate_prescreens')
                .update(locationPayload)
                .eq('id', existingPrescreen.id);
            } else {
              await supabase
                .from('candidate_prescreens')
                .insert(locationPayload);
            }
          }
        }
      }
    }

    // Auto-enrich in background
    for (const id of insertedIds) {
      supabase.functions.invoke('enrich-profile', { body: { candidate_id: id } }).catch(() => {});
    }

    // Candidates land in Pending Approval — no auto-enrollment into pipeline stages

    setIsImporting(false);
    setImportResults({ success: successCount, failed: failedCount });
    setCandidates([...candidates]);
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['pending-approval'] });
    queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });

    toast({
      title: 'Import complete',
      description: `${successCount} imported${failedCount > 0 ? ` · ${failedCount} failed` : ''} — candidates will appear in Pending Approval`,
    });
    setStep('done');
  };

  // ── Reset / Close ─────────────────────────────────────────────────────────

  const handleClose = () => {
    setStep('upload');
    setCandidates([]);
    setRawHeaders([]);
    setRawRows([]);
    setMappings([]);
    setFileName(null);
    setImportResults(null);
    setImportJobId(null);
    setImportRole('');
    setVendorSourceKey(null);
    setBatchSkills('');
    setEditingCell(null);
    setEditValue('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const rows = [
      'name,email,phone,role_applied,current_role,company,experience_years,skills,notes,linkedin_url,current_location,preferred_location',
      '"Rahul Sharma","rahul@example.com","+919876543210","Frontend Developer","Senior Engineer","Acme Corp","5","React;TypeScript;CSS","Strong communicator, open to relocation","https://linkedin.com/in/rahul","Bangalore","Bangalore;Hyderabad"',
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'candidates_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Counts ────────────────────────────────────────────────────────────────

  const validCount     = candidates.filter(c => c.isValid).length;
  const warningCount   = candidates.filter(c => c.isValid && c.warnings.length > 0).length;
  const duplicateCount = candidates.filter(c => !c.isValid && c.isDuplicate).length;
  const errorCount     = candidates.filter(c => !c.isValid && !c.isDuplicate).length;

  const editProps = { editingCell, editValue, onStart: startEdit, onSave: saveEdit, onChange: setEditValue, onCancel: cancelEdit };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Bulk Import Candidates</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV or Excel file to import multiple candidates at once.'}
            {step === 'map' && `Map the ${rawHeaders.length} columns in your file to candidate fields.`}
            {step === 'preview' && `Preview ${candidates.length} rows — click any name, email, or phone to edit inline.`}
            {step === 'done' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">

          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-1">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground">
                  CSV or Excel file (.xlsx / .xls) — any column order, flexible headers. You'll map columns in the next step.
                </p>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
          )}

          {/* ── Step: Map ── */}
          {step === 'map' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <FileText className="inline h-3.5 w-3.5 mr-1" />{fileName}
                  <span className="ml-2 text-xs">({rawRows.length} rows)</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setFileName(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                  <X className="h-3.5 w-3.5 mr-1" />Change file
                </Button>
              </div>

              {/* ── Role context panel ── */}
              <div className={cn(
                'rounded-lg border p-3 space-y-2.5',
                !hasRoleColumn
                  ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700/60 dark:bg-amber-950/20'
                  : 'border-border bg-muted/30',
              )}>
                {!hasRoleColumn ? (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      No role column detected — set a batch role so these candidates are searchable later.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground font-medium">Batch context (optional — fills rows without a role)</p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-[72px] shrink-0">Job / Role</span>
                  <Select
                    value={importJobId ?? '__manual__'}
                    onValueChange={(val) => {
                      if (val === '__manual__') {
                        setImportJobId(null);
                                          } else {
                        setImportJobId(val);
                        setImportRole(jobs.find(j => j.id === val)?.title ?? '');
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Select a job…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manual__" className="text-xs text-muted-foreground italic">Enter role manually</SelectItem>
                      {jobs.map(job => (
                        <SelectItem key={job.id} value={job.id} className="text-xs">{job.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!importJobId && (
                    <Input
                      className="h-7 text-xs flex-1"
                      placeholder="e.g. Flutter Developer"
                      value={importRole}
                      onChange={e => setImportRole(e.target.value)}
                    />
                  )}
                </div>

                {vendors.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground w-[72px] shrink-0">Vendor</span>
                    <Select
                      value={vendorSourceKey ?? '__none__'}
                      onValueChange={val => setVendorSourceKey(val === '__none__' ? null : val)}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="No vendor (internal)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground italic">No vendor (internal sourcing)</SelectItem>
                        {vendors.map(v => (
                          <SelectItem key={v.id} value={v.source_key} className="text-xs">{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Tags className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground w-[72px] shrink-0">Skills</span>
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder="Apply to all: Flutter, Dart"
                    value={batchSkills}
                    onChange={e => setBatchSkills(e.target.value)}
                  />
                </div>

                <p className="text-xs text-muted-foreground pl-[80px]">
                  Candidates will land in <strong>Pending Approval</strong> and must be approved before entering the pipeline.
                </p>
              </div>

              <div className="overflow-y-auto border rounded-lg" style={{ maxHeight: 'calc(85vh - 330px)' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px] sticky top-0 bg-background z-10">Column</TableHead>
                      <TableHead className="w-[180px] sticky top-0 bg-background z-10">Sample Value</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Map to Field</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawHeaders.map((header, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs font-medium">{header}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {rawRows[0]?.[idx] || <span className="italic opacity-50">empty</span>}
                        </TableCell>
                        <TableCell>
                          <Select value={mappings[idx] ?? '__skip__'} onValueChange={(val) => {
                            const next = [...mappings]; next[idx] = val; setMappings(next);
                          }}>
                            <SelectTrigger className="h-8 text-xs w-[200px]">
                              <SelectValue placeholder="— Skip column —" />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Skills can be separated by semicolons (<code>;</code>), pipes (<code>|</code>), or commas — auto-detected.
              </p>
            </>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">{validCount} will import</Badge>
                  {warningCount > 0 && <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">{warningCount} missing name</Badge>}
                  {duplicateCount > 0 && <Badge variant="outline" className="bg-amber-500/10 text-amber-600">{duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}</Badge>}
                  {errorCount > 0 && <Badge variant="outline" className="bg-red-500/10 text-red-600">{errorCount} error{errorCount !== 1 ? 's' : ''}</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('map')}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to mapping
                </Button>
              </div>

              <div className="overflow-y-auto border rounded-lg" style={{ maxHeight: 'calc(85vh - 270px)' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 sticky top-0 bg-background z-10" />
                      <TableHead className="w-12 sticky top-0 bg-background z-10 text-xs">Row</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Name</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Email</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Phone</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Company</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Role</TableHead>
                      <TableHead className="w-12 sticky top-0 bg-background z-10">Exp</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Skills</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c, i) => {
                      const hasWarning = c.isValid && c.warnings.length > 0;
                      const rowBg = !c.isValid
                        ? (c.isDuplicate ? 'bg-amber-500/5' : 'bg-red-500/5')
                        : hasWarning ? 'bg-yellow-500/5' : '';
                      return (
                        <TableRow key={i} className={rowBg}>
                          <TableCell className="py-2">
                            {c.isValid
                              ? hasWarning
                                ? <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                : <CheckCircle2 className="h-4 w-4 text-green-600" />
                              : <AlertCircle className={`h-4 w-4 ${c.isDuplicate ? 'text-amber-500' : 'text-red-500'}`} />
                            }
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono py-2">{c.rowNumber}</TableCell>
                          <TableCell className="py-2 font-medium text-sm">
                            <EditableCell value={c.name} rowIdx={i} field="name" placeholder="click to add" {...editProps} />
                            {c.warnings.length > 0 && <p className="text-[10px] text-yellow-600 mt-0.5">{c.warnings.join(' · ')}</p>}
                            {!c.isValid && (
                              <p className={`text-[10px] mt-0.5 ${c.isDuplicate ? 'text-amber-600' : 'text-red-500'}`}>{c.errors.join(' · ')}</p>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-sm">
                            <EditableCell value={c.email} rowIdx={i} field="email" placeholder="click to add" {...editProps} />
                          </TableCell>
                          <TableCell className="py-2 text-sm text-muted-foreground">
                            <EditableCell value={c.phone ?? ''} rowIdx={i} field="phone" placeholder="—" {...editProps} />
                          </TableCell>
                          <TableCell className="py-2 text-sm text-muted-foreground truncate max-w-[100px]">{c.candidate_current_company || '-'}</TableCell>
                          <TableCell className="py-2 text-sm text-muted-foreground truncate max-w-[100px]">{c.role_applied || '-'}</TableCell>
                          <TableCell className="py-2 text-sm text-muted-foreground">{c.experience_years ?? '-'}</TableCell>
                          <TableCell className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {c.skills?.slice(0, 2).map((s, j) => <Badge key={j} variant="secondary" className="text-xs">{s}</Badge>)}
                              {(c.skills?.length || 0) > 2 && <Badge variant="outline" className="text-xs">+{c.skills!.length - 2}</Badge>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && importResults && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold">{importResults.success} candidates imported</p>
                {importResults.failed > 0 && (
                  <p className="text-sm text-destructive">{importResults.failed} rows failed (duplicate or invalid)</p>
                )}
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2 flex-shrink-0">
          {step === 'upload' && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleApplyMappings}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={isImporting || validCount === 0}>
                {isImporting
                  ? 'Importing…'
                  : `Import ${validCount} Candidate${validCount !== 1 ? 's' : ''}${duplicateCount > 0 ? ` · skip ${duplicateCount}` : ''}`
                }
              </Button>
            </>
          )}
          {step === 'done' && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
