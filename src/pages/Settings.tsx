import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useSystemConfig, CertTierEntry, useReScoreCandidates, useBusinessBranding, type BusinessBranding, type EmailSettings, DEFAULT_EMAIL_SETTINGS, type EmailNotificationSettings, DEFAULT_EMAIL_NOTIFICATION_SETTINGS, EMAIL_NOTIFICATION_LABELS, type EmailNotificationKey, type AssessmentOrgDefaults, DEFAULT_ASSESSMENT_ORG_DEFAULTS, type AssessmentGenerationSettings, DEFAULT_ASSESSMENT_GENERATION_SETTINGS, parseAssessmentOrgDefaults, parseAssessmentGenerationSettings, ASSESSMENT_TIERS, assessmentTierLabels, isNonTechAssessmentTier, type AssessmentTier, type AssessmentTierGenerationSettings } from '@/hooks/useSystemConfig';
import { Settings as SettingsIcon, Plus, Trash2, Save, RefreshCw, Award, GraduationCap, AlertTriangle, Briefcase, Users, UserPlus, Shield, Loader2, Flag, Eye, Video, Megaphone, CheckCircle, Circle, Link as LinkIcon, Building2, Pencil, UserX, RotateCcw, ChevronDown, ChevronRight, Store, Upload, ImageIcon, ClipboardList, Palette, Mail, FileQuestion, ClipboardCheck, BookOpen, Copy, Twitter } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor, toSourceKey, type Vendor } from '@/hooks/useVendors';
import {
  usePrescreenQuestions,
  useCreatePrescreenQuestion,
  useUpdatePrescreenQuestion,
  PRESCREEN_CATEGORIES,
  PRESCREEN_CATEGORY_LABELS,
  ASSIGNED_QUESTION_COUNT,
  toQuestionKey,
  uniqueQuestionKey,
  type PrescreenQuestionBankRow,
  type PrescreenCategory,
} from '@/hooks/usePrescreenQuestionBank';
import { useScorecardTemplatesList, useUpdateScorecardTemplate, type ScorecardTemplateRow } from '@/hooks/useScorecardTemplatesAdmin';
import { slugifyCriterionKey, type ScorecardCriterion } from '@/lib/scorecardTemplates';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DEFAULT_PRIMARY_COLOR, DEFAULT_PRIMARY_FOREGROUND_COLOR, applyBrandTheme, normalizeHexColor } from '@/lib/brandTheme';
import { cn } from '@/lib/utils';
import { normalizeApplicantEmail } from '@/lib/applicantApplicationEligibility';
import { SocialDraftsCards } from '@/components/chitra/SocialDraftsCards';
import { parseSocialDraftsLatest } from '@/lib/socialDrafts';
import {
  useGenerateSocialDrafts,
  useSocialDraftsEnabled,
  useSocialDraftsHistory,
  useSocialDraftsLatest,
  useToggleSocialDraftPosted,
} from '@/hooks/useSocialDrafts';

function BusinessBrandingTab() {
  const { branding, updateAsync, isUpdating } = useBusinessBranding();
  const [local, setLocal] = useState<BusinessBranding>(branding);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);
  const [saving, setSaving] = useState(false);
  const [colorInput, setColorInput] = useState(branding.primary_color);
  const [foregroundColorInput, setForegroundColorInput] = useState(branding.primary_foreground_color);

  useEffect(() => {
    setLocal(branding);
    setColorInput(branding.primary_color);
    setForegroundColorInput(branding.primary_foreground_color);
  }, [branding]);

  const previewColor = normalizeHexColor(local.primary_color) ?? DEFAULT_PRIMARY_COLOR;
  const previewForegroundColor =
    normalizeHexColor(local.primary_foreground_color) ?? DEFAULT_PRIMARY_FOREGROUND_COLOR;

  useEffect(() => {
    applyBrandTheme(previewColor, previewForegroundColor);
    return () => {
      applyBrandTheme(
        branding.primary_color ?? DEFAULT_PRIMARY_COLOR,
        branding.primary_foreground_color ?? DEFAULT_PRIMARY_FOREGROUND_COLOR,
      );
    };
  }, [previewColor, previewForegroundColor, branding.primary_color, branding.primary_foreground_color]);

  async function persistBranding(next: BusinessBranding) {
    setSaving(true);
    try {
      const primary_color = normalizeHexColor(next.primary_color) ?? DEFAULT_PRIMARY_COLOR;
      const primary_foreground_color =
        normalizeHexColor(next.primary_foreground_color) ?? DEFAULT_PRIMARY_FOREGROUND_COLOR;
      await updateAsync({
        logo_desktop_url: next.logo_desktop_url || null,
        logo_mobile_url: next.logo_mobile_url || null,
        company_name: next.company_name?.trim() || null,
        primary_color,
        primary_foreground_color,
      });
      setLocal({ ...next, primary_color, primary_foreground_color });
      setColorInput(primary_color);
      setForegroundColorInput(primary_foreground_color);
    } finally {
      setSaving(false);
    }
  }

  function handlePrimaryColorChange(hex: string) {
    setColorInput(hex);
    const normalized = normalizeHexColor(hex);
    if (normalized) {
      setLocal(prev => ({ ...prev, primary_color: normalized }));
    }
  }

  function handlePrimaryForegroundColorChange(hex: string) {
    setForegroundColorInput(hex);
    const normalized = normalizeHexColor(hex);
    if (normalized) {
      setLocal(prev => ({ ...prev, primary_foreground_color: normalized }));
    }
  }

  async function uploadLogo(file: File, variant: 'desktop' | 'mobile') {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, SVG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be under 5 MB');
      return;
    }
    setUploading(variant);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `logos/${variant}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path);
      const key = variant === 'desktop' ? 'logo_desktop_url' : 'logo_mobile_url';
      const next = { ...local, [key]: publicUrl };
      setLocal(next);
      await persistBranding(next);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  function handleSave() {
    const primary_color = normalizeHexColor(colorInput);
    const primary_foreground_color = normalizeHexColor(foregroundColorInput);
    if (!primary_color) {
      toast.error('Enter a valid hex color (e.g. #D64541)');
      return;
    }
    if (!primary_foreground_color) {
      toast.error('Enter a valid button text color (e.g. #FFFFFF)');
      return;
    }
    void persistBranding({ ...local, primary_color, primary_foreground_color });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Upload your company logo for the app header. Desktop and mobile can use different assets — if mobile is empty, desktop is used on all screen sizes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['desktop', 'mobile'] as const).map(variant => {
          const url = variant === 'desktop' ? local.logo_desktop_url : local.logo_mobile_url;
          const label = variant === 'desktop' ? 'Desktop logo' : 'Mobile logo';
          return (
            <div key={variant} className="space-y-3 rounded-lg border border-border p-4">
              <Label>{label}</Label>
              <div className="flex items-center justify-center min-h-[80px] rounded-md bg-muted/40 border border-dashed border-border">
                {url ? (
                  <img src={url} alt={label} className="max-h-16 w-auto object-contain px-4" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground py-4">
                    <ImageIcon className="h-8 w-8 opacity-40" />
                    <span className="text-xs">No logo uploaded</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading === variant} asChild>
                  <label className="cursor-pointer">
                    {uploading === variant ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) void uploadLogo(f, variant);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </Button>
                {url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocal(prev => ({
                      ...prev,
                      [variant === 'desktop' ? 'logo_desktop_url' : 'logo_mobile_url']: null,
                    }))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Recommended: PNG or SVG, max 5 MB. Wide logos work best for desktop; compact marks for mobile. Logos save automatically after upload.</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 max-w-md">
        <Label htmlFor="company-name">Company name (fallback if no logo)</Label>
        <Input
          id="company-name"
          value={local.company_name ?? ''}
          onChange={e => setLocal(prev => ({ ...prev, company_name: e.target.value }))}
          placeholder="Acme Corp"
        />
      </div>

      <div className="space-y-3 max-w-lg rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="primary-color">Primary brand color</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Used for buttons, links, focus rings, and sidebar accents across the app and public careers pages.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="primary-color"
            type="color"
            value={previewColor}
            onChange={e => handlePrimaryColorChange(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent p-0.5"
            aria-label="Pick primary brand color"
          />
          <Input
            value={colorInput}
            onChange={e => handlePrimaryColorChange(e.target.value)}
            placeholder="#D64541"
            className="max-w-[8rem] font-mono text-sm uppercase"
            maxLength={7}
          />
          {normalizeHexColor(colorInput) === null && colorInput.trim() !== '' && (
            <span className="text-xs text-destructive">Invalid hex</span>
          )}
        </div>
        <div className="space-y-2 pt-2 border-t border-border">
          <Label htmlFor="primary-foreground-color">Button text color</Label>
          <p className="text-xs text-muted-foreground">
            Text on primary buttons, badges, and gradient actions. Default is white on SparxIT red.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="primary-foreground-color"
              type="color"
              value={previewForegroundColor}
              onChange={e => handlePrimaryForegroundColorChange(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent p-0.5"
              aria-label="Pick button text color"
            />
            <Input
              value={foregroundColorInput}
              onChange={e => handlePrimaryForegroundColorChange(e.target.value)}
              placeholder="#FFFFFF"
              className="max-w-[8rem] font-mono text-sm uppercase"
              maxLength={7}
            />
            {normalizeHexColor(foregroundColorInput) === null && foregroundColorInput.trim() !== '' && (
              <span className="text-xs text-destructive">Invalid hex</span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Live preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Primary button</Button>
            <Button size="sm" variant="outline" className="border-primary text-primary">
              Outline
            </Button>
            <Button size="sm" className="btn-gradient text-primary-foreground border-0">
              Gradient
            </Button>
            <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Badge</Badge>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={
          isUpdating
          || saving
          || normalizeHexColor(local.primary_color) === null
          || normalizeHexColor(local.primary_foreground_color) === null
        }
        className="gap-2"
      >
        {(isUpdating || saving) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save branding
      </Button>
    </div>
  );
}

function CertTiersTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('cert_tiers');
  const [localCerts, setLocalCerts] = useState<Record<string, CertTierEntry> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newTier, setNewTier] = useState('1');
  const [newCategory, setNewCategory] = useState('other');
  const [newSkill, setNewSkill] = useState('');

  const certs: Record<string, CertTierEntry> = localCerts ?? (configValue || {});
  const isDirty = localCerts !== null;

  const handleDelete = (key: string) => {
    const updated = { ...certs };
    delete updated[key];
    setLocalCerts(updated);
  };

  const handleAdd = () => {
    if (!newKey.trim() || !newSkill.trim()) {
      toast.error('Name and skill upgrade are required');
      return;
    }
    const key = newKey.toLowerCase().trim();
    if (certs[key]) {
      toast.error('Certification already exists');
      return;
    }
    setLocalCerts({
      ...certs,
      [key]: { tier: parseInt(newTier), category: newCategory, skill_upgrade: newSkill },
    });
    setNewKey('');
    setNewSkill('');
    setAddOpen(false);
  };

  const handleSave = () => {
    if (localCerts) {
      update(localCerts);
      setLocalCerts(null);
    }
  };

  const tierBadge = (tier: number) => {
    const colors: Record<number, string> = {
      1: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400',
      2: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400',
      3: 'bg-muted text-muted-foreground',
    };
    const labels: Record<number, string> = { 1: '🏅 Tier 1', 2: '⭐ Tier 2', 3: 'Tier 3' };
    return (
      <Badge
        variant="outline"
        className={`${colors[tier] || ''} shrink-0 max-md:rounded-md max-md:px-1.5 max-md:py-0 max-md:text-[10px] max-md:leading-4 max-md:font-medium`}
      >
        <span className="md:hidden">T{tier}</span>
        <span className="hidden md:inline">{labels[tier] || `Tier ${tier}`}</span>
      </Badge>
    );
  };

  const categories = ['cloud', 'security', 'devops', 'project_management', 'other', 'frontend', 'backend', 'database', 'mobile', 'design', 'testing', 'data_science', 'ai_ml'];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const sorted = Object.entries(certs).sort((a, b) => a[1].tier - b[1].tier || a[0].localeCompare(b[0]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {Object.keys(certs).length} certifications configured across 3 tiers
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Certification</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Certification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Certification Name (match key)</Label>
                  <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. aws devops professional" />
                  <p className="text-xs text-muted-foreground mt-1">Lowercase name used for matching against resume text</p>
                </div>
                <div>
                  <Label>Tier</Label>
                  <Select value={newTier} onValueChange={setNewTier}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">🏅 Tier 1 — Gold Standard (30 pts)</SelectItem>
                      <SelectItem value="2">⭐ Tier 2 — Well-Recognized (20 pts)</SelectItem>
                      <SelectItem value="3">Tier 3 — Entry-Level (10 pts)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Skill Upgrade</Label>
                  <Input value={newSkill} onChange={e => setNewSkill(e.target.value)} placeholder="e.g. AWS DevOps" />
                  <p className="text-xs text-muted-foreground mt-1">The skill that gets upgraded to Expert when this cert is detected</p>
                </div>
                <Button onClick={handleAdd} className="w-full">Add Certification</Button>
              </div>
            </DialogContent>
          </Dialog>
          {isDirty && (
            <Button size="sm" variant="default" onClick={handleSave} disabled={isUpdating}>
              <Save className="h-4 w-4 mr-1" /> {isUpdating ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> You have unsaved changes
        </div>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Certification</TableHead>
              <TableHead className="w-0">Tier</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Skill Upgrade</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(([key, entry]) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{key}</TableCell>
                <TableCell className="w-0 whitespace-nowrap max-md:px-2">{tierBadge(entry.tier)}</TableCell>
                <TableCell className="text-sm capitalize">{entry.category.replace(/_/g, ' ')}</TableCell>
                <TableCell className="text-sm">{entry.skill_upgrade}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(key)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DomainsTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('job_domains');
  const [localDomains, setLocalDomains] = useState<string[] | null>(null);
  const [newDomain, setNewDomain] = useState('');

  const domains: string[] = localDomains ?? (configValue || []);
  const isDirty = localDomains !== null;

  const handleAdd = () => {
    const val = newDomain.trim();
    if (!val) return;
    if (domains.some(d => d.toLowerCase() === val.toLowerCase())) {
      toast.error('Already in the list');
      return;
    }
    setLocalDomains([...domains, val]);
    setNewDomain('');
  };

  const handleDelete = (domain: string) => {
    setLocalDomains(domains.filter(d => d !== domain));
  };

  const handleSave = () => {
    if (localDomains) {
      update(localDomains);
      setLocalDomains(null);
    }
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{domains.length} domains configured</p>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isUpdating}>
            <Save className="h-4 w-4 mr-1" /> {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> You have unsaved changes
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
          placeholder="Add domain (e.g. 'Engineering', 'Marketing')"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {domains.sort().map(domain => (
          <Badge key={domain} variant="secondary" className="gap-1 py-1.5 px-3 text-sm">
            <Briefcase className="h-3.5 w-3.5" />
            {domain}
            <button onClick={() => handleDelete(domain)} className="ml-1 hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
function TeamsTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('job_teams');
  const [localTeams, setLocalTeams] = useState<string[] | null>(null);
  const [newTeam, setNewTeam] = useState('');

  const teams: string[] = localTeams ?? (configValue || []);
  const isDirty = localTeams !== null;

  const handleAdd = () => {
    const val = newTeam.trim();
    if (!val) return;
    if (teams.some(t => t.toLowerCase() === val.toLowerCase())) {
      toast.error('Already in the list');
      return;
    }
    setLocalTeams([...teams, val]);
    setNewTeam('');
  };

  const handleDelete = (team: string) => {
    setLocalTeams(teams.filter(t => t !== team));
  };

  const handleSave = () => {
    if (localTeams) {
      update(localTeams);
      setLocalTeams(null);
    }
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{teams.length} teams configured</p>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isUpdating}>
            <Save className="h-4 w-4 mr-1" /> {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> You have unsaved changes
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={newTeam}
          onChange={e => setNewTeam(e.target.value)}
          placeholder="Add team (e.g. 'Frontend', 'Backend', 'QA')"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {teams.sort().map(team => (
          <Badge key={team} variant="secondary" className="gap-1 py-1.5 px-3 text-sm">
            <Users className="h-3.5 w-3.5" />
            {team}
            <button onClick={() => handleDelete(team)} className="ml-1 hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function CollegesTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('tier1_colleges');
  const [localColleges, setLocalColleges] = useState<string[] | null>(null);
  const [newCollege, setNewCollege] = useState('');

  const colleges: string[] = localColleges ?? (configValue || []);
  const isDirty = localColleges !== null;

  const handleAdd = () => {
    const val = newCollege.toLowerCase().trim();
    if (!val) return;
    if (colleges.includes(val)) {
      toast.error('Already in the list');
      return;
    }
    setLocalColleges([...colleges, val]);
    setNewCollege('');
  };

  const handleDelete = (college: string) => {
    setLocalColleges(colleges.filter(c => c !== college));
  };

  const handleSave = () => {
    if (localColleges) {
      update(localColleges);
      setLocalColleges(null);
    }
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{colleges.length} Tier 1 college patterns configured</p>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isUpdating}>
            <Save className="h-4 w-4 mr-1" /> {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>
      {isDirty && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> You have unsaved changes
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={newCollege}
          onChange={e => setNewCollege(e.target.value)}
          placeholder="Add college name pattern (e.g. 'vit', 'manipal')"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {colleges.sort().map(college => (
          <Badge key={college} variant="secondary" className="gap-1 py-1.5 px-3 text-sm">
            <GraduationCap className="h-3.5 w-3.5" />
            {college}
            <button onClick={() => handleDelete(college)} className="ml-1 hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
interface UserWithRole {
  user_id: string;
  role: string;
  created_at: string;
  email_confirmed?: boolean;
  profile?: { full_name: string; email: string; is_super_admin?: boolean; can_conduct_interviews?: boolean; is_active?: boolean; deactivated_at?: string | null };
}

interface PendingProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  email_confirmed?: boolean;
  is_active?: boolean | null;
  deactivated_at?: string | null;
}

interface ApplicantPortalUser {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  email_confirmed?: boolean;
}

async function fetchEmailConfirmationMap(userIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase.rpc('get_user_email_confirmation_status', {
    _user_ids: userIds,
  });
  if (error) {
    console.warn('Could not load email confirmation status:', error.message);
    return map;
  }
  for (const row of data || []) {
    map.set(row.user_id, row.email_confirmed);
  }
  return map;
}

function buildApplicantIdentitySets(
  applicantRows: { user_id: string; email: string }[] | null,
  portalAuthRows: { user_id: string; email: string | null }[] | null,
  relatedEmails: (string | null | undefined)[] = [],
) {
  const applicantUserIds = new Set<string>();
  const applicantEmails = new Set<string>();

  for (const row of applicantRows || []) {
    applicantUserIds.add(row.user_id);
    const email = normalizeApplicantEmail(row.email);
    if (email) applicantEmails.add(email);
  }

  for (const row of portalAuthRows || []) {
    applicantUserIds.add(row.user_id);
    const email = row.email ? normalizeApplicantEmail(row.email) : '';
    if (email) applicantEmails.add(email);
  }

  for (const raw of relatedEmails) {
    const email = raw ? normalizeApplicantEmail(raw) : '';
    if (email) applicantEmails.add(email);
  }

  return { applicantUserIds, applicantEmails };
}

function isApplicantPortalAccount(
  userId: string,
  email: string | null | undefined,
  applicantUserIds: Set<string>,
  applicantEmails: Set<string>,
) {
  if (applicantUserIds.has(userId)) return true;
  if (!email) return false;
  return applicantEmails.has(normalizeApplicantEmail(email));
}

function UserManagementTab() {
  return (
    <Tabs defaultValue="staff" className="space-y-4">
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        <TabsTrigger value="staff">Staff</TabsTrigger>
        <TabsTrigger value="applicants">Applicants</TabsTrigger>
      </TabsList>
      <TabsContent value="staff" className="mt-0">
        <StaffUsersSection />
      </TabsContent>
      <TabsContent value="applicants" className="mt-0">
        <ApplicantPortalUsersSection />
      </TabsContent>
    </Tabs>
  );
}

const USER_ROLES_PAGE_SIZE = 10;

function StaffUsersSection() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<string>('recruiter');
  const [adding, setAdding] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [registeringApplicantId, setRegisteringApplicantId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingPendingId, setRejectingPendingId] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Archive wizard
  const [archiveTarget, setArchiveTarget] = useState<UserWithRole | null>(null);
  const [archiveStep, setArchiveStep] = useState<'overview' | 'reassign' | 'done'>('overview');
  const [archiveImpact, setArchiveImpact] = useState<{ ownedCandidates: number; jobAssignments: number; pendingInterviews: { id: string; candidate_name: string; scheduled_at: string }[] } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [replacementId, setReplacementId] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<{ candidatesTransferred: number; jobAssignmentsRemoved: number; interviewsFlagged: number } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('user_id, role, created_at');

    if (error) {
      toast.error('Failed to load users');
      setLoading(false);
      return;
    }

    const assignedIds = new Set((roles || []).map(r => r.user_id));

    const [
      { data: profiles, error: profilesError },
      { data: allProfiles, error: allProfilesError },
      { data: applicantRows, error: applicantError },
      { data: portalAuthRows, error: portalAuthError },
      { data: applicationRows },
      { data: candidateRows },
    ] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, email, is_super_admin, can_conduct_interviews, is_active, deactivated_at').in('user_id', [...assignedIds]),
      supabase.from('profiles').select('user_id, full_name, email, created_at, is_active, deactivated_at'),
      supabase.from('applicant_profiles').select('user_id, email'),
      supabase.rpc('get_applicant_portal_auth_users'),
      supabase.from('job_applications').select('applicant_email'),
      supabase.from('candidates').select('email').not('email', 'is', null),
    ]);

    if (profilesError || allProfilesError || applicantError) {
      toast.error('Failed to load users');
      setLoading(false);
      return;
    }

    if (portalAuthError) {
      console.warn('Could not load applicant portal auth users:', portalAuthError.message);
    }

    const { applicantUserIds, applicantEmails } = buildApplicantIdentitySets(
      applicantRows,
      portalAuthRows as { user_id: string; email: string | null }[] | null,
      [
        ...(applicationRows || []).map(a => a.applicant_email),
        ...(candidateRows || []).map(c => c.email),
      ],
    );

    const isMisclassifiedApplicantStaff = (userId: string, role: string, profile?: UserWithRole['profile']) => {
      if (role !== 'interviewer' || profile?.can_conduct_interviews) return false;
      return isApplicantPortalAccount(userId, profile?.email, applicantUserIds, applicantEmails);
    };

    const pendingBase = (allProfiles || []).filter(p => {
      if (assignedIds.has(p.user_id)) return false;
      if (p.is_active === false || !!p.deactivated_at) return false;
      return !isApplicantPortalAccount(p.user_id, p.email, applicantUserIds, applicantEmails);
    });

    const staffCandidates = (roles || [])
      .map(r => ({
        ...r,
        profile: profiles?.find(p => p.user_id === r.user_id),
      }))
      .filter(u => !isMisclassifiedApplicantStaff(u.user_id, u.role, u.profile));

    const confirmationMap = await fetchEmailConfirmationMap([
      ...staffCandidates.map(u => u.user_id),
      ...pendingBase.map(p => p.user_id),
    ]);

    const merged = staffCandidates.map(u => ({
      ...u,
      email_confirmed: confirmationMap.get(u.user_id),
    }));

    const pending = pendingBase.map(p => ({
      ...p,
      email_confirmed: confirmationMap.get(p.user_id),
    }));

    setUsers(merged);
    setPendingUsers(pending as PendingProfile[]);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  // Fetch impact data when archive target is selected
  useEffect(() => {
    if (!archiveTarget) return;
    setLoadingImpact(true);
    setArchiveImpact(null);
    setArchiveStep('overview');
    setReplacementId('');
    setArchiveResult(null);
    supabase.functions.invoke('deactivate-user', {
      body: { action: 'get_impact', target_user_id: archiveTarget.user_id },
    }).then(({ data }) => {
      setArchiveImpact(data?.impact ?? { ownedCandidates: 0, jobAssignments: 0, pendingInterviews: [] });
    }).finally(() => setLoadingImpact(false));
  }, [archiveTarget?.user_id]);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    const { data, error } = await supabase.functions.invoke('deactivate-user', {
      body: { action: 'deactivate', target_user_id: archiveTarget.user_id, replacement_recruiter_id: replacementId || null },
    });
    setIsArchiving(false);
    if (error || !data?.success) { toast.error(error?.message || 'Archive failed'); return; }
    setArchiveResult(data.result);
    setArchiveStep('done');
    fetchUsers();
  };

  const handleReactivate = async (userId: string, name: string) => {
    const { error } = await supabase.functions.invoke('deactivate-user', {
      body: { action: 'reactivate', target_user_id: userId },
    });
    if (error) { toast.error('Failed to reactivate user'); return; }
    toast.success(`${name} has been reactivated`);
    fetchUsers();
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (newRole === '__remove_staff__') {
      await handleRemoveRole(userId);
      return;
    }

    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole as any })
      .eq('user_id', userId);

    if (error) {
      toast.error('Failed to update role');
      return;
    }
    toast.success('Role updated');
    fetchUsers();
  };

  const handleRemoveRole = async (userId: string) => {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (error) {
      toast.error('Failed to remove user role');
      return;
    }
    toast.success('User role removed');
    fetchUsers();
  };

  const handleToggleCanConduct = async (userId: string, current: boolean) => {
    const { error } = await supabase.rpc('set_can_conduct_interviews', {
      _target_user_id: userId,
      _value: !current,
    });
    if (error) { toast.error('Failed to update'); return; }
    fetchUsers();
  };

  const handleAddUser = async () => {
    if (!newEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setAdding(true);

    // Find user profile by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('email', newEmail.trim().toLowerCase())
      .maybeSingle();

    if (!profile) {
      toast.error('No user found with that email. They must sign up first.');
      setAdding(false);
      return;
    }

    // Check if they already have a role
    const existing = users.find(u => u.user_id === profile.user_id);
    if (existing) {
      toast.error(`User already has the "${existing.role}" role`);
      setAdding(false);
      return;
    }

    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: profile.user_id, role: newRole as any });

    if (error) {
      toast.error('Failed to assign role');
      setAdding(false);
      return;
    }

    toast.success(`Assigned ${newRole} role to ${newEmail}`);
    setNewEmail('');
    setAddOpen(false);
    setAdding(false);
    fetchUsers();
  };

  const handleRegisterAsApplicant = async (userId: string, email: string | null) => {
    setRegisteringApplicantId(userId);
    const { error } = await supabase.rpc('register_profile_as_applicant', {
      _target_user_id: userId,
    });
    setRegisteringApplicantId(null);
    if (error) {
      toast.error(error.message.includes('already exists')
        ? `${email || userId} already has an applicant profile on another account — remove the duplicate signup`
        : `Failed to register as applicant: ${error.message}`);
      return;
    }
    toast.success(`${email || userId} moved to Applicants`);
    fetchUsers();
  };

  const handleApproveUser = async (userId: string, email: string | null, role: string = 'interviewer') => {
    setApprovingId(userId);
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: role as any });

    if (error) {
      toast.error('Failed to approve user');
    } else {
      if (role === 'interviewer') {
        const { error: interviewError } = await supabase.rpc('set_can_conduct_interviews', {
          _target_user_id: userId,
          _value: true,
        });
        if (interviewError) {
          toast.error('Approved as interviewer but failed to enable interview pool');
        }
      }
      toast.success(`Approved ${email || userId} as ${role}`);
      fetchUsers();
    }
    setApprovingId(null);
  };

  const handleConfirmEmail = async (userId: string, name: string | null | undefined) => {
    setConfirmingId(userId);
    try {
      const { error } = await supabase.functions.invoke('admin-confirm-user', {
        body: { user_id: userId },
      });
      if (error) throw error;
      toast.success(`Email confirmed for ${name || userId} — they can now log in`);
      await fetchUsers();
    } catch (err: any) {
      toast.error(`Failed to confirm email: ${err?.message || 'Unknown error'}`);
    }
    setConfirmingId(null);
  };

  const handleRejectPending = async (userId: string, name: string | null | undefined, email: string | null | undefined) => {
    const label = name || email || userId;
    if (!confirm(`Remove ${label} from pending approval?\n\nTheir signup will be deleted and they will not be able to log in.`)) {
      return;
    }
    setRejectingPendingId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-confirm-user', {
        body: { user_id: userId, action: 'reject_pending' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Removed ${label} from pending approval`);
      await fetchUsers();
    } catch (err: any) {
      toast.error(`Failed to remove pending user: ${err?.message || 'Unknown error'}`);
    }
    setRejectingPendingId(null);
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-destructive/10 text-destructive border-destructive/30',
      hr: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400',
      recruiter: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400',
      interviewer: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
    };
    const labels: Record<string, string> = { admin: 'Admin', hr: 'HR', recruiter: 'Recruiter', interviewer: 'Interviewer' };
    return <Badge variant="outline" className={colors[role] || ''}>{labels[role] || role}</Badge>;
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const activeUsers = users.filter(u => u.profile?.is_active !== false && !u.profile?.deactivated_at);
  const totalPages = Math.max(1, Math.ceil(activeUsers.length / USER_ROLES_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedUsers = activeUsers.slice((safePage - 1) * USER_ROLES_PAGE_SIZE, safePage * USER_ROLES_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} users with roles</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Assign Role</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Role to User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>User Email</Label>
                <Input
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  type="email"
                />
                <p className="text-xs text-muted-foreground mt-1">The user must have already signed up</p>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — Full access</SelectItem>
                    <SelectItem value="hr">HR — Receives escalations</SelectItem>
                    <SelectItem value="recruiter">Recruiter — Manage assigned jobs & candidates</SelectItem>
                    <SelectItem value="interviewer">Interviewer — View assigned candidates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddUser} className="w-full" disabled={adding}>
                {adding ? 'Assigning...' : 'Assign Role'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-48">Change Role</TableHead>
              <TableHead className="w-36 text-center">Can Interview</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedUsers.map(u => {
              const isSuperAdmin = u.profile?.is_super_admin === true;
              return (
                <TableRow key={u.user_id} className={isSuperAdmin ? 'bg-violet-50/40 dark:bg-violet-950/20' : ''}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {u.profile?.full_name || '—'}
                      {isSuperAdmin && (
                        <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Super Admin
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.profile?.email || '—'}</TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell>
                    {isSuperAdmin ? (
                      <span className="text-xs text-muted-foreground italic">Protected</span>
                    ) : (
                      <Select value={u.role} onValueChange={val => handleChangeRole(u.user_id, val)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin — Full access</SelectItem>
                          <SelectItem value="hr">HR — Receives escalations</SelectItem>
                          <SelectItem value="recruiter">Recruiter — Assigned jobs</SelectItem>
                          <SelectItem value="interviewer">Interviewer — Feedback only</SelectItem>
                          <SelectItem value="__remove_staff__" className="text-destructive focus:text-destructive">
                            Applicant — Remove staff access
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Switch
                        checked={!!u.profile?.can_conduct_interviews}
                        onCheckedChange={() => handleToggleCanConduct(u.user_id, !!u.profile?.can_conduct_interviews)}
                        title={u.profile?.can_conduct_interviews ? 'Remove from interviewer pool' : 'Add to interviewer pool'}
                      />
                      {u.profile?.can_conduct_interviews && <Video className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!isSuperAdmin && (
                      <div className="flex items-center gap-1">
                        {u.email_confirmed !== true && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2"
                            title="Confirm email so user can log in"
                            disabled={confirmingId === u.user_id}
                            onClick={() => handleConfirmEmail(u.user_id, u.profile?.full_name)}
                          >
                            {confirmingId === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm Email'}
                          </Button>
                        )}
                        {u.role !== 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                            onClick={() => setArchiveTarget(u)}
                          >
                            <UserX className="h-3 w-3 mr-1" /> Archive
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveRole(u.user_id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {activeUsers.length > 0 && (
        <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * USER_ROLES_PAGE_SIZE + 1}–{Math.min(safePage * USER_ROLES_PAGE_SIZE, activeUsers.length)} of {activeUsers.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>›</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages}>»</Button>
          </div>
        </div>
      )}

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Pending Approval</h3>
            <Badge variant="secondary" className="text-xs">{pendingUsers.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            These users signed up for internal access but haven&apos;t been assigned a staff role yet.
            Applicant portal signups appear under the Applicants tab instead.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-64">Approve as</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map(u => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {u.email_confirmed !== true && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5 text-amber-600 border-amber-300 hover:bg-amber-50"
                            disabled={confirmingId === u.user_id || rejectingPendingId === u.user_id}
                            onClick={() => handleConfirmEmail(u.user_id, u.full_name)}
                          >
                            {confirmingId === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm Email'}
                          </Button>
                        )}
                        {u.email_confirmed !== true && (
                          <span className="text-muted-foreground text-xs">then →</span>
                        )}
                        {(['interviewer', 'recruiter', 'admin'] as const).map(r => (
                          <Button
                            key={r}
                            size="sm"
                            variant={r === 'interviewer' ? 'default' : 'outline'}
                            className="h-7 text-xs px-2.5"
                            disabled={approvingId === u.user_id || registeringApplicantId === u.user_id || rejectingPendingId === u.user_id}
                            onClick={() => handleApproveUser(u.user_id, u.email, r)}
                          >
                            {approvingId === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : r.charAt(0).toUpperCase() + r.slice(1)}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2.5 text-blue-600 border-blue-300 hover:bg-blue-50"
                          disabled={registeringApplicantId === u.user_id || approvingId === u.user_id || rejectingPendingId === u.user_id}
                          onClick={() => handleRegisterAsApplicant(u.user_id, u.email)}
                        >
                          {registeringApplicantId === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Applicant portal'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Remove this pending signup"
                          disabled={rejectingPendingId === u.user_id || approvingId === u.user_id || registeringApplicantId === u.user_id || confirmingId === u.user_id}
                          onClick={() => handleRejectPending(u.user_id, u.full_name, u.email)}
                        >
                          {rejectingPendingId === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1" /> Remove</>}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Deactivated Users */}
      {users.filter(u => u.profile?.is_active === false || !!u.profile?.deactivated_at).length > 0 && (
        <div className="space-y-2 pt-2">
          <button
            onClick={() => setShowDeactivated(v => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDeactivated ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Deactivated users ({users.filter(u => u.profile?.is_active === false || !!u.profile?.deactivated_at).length})
          </button>
          {showDeactivated && (
            <div className="border rounded-lg overflow-hidden opacity-70">
              <Table>
                <TableBody>
                  {users.filter(u => u.profile?.is_active === false || !!u.profile?.deactivated_at).map(u => (
                    <TableRow key={u.user_id} className="bg-muted/30">
                      <TableCell className="font-medium text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <UserX className="h-3.5 w-3.5 text-muted-foreground/60" />
                          {u.profile?.full_name || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.profile?.email || '—'}</TableCell>
                      <TableCell>{roleBadge(u.role)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.profile?.deactivated_at
                          ? `Archived ${new Date(u.profile.deactivated_at).toLocaleDateString()}`
                          : 'Archived'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleReactivate(u.user_id, u.profile?.full_name || 'User')}
                        >
                          <RotateCcw className="h-3 w-3" /> Reactivate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Archive Wizard Dialog */}
      {archiveTarget && (() => {
        const alreadyDeactivated = archiveTarget.profile?.is_active === false || !!archiveTarget.profile?.deactivated_at;
        const activeRecruiters = users.filter(u =>
          u.profile?.is_active !== false &&
          !u.profile?.deactivated_at &&
          u.user_id !== archiveTarget.user_id &&
          ['recruiter', 'hr', 'admin'].includes(u.role)
        );
        const needsReassign = (archiveImpact?.ownedCandidates ?? 0) > 0;
        const isLastStep = archiveStep === 'done';

        return (
          <Dialog open={true} onOpenChange={(open) => { if (!open && !isArchiving) { setArchiveTarget(null); setArchiveStep('overview'); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-destructive" />
                  {isLastStep ? 'User Archived' : `Archive ${archiveTarget.profile?.full_name || 'User'}`}
                </DialogTitle>
              </DialogHeader>

              {alreadyDeactivated ? (
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    <strong>{archiveTarget.profile?.full_name}</strong> is already archived.
                    Their login is disabled and they have no active assignments.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => setArchiveTarget(null)}>Close</Button>
                </div>
              ) : isLastStep && archiveResult ? (
                <div className="space-y-3 py-2">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{archiveTarget.profile?.full_name || 'User'} has been archived.</span>
                  </div>
                  <div className="space-y-1.5 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
                    {/* Recruiter / HR — show candidate + job info */}
                    {['recruiter', 'hr'].includes(archiveTarget.role) && (
                      <>
                        <p>✓ {archiveResult.candidatesTransferred} candidate{archiveResult.candidatesTransferred !== 1 ? 's' : ''} transferred to new owner</p>
                        <p>✓ Job assignments removed</p>
                      </>
                    )}
                    {/* Interviewer — show interview assignment info */}
                    {archiveTarget.role === 'interviewer' && (
                      <p>✓ Interview assignments removed</p>
                    )}
                    {/* Scheduled interviews — relevant for all roles */}
                    {archiveResult.interviewsFlagged > 0 && (
                      <p>⚠ {archiveResult.interviewsFlagged} scheduled interview{archiveResult.interviewsFlagged !== 1 ? 's' : ''} flagged — recruiters notified</p>
                    )}
                    <p>✓ Login disabled</p>
                  </div>
                  <Button className="w-full" onClick={() => { setArchiveTarget(null); setArchiveStep('overview'); }}>Done</Button>
                </div>
              ) : archiveStep === 'overview' ? (
                <div className="space-y-4 py-2">
                  {loadingImpact ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <>
                      <div className="space-y-2 text-sm bg-muted/40 rounded-lg p-3">
                        <p className="font-medium text-foreground">{archiveTarget.profile?.full_name} · {archiveTarget.profile?.email}</p>
                        <div className="space-y-1 text-muted-foreground pt-1">
                          {/* Recruiter / HR only */}
                          {['recruiter', 'hr'].includes(archiveTarget.role) && (archiveImpact?.ownedCandidates ?? 0) > 0 && (
                            <p>👤 {archiveImpact!.ownedCandidates} owned candidate{archiveImpact!.ownedCandidates !== 1 ? 's' : ''} will be reassigned</p>
                          )}
                          {['recruiter', 'hr'].includes(archiveTarget.role) && (archiveImpact?.jobAssignments ?? 0) > 0 && (
                            <p>📋 {archiveImpact!.jobAssignments} job assignment{archiveImpact!.jobAssignments !== 1 ? 's' : ''} will be removed</p>
                          )}
                          {/* All roles */}
                          {(archiveImpact?.pendingInterviews?.length ?? 0) > 0 && (
                            <p>🗓 {archiveImpact!.pendingInterviews.length} scheduled interview{archiveImpact!.pendingInterviews.length !== 1 ? 's' : ''} will be flagged for reassignment</p>
                          )}
                          {/* Clean state */}
                          {(archiveTarget.role === 'interviewer'
                            ? (archiveImpact?.pendingInterviews?.length ?? 0) === 0
                            : (archiveImpact?.ownedCandidates ?? 0) === 0 &&
                              (archiveImpact?.jobAssignments ?? 0) === 0 &&
                              (archiveImpact?.pendingInterviews?.length ?? 0) === 0
                          ) && (
                            <p className="text-emerald-600">No active assignments — clean archive.</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground pt-1 border-t mt-2">Historical feedback, interview records, and sourcing activity are fully preserved.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setArchiveTarget(null)}>Cancel</Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          disabled={loadingImpact}
                          onClick={() => {
                            if (needsReassign) { setArchiveStep('reassign'); }
                            else { handleArchive(); }
                          }}
                        >
                          {needsReassign ? 'Next — Reassign →' : (isArchiving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Archiving…</> : 'Archive User')}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Step 2 — Reassign candidates */
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    {archiveImpact!.ownedCandidates} candidate{archiveImpact!.ownedCandidates !== 1 ? 's' : ''} owned by <strong>{archiveTarget.profile?.full_name}</strong> must be reassigned before archiving.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Reassign all to</label>
                    <Select value={replacementId} onValueChange={setReplacementId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a recruiter…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeRecruiters.map(r => (
                          <SelectItem key={r.user_id} value={r.user_id}>
                            {r.profile?.full_name || r.profile?.email || r.user_id}
                            <span className="ml-1.5 text-xs text-muted-foreground">({r.role})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setArchiveStep('overview')}>← Back</Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={!replacementId || isArchiving}
                      onClick={handleArchive}
                    >
                      {isArchiving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Archiving…</> : 'Confirm & Archive'}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

function ApplicantPortalUsersSection() {
  const [applicants, setApplicants] = useState<ApplicantPortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchApplicants = async () => {
    setLoading(true);
    const [{ data: roles, error: rolesError }, { data: rows, error: applicantsError }] = await Promise.all([
      supabase.from('user_roles').select('user_id'),
      supabase
        .from('applicant_profiles')
        .select('user_id, full_name, email, phone, created_at')
        .order('created_at', { ascending: false }),
    ]);

    if (rolesError || applicantsError) {
      toast.error('Failed to load applicant portal users');
      setLoading(false);
      return;
    }

    const staffUserIds = new Set((roles || []).map(r => r.user_id));
    const filtered = (rows || []).filter(a => !staffUserIds.has(a.user_id));
    const confirmationMap = await fetchEmailConfirmationMap(filtered.map(a => a.user_id));
    setApplicants(filtered.map(a => ({
      ...a,
      email_confirmed: confirmationMap.get(a.user_id),
    })));
    setCurrentPage(1);
    setLoading(false);
  };

  useEffect(() => { fetchApplicants(); }, []);

  const handleConfirmEmail = async (userId: string, name: string | null | undefined) => {
    setConfirmingId(userId);
    try {
      const { error } = await supabase.functions.invoke('admin-confirm-user', {
        body: { user_id: userId },
      });
      if (error) throw error;
      toast.success(`Email confirmed for ${name || userId} — they can now log in`);
      await fetchApplicants();
    } catch (err: any) {
      toast.error(`Failed to confirm email: ${err?.message || 'Unknown error'}`);
    }
    setConfirmingId(null);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const totalPages = Math.max(1, Math.ceil(applicants.length / USER_ROLES_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedApplicants = applicants.slice((safePage - 1) * USER_ROLES_PAGE_SIZE, safePage * USER_ROLES_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {applicants.length} applicant portal {applicants.length === 1 ? 'user' : 'users'}
      </p>
      <p className="text-xs text-muted-foreground">
        Applicant portal users without a staff role. Staff members are managed on the Staff tab.
      </p>
      <div className="border rounded-lg overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applicants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No applicant portal users yet.
                </TableCell>
              </TableRow>
            ) : (
              pagedApplicants.map(a => (
                <TableRow key={a.user_id}>
                  <TableCell className="font-medium">{a.full_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.phone || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {a.email_confirmed !== true && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2"
                        title="Confirm email so user can log in"
                        disabled={confirmingId === a.user_id}
                        onClick={() => handleConfirmEmail(a.user_id, a.full_name)}
                      >
                        {confirmingId === a.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm Email'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {applicants.length > 0 && (
        <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * USER_ROLES_PAGE_SIZE + 1}–{Math.min(safePage * USER_ROLES_PAGE_SIZE, applicants.length)} of {applicants.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>›</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages}>»</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RedFlagRulesTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('red_flag_rules');

  const defaults = { employment_gap_months: 3, frequent_switching_months: 12, short_senior_tenure_months: 6 };
  const saved = (configValue as Record<string, number> | null) ?? defaults;

  const [local, setLocal] = useState<typeof defaults>(saved as typeof defaults);

  useEffect(() => { setLocal(saved as typeof defaults); }, [configValue]);

  const isDirty =
    local.employment_gap_months      !== (saved as typeof defaults).employment_gap_months      ||
    local.frequent_switching_months  !== (saved as typeof defaults).frequent_switching_months  ||
    local.short_senior_tenure_months !== (saved as typeof defaults).short_senior_tenure_months;

  const fields: { key: keyof typeof defaults; label: string; description: string }[] = [
    { key: 'employment_gap_months',      label: 'Employment Gap (months)',      description: 'Flag unexplained gaps of this length or more between roles.' },
    { key: 'frequent_switching_months',  label: 'Frequent Switching (months)',  description: "Flag candidates whose average tenure is below this threshold across 3+ roles." },
    { key: 'short_senior_tenure_months', label: 'Short Senior Tenure (months)', description: 'Flag senior/lead titles held for less than this duration.' },
  ];

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Thresholds used when Gemini enriches a candidate profile. Changes apply to the next enrichment run.
        </p>
      </div>

      {isDirty && (
        <Alert>
          <AlertDescription>You have unsaved changes.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-5 max-w-md">
        {fields.map(f => (
          <div key={f.key} className="space-y-1.5">
            <Label>{f.label}</Label>
            <Input
              type="number"
              min={1}
              value={local[f.key]}
              onChange={e => setLocal(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>

      <Button onClick={() => update(local)} disabled={!isDirty || isUpdating}>
        {isUpdating ? 'Saving...' : 'Save Rules'}
      </Button>
    </div>
  );
}

function EmailTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('email_settings');
  const {
    configValue: notifConfigValue,
    isLoading: notifLoading,
    update: updateNotif,
    isUpdating: notifUpdating,
  } = useSystemConfig('email_notification_settings');
  const saved: EmailSettings = {
    ...DEFAULT_EMAIL_SETTINGS,
    ...(configValue as Partial<EmailSettings> | undefined),
  };
  const savedNotif: EmailNotificationSettings = {
    ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
    ...(notifConfigValue as Partial<EmailNotificationSettings> | undefined),
  };

  const [local, setLocal] = useState<EmailSettings>(saved);
  const [localNotif, setLocalNotif] = useState<EmailNotificationSettings>(savedNotif);
  useEffect(() => { setLocal(saved); }, [configValue]);
  useEffect(() => { setLocalNotif(savedNotif); }, [notifConfigValue]);

  const isDirty = (Object.keys(DEFAULT_EMAIL_SETTINGS) as (keyof EmailSettings)[]).some(
    (k) => local[k] !== saved[k],
  );
  const isNotifDirty = (Object.keys(DEFAULT_EMAIL_NOTIFICATION_SETTINGS) as EmailNotificationKey[]).some(
    (k) => localNotif[k] !== savedNotif[k],
  );

  const { data: quota, refetch: refetchQuota } = useQuery({
    queryKey: ['email_send_counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_email_send_counts');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        sentToday: Number((row as { sent_today?: number })?.sent_today ?? 0),
        sentThisMonth: Number((row as { sent_this_month?: number })?.sent_this_month ?? 0),
      };
    },
    refetchInterval: 60_000,
  });

  if (isLoading || notifLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <Tabs defaultValue="configure" className="max-w-lg">
      <TabsList className="grid w-full grid-cols-2 mb-6">
        <TabsTrigger value="configure">Configure</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>

      <TabsContent value="configure" className="space-y-6 mt-0">
        <div>
          <h3 className="text-sm font-medium">Email delivery</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            AWS SES SMTP setup, sender identity, and send quotas.
          </p>
        </div>

        <Alert>
          <AlertDescription>
            Transactional and auth emails use <strong>AWS SES (SMTP)</strong>. Set <code className="text-xs bg-muted px-1 rounded">SES_SMTP_HOST</code>, <code className="text-xs bg-muted px-1 rounded">SES_SMTP_USER</code>, and <code className="text-xs bg-muted px-1 rounded">SES_SMTP_PASSWORD</code> in your edge function environment (Supabase secrets or <code className="text-xs bg-muted px-1 rounded">.env.local</code>). Signup confirmation and password reset are sent via the Supabase Send Email Hook (<code className="text-xs bg-muted px-1 rounded">send-auth-email</code> edge function) — GoTrue SMTP is not used when the hook is enabled.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="email-enabled">Email notifications enabled</Label>
            <p className="text-xs text-muted-foreground mt-0.5">When off, sends are logged as skipped.</p>
          </div>
          <Switch
            id="email-enabled"
            checked={local.enabled}
            onCheckedChange={(checked) => setLocal((prev) => ({ ...prev, enabled: checked }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="from-address">From address</Label>
          <Input
            id="from-address"
            placeholder="system@thetalentapp.io or Company Name &lt;system@thetalentapp.io&gt;"
            value={local.from_address}
            onChange={(e) => setLocal((prev) => ({ ...prev, from_address: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Must be verified in AWS SES (same region as SMTP). When empty, uses <code className="text-xs bg-muted px-1 rounded">SES_SMTP_FROM</code> or <code className="text-xs bg-muted px-1 rounded">EMAIL_FROM</code> env on edge functions, then system@thetalentapp.io.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reply-to">Reply-to (optional)</Label>
          <Input
            id="reply-to"
            placeholder="hr@yourdomain.com"
            value={local.reply_to}
            onChange={(e) => setLocal((prev) => ({ ...prev, reply_to: e.target.value }))}
          />
        </div>

        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Quota usage</p>
          <p className="text-sm text-muted-foreground">
            Today: <strong>{quota?.sentToday ?? '—'}</strong> / {local.daily_quota}
            {' · '}
            This month: <strong>{quota?.sentThisMonth ?? '—'}</strong> / {local.monthly_quota}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchQuota()}>Refresh counts</Button>
        </div>

        {isDirty && (
          <Alert>
            <AlertDescription>You have unsaved changes.</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => update({
            enabled: local.enabled,
            from_address: local.from_address.trim(),
            reply_to: local.reply_to.trim(),
            daily_quota: local.daily_quota,
            monthly_quota: local.monthly_quota,
          })}
          disabled={!isDirty || isUpdating}
        >
          {isUpdating ? 'Saving...' : 'Save Email Settings'}
        </Button>
      </TabsContent>

      <TabsContent value="notifications" className="space-y-4 mt-0">
        <div>
          <h3 className="text-sm font-medium">Notification types</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Turn individual notification types on or off. The master email toggle in Configure must also be enabled.
          </p>
        </div>

        {(Object.keys(DEFAULT_EMAIL_NOTIFICATION_SETTINGS) as EmailNotificationKey[]).map((key) => {
          const meta = EMAIL_NOTIFICATION_LABELS[key];
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`notif-${key}`}>{meta.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
              </div>
              <Switch
                id={`notif-${key}`}
                checked={localNotif[key]}
                onCheckedChange={(checked) =>
                  setLocalNotif((prev) => ({ ...prev, [key]: checked }))
                }
              />
            </div>
          );
        })}

        {isNotifDirty && (
          <Alert>
            <AlertDescription>You have unsaved notification changes.</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => updateNotif(localNotif)}
          disabled={!isNotifDirty || notifUpdating}
        >
          {notifUpdating ? 'Saving...' : 'Save Notification Settings'}
        </Button>
      </TabsContent>
    </Tabs>
  );
}

function AssessmentsTab() {
  const { configValue: orgRaw, isLoading: orgLoading, update: updateOrg, isUpdating: orgUpdating } =
    useSystemConfig('assessment_org_defaults');
  const {
    configValue: genRaw,
    isLoading: genLoading,
    update: updateGen,
    isUpdating: genUpdating,
  } = useSystemConfig('assessment_generation_settings');

  const savedOrg = parseAssessmentOrgDefaults(orgRaw);
  const savedGen = parseAssessmentGenerationSettings(genRaw);

  const [localOrg, setLocalOrg] = useState<AssessmentOrgDefaults>(savedOrg);
  const [localGen, setLocalGen] = useState<AssessmentGenerationSettings>(savedGen);

  useEffect(() => { setLocalOrg(savedOrg); }, [orgRaw]);
  useEffect(() => { setLocalGen(savedGen); }, [genRaw]);

  const isOrgDirty = (Object.keys(DEFAULT_ASSESSMENT_ORG_DEFAULTS) as (keyof AssessmentOrgDefaults)[]).some(
    (k) => localOrg[k] !== savedOrg[k],
  );

  const isGenDirty = JSON.stringify(localGen) !== JSON.stringify(savedGen);

  function updateTier(tier: AssessmentTier, patch: Partial<AssessmentTierGenerationSettings>) {
    setLocalGen((prev) => {
      const next = { ...prev.tiers[tier], ...patch };
      if (isNonTechAssessmentTier(tier)) {
        next.min_coding_questions = 0;
        next.max_coding_questions = 0;
      }
      return { ...prev, tiers: { ...prev.tiers, [tier]: next } };
    });
  }

  if (orgLoading || genLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <Tabs defaultValue="configure" className="max-w-4xl">
      <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md">
        <TabsTrigger value="configure">Configure</TabsTrigger>
        <TabsTrigger value="ai-generation">AI generation</TabsTrigger>
      </TabsList>

      <TabsContent value="configure" className="space-y-6 mt-0">
        <div>
          <h3 className="text-sm font-medium">Org assessment defaults</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            New jobs inherit these values. Pass threshold: org default → job override → assessment passing score.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-deadline-days">Default deadline (days)</Label>
          <Input
            id="assessment-deadline-days"
            type="number"
            min={1}
            max={90}
            value={localOrg.deadline_days}
            onChange={(e) =>
              setLocalOrg((prev) => ({
                ...prev,
                deadline_days: Math.max(1, parseInt(e.target.value) || DEFAULT_ASSESSMENT_ORG_DEFAULTS.deadline_days),
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-pass-threshold">Default pass threshold (%)</Label>
          <Input
            id="assessment-pass-threshold"
            type="number"
            min={0}
            max={100}
            placeholder="Leave empty to use each assessment's passing score"
            value={localOrg.default_pass_threshold ?? ''}
            onChange={(e) =>
              setLocalOrg((prev) => ({
                ...prev,
                default_pass_threshold: e.target.value ? Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) : null,
              }))
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="assessment-require-pass">Require pass before interview</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Block pipeline advance until assessment is passed.</p>
          </div>
          <Switch
            id="assessment-require-pass"
            checked={localOrg.require_pass_before_interview}
            onCheckedChange={(checked) =>
              setLocalOrg((prev) => ({ ...prev, require_pass_before_interview: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="assessment-notify-recruiter">Notify recruiter on completion</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Send in-app notification when a candidate finishes.</p>
          </div>
          <Switch
            id="assessment-notify-recruiter"
            checked={localOrg.notify_recruiter_on_complete}
            onCheckedChange={(checked) =>
              setLocalOrg((prev) => ({ ...prev, notify_recruiter_on_complete: checked }))
            }
          />
        </div>

        {isOrgDirty && (
          <Alert>
            <AlertDescription>You have unsaved org default changes.</AlertDescription>
          </Alert>
        )}

        <Button onClick={() => updateOrg(localOrg)} disabled={!isOrgDirty || orgUpdating}>
          {orgUpdating ? 'Saving...' : 'Save Org Defaults'}
        </Button>
      </TabsContent>

      <TabsContent value="ai-generation" className="space-y-6 mt-0">
        <div>
          <h3 className="text-sm font-medium">Global structure</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Section count, questions per section, and marks apply to all tiers.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gen-section-count">Section count</Label>
            <Input
              id="gen-section-count"
              type="number"
              min={1}
              max={10}
              value={localGen.global.section_count}
              onChange={(e) =>
                setLocalGen((prev) => ({
                  ...prev,
                  global: {
                    ...prev.global,
                    section_count: Math.max(1, parseInt(e.target.value) || 1),
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-questions-per-section">Questions per section</Label>
            <Input
              id="gen-questions-per-section"
              type="number"
              min={1}
              max={10}
              value={localGen.global.questions_per_section}
              onChange={(e) =>
                setLocalGen((prev) => ({
                  ...prev,
                  global: {
                    ...prev.global,
                    questions_per_section: Math.max(1, parseInt(e.target.value) || 1),
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-marks-mcq">MCQ marks</Label>
            <Input
              id="gen-marks-mcq"
              type="number"
              min={1}
              max={20}
              value={localGen.global.marks.mcq}
              onChange={(e) =>
                setLocalGen((prev) => ({
                  ...prev,
                  global: {
                    ...prev.global,
                    marks: { ...prev.global.marks, mcq: Math.max(1, parseInt(e.target.value) || 1) },
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-marks-coding">Coding marks</Label>
            <Input
              id="gen-marks-coding"
              type="number"
              min={1}
              max={20}
              value={localGen.global.marks.coding}
              onChange={(e) =>
                setLocalGen((prev) => ({
                  ...prev,
                  global: {
                    ...prev.global,
                    marks: { ...prev.global.marks, coding: Math.max(1, parseInt(e.target.value) || 1) },
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-marks-subjective">Subjective marks</Label>
            <Input
              id="gen-marks-subjective"
              type="number"
              min={1}
              max={20}
              value={localGen.global.marks.subjective}
              onChange={(e) =>
                setLocalGen((prev) => ({
                  ...prev,
                  global: {
                    ...prev.global,
                    marks: { ...prev.global.marks, subjective: Math.max(1, parseInt(e.target.value) || 1) },
                  },
                }))
              }
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium">Per-tier settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Duration, passing score, and coding limits per experience tier. Non-tech tiers cannot enable coding.
          </p>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>Duration (min)</TableHead>
                <TableHead>Passing %</TableHead>
                <TableHead>Min coding</TableHead>
                <TableHead>Max coding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ASSESSMENT_TIERS.map((tier) => {
                const row = localGen.tiers[tier];
                const locked = isNonTechAssessmentTier(tier);
                return (
                  <TableRow key={tier}>
                    <TableCell className="font-medium text-sm whitespace-nowrap">
                      {assessmentTierLabels[tier]}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={15}
                        max={180}
                        className="w-20"
                        value={row.duration_minutes}
                        onChange={(e) =>
                          updateTier(tier, {
                            duration_minutes: Math.max(15, parseInt(e.target.value) || 15),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={40}
                        max={90}
                        className="w-20"
                        value={row.passing_score}
                        onChange={(e) =>
                          updateTier(tier, {
                            passing_score: Math.min(90, Math.max(40, parseInt(e.target.value) || 40)),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        className="w-16"
                        disabled={locked}
                        value={locked ? 0 : row.min_coding_questions}
                        onChange={(e) =>
                          updateTier(tier, {
                            min_coding_questions: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        className="w-16"
                        disabled={locked}
                        value={locked ? 0 : row.max_coding_questions}
                        onChange={(e) =>
                          updateTier(tier, {
                            max_coding_questions: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {isGenDirty && (
          <Alert>
            <AlertDescription>You have unsaved AI generation changes.</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => {
            const normalized = parseAssessmentGenerationSettings(localGen);
            updateGen(normalized);
          }}
          disabled={!isGenDirty || genUpdating}
        >
          {genUpdating ? 'Saving...' : 'Save AI Generation Settings'}
        </Button>
      </TabsContent>
    </Tabs>
  );
}

function SocialDraftsTab() {
  const { data: latest, isLoading: latestLoading } = useSocialDraftsLatest();
  const { data: history, isLoading: historyLoading } = useSocialDraftsHistory();
  const {
    enabled: autoEnabled,
    isLoading: enabledLoading,
    setEnabled,
    isUpdating: isTogglingEnabled,
  } = useSocialDraftsEnabled();
  const { mutate: generateNow, isPending: isGenerating } = useGenerateSocialDrafts();
  const { mutate: togglePosted, isPending: isTogglingPosted, variables: toggleVars } = useToggleSocialDraftPosted();
  const { drafts, pillars, generatedAt, repoUrl } = latest ?? parseSocialDraftsLatest(null);

  const pendingCount = drafts.filter((d) => !d.posted).length;

  const archiveEntries = (history?.entries ?? []).filter(
    (entry) => entry.generatedAt && entry.drafts.length > 0 && entry.generatedAt !== generatedAt,
  );

  const handleTogglePosted = (entryGeneratedAt: string | null, draftIndex: number) => {
    togglePosted({ generatedAt: entryGeneratedAt, draftIndex });
  };

  if (latestLoading || historyLoading || enabledLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Daily TTA OSS Twitter Drafts</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Chitragupta generates 3 distinct tweet options each morning — Feature, OSS stack, and CTA angles — so you can post multiple times/day promoting{' '}
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
            The Talent App
          </a>{' '}
          on X/Twitter. Copy any draft and mark <strong>Posted</strong> after you publish on X — nothing is posted automatically.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4 flex-1">
          <div>
            <Label htmlFor="social-drafts-auto">Daily auto-generation</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {autoEnabled
                ? 'Cron runs ~9:15 AM IST and notifies you when drafts are ready.'
                : 'Cron is paused. Use Generate now anytime — existing drafts stay available.'}
            </p>
          </div>
          <Switch
            id="social-drafts-auto"
            checked={autoEnabled}
            disabled={isTogglingEnabled}
            onCheckedChange={(checked) => setEnabled(checked)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isGenerating}
          onClick={() => generateNow()}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Generate now
            </>
          )}
        </Button>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No drafts yet.{' '}
          {autoEnabled
            ? 'Chitra will deliver the first set after the daily cron runs, or use Generate now.'
            : 'Daily auto-generation is off — use Generate now to create a set.'}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">Latest</h4>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {pendingCount} pending
                </Badge>
              )}
              {pendingCount === 0 && drafts.length > 0 && (
                <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  All posted
                </Badge>
              )}
            </div>
            {generatedAt && (
              <p className="text-xs text-muted-foreground text-right">
                {new Date(generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
              </p>
            )}
          </div>
          {(pillars.length > 0) && (
            <p className="text-xs text-muted-foreground">
              Topics: {pillars.map(p => `${p.label}: ${p.topic.title}`).join(' · ')}
            </p>
          )}
          <SocialDraftsCards
            data={latest ?? parseSocialDraftsLatest(null)}
            onTogglePosted={(i) => handleTogglePosted(generatedAt, i)}
            togglingPostedIndex={isTogglingPosted && toggleVars?.generatedAt === generatedAt ? toggleVars.draftIndex : null}
          />
        </div>
      )}

      {archiveEntries.length > 0 && (
        <div className="space-y-4 border-t pt-6">
          <div>
            <h4 className="text-sm font-medium">Archive</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Previous runs — copy older drafts if you skipped a day.
            </p>
          </div>
          {archiveEntries.map((entry) => (
            <div key={entry.generatedAt ?? entry.id} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {entry.generatedAt
                  ? new Date(entry.generatedAt).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Unknown date'}{' '}
                IST
              </p>
              <SocialDraftsCards
                data={entry}
                onTogglePosted={(i) => handleTogglePosted(entry.generatedAt, i)}
                togglingPostedIndex={
                  isTogglingPosted && toggleVars?.generatedAt === entry.generatedAt ? toggleVars.draftIndex : null
                }
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t pt-4">
        SparxIT private only — not included in the public OSS export.
      </p>
    </div>
  );
}

function ChitraTab() {
  const { configValue, isLoading, update, isUpdating } = useSystemConfig('chitra_escalation_thresholds');

  const defaults = { grace_minutes: 30, level1_hours: 24, level2_hours: 48, level3_hours: 72, level4_hours: 96 };
  const saved = (configValue as Record<string, number> | null) ?? defaults;

  const [local, setLocal] = useState<typeof defaults>(saved as typeof defaults);
  useEffect(() => { setLocal(saved as typeof defaults); }, [configValue]);

  const isDirty = Object.keys(defaults).some(
    k => local[k as keyof typeof defaults] !== (saved as typeof defaults)[k as keyof typeof defaults]
  );

  const fields: { key: keyof typeof defaults; label: string; description: string }[] = [
    { key: 'grace_minutes',    label: 'Grace Period (minutes)',    description: 'Time after a scheduled interview before Chitra sends the first nudge.' },
    { key: 'level1_hours',     label: 'Level 1 — Firm nudge (hours)', description: 'Hours after the first nudge before Chitra follows up firmly and loops in the recruiter.' },
    { key: 'level2_hours',     label: 'Level 2 — HR Escalation (hours)', description: 'Total hours overdue before Chitra notifies HR.' },
    { key: 'level3_hours',     label: 'Level 3 — Admin Report (hours)', description: 'Total hours overdue before Chitra notes this in the super-admin daily report.' },
    { key: 'level4_hours',     label: 'Level 4 — Formal Warning (hours)', description: 'Total hours overdue before Chitra issues a formal on-record warning to all parties.' },
  ];

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      {/* Escalation thresholds */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Escalation Thresholds</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controls when Chitra advances each escalation level for overdue interview feedback.
          </p>
        </div>

        {isDirty && (
          <Alert>
            <AlertDescription>You have unsaved changes.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-5 max-w-md">
          {fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type="number"
                min={1}
                value={local[f.key]}
                onChange={e => setLocal(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>

        <Button onClick={() => update(local)} disabled={!isDirty || isUpdating}>
          {isUpdating ? 'Saving...' : 'Save Thresholds'}
        </Button>
      </div>

      {/* KRA overview */}
      <div className="space-y-4 border-t pt-6">
        <div>
          <h3 className="text-sm font-semibold">Active KRAs</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chitra's current responsibilities. Edit <code className="text-xs bg-muted px-1 py-0.5 rounded">CHITRA_KRA.md</code> to update.
          </p>
        </div>

        <div className="space-y-3">
          {/* KRA 1 */}
          <div className="rounded-lg border bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 p-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 shrink-0 mt-0.5">
                <Eye className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">KRA 1 — Overdue Interview Feedback</p>
                  <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monitors every scheduled interview. Escalates from a warm nudge to a formal on-record warning if feedback isn't submitted within the grace period.
                </p>
                <div className="mt-2 grid grid-cols-5 gap-1.5 text-[10px]">
                  {[
                    { level: 'L0', label: 'Nudge', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
                    { level: 'L1', label: 'Firm + Recruiter', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
                    { level: 'L2', label: 'HR Notified', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
                    { level: 'L3', label: 'Admin Report', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
                    { level: 'L4', label: 'Formal Warning', color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300 font-bold' },
                  ].map(s => (
                    <div key={s.level} className={`rounded px-1.5 py-1 text-center ${s.color}`}>
                      <div className="font-bold">{s.level}</div>
                      <div>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Planned KRAs */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Planned (Phase 2+)</p>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>KRA 2 — Candidate Stage Stagnation: flag candidates stuck &gt;5 days with no activity</p>
              <p>KRA 3 — Job Deadline Pipeline Health: alert when deadline &lt;5 days with few advanced candidates</p>
              <p>KRA 4 — Reward & Recognition: praise interviewers and recruiters for on-time actions</p>
              <p>KRA 5 — Super Admin Daily Report: 8 AM briefing of all violations, rewards, and pipeline health</p>
              <p>KRA 6 — Two-Way Chat: natural language queries to Chitra about pipeline state and team performance</p>
            </div>
          </div>
        </div>

        {/* Guardrails */}
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guardrails</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Chitra never modifies candidate data, pipeline positions, or interview records.</li>
            <li>Chitra only inserts into <code className="bg-muted px-1 rounded">notifications</code> and <code className="bg-muted px-1 rounded">chitra_escalations</code>.</li>
            <li>Chitra does not contact candidates — internal users only.</li>
            <li>All Chitra actions are logged and auditable via the <code className="bg-muted px-1 rounded">chitra_escalations</code> table.</li>
            <li>Super admin is the only user who cannot be acted upon by Chitra.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

type AnnouncementType = 'info' | 'warning' | 'release' | 'maintenance';

interface Announcement {
  id: string;
  message: string;
  link_label: string | null;
  link_url: string | null;
  type: AnnouncementType;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

function AnnouncementsTab() {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AnnouncementType>('info');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [expiry, setExpiry] = useState<string>('never');
  const [showForm, setShowForm] = useState(false);

  const expiryOptions = [
    { value: 'never', label: 'Never' },
    { value: '24h',   label: '24 hours' },
    { value: '48h',   label: '48 hours' },
    { value: '7d',    label: '7 days' },
    { value: '30d',   label: '30 days' },
  ];

  const computeExpiresAt = (val: string): string | null => {
    const now = Date.now();
    if (val === '24h') return new Date(now + 24 * 3600_000).toISOString();
    if (val === '48h') return new Date(now + 48 * 3600_000).toISOString();
    if (val === '7d')  return new Date(now + 7  * 86400_000).toISOString();
    if (val === '30d') return new Date(now + 30 * 86400_000).toISOString();
    return null;
  };

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ['announcements-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, message, link_label, link_url, type, is_active, created_at, expires_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('announcements').insert({
        message: message.trim(),
        type,
        link_label: linkLabel.trim() || null,
        link_url: linkUrl.trim() || null,
        is_active: false,
        expires_at: computeExpiresAt(expiry),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements-all'] });
      setMessage(''); setType('info'); setLinkLabel(''); setLinkUrl(''); setExpiry('never');
      setShowForm(false);
      toast.success('Announcement created');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      const { error } = await supabase.from('announcements').update({ is_active: activate }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements-all'] });
      qc.invalidateQueries({ queryKey: ['active-announcements'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements-all'] });
      qc.invalidateQueries({ queryKey: ['active-announcements'] });
      toast.success('Deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const typeColors: Record<AnnouncementType, string> = {
    info: 'bg-blue-100 text-blue-700 border-blue-300',
    release: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    warning: 'bg-amber-100 text-amber-700 border-amber-300',
    maintenance: 'bg-red-100 text-red-700 border-red-300',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Multiple announcements can be active simultaneously — the bar cycles through them automatically every 5 seconds.
        </p>
        <Button size="sm" className="gap-1.5 btn-gradient text-primary-foreground" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4" />
          New Announcement
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="What do you want to announce?"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={v => setType(v as AnnouncementType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="release">Release</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expires</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {expiryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CTA Label <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Learn more" />
              </div>
              <div className="space-y-2">
                <Label>CTA URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://... or /path" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!message.trim() || createMutation.isPending}
                className="btn-gradient text-primary-foreground"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No announcements yet.</div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => (
            <div key={a.id} className={`rounded-lg border p-4 flex items-start gap-4 ${a.is_active ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
              <div className="mt-0.5">
                {a.is_active
                  ? <CheckCircle className="w-5 h-5 text-primary" />
                  : <Circle className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-sm font-medium leading-snug">{a.message}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${typeColors[a.type]}`}>{a.type}</Badge>
                  {a.link_label && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />{a.link_label}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {a.expires_at && (() => {
                    const expired = new Date(a.expires_at) < new Date();
                    return (
                      <span className={`text-xs font-medium ${expired ? 'text-destructive' : 'text-muted-foreground'}`}>
                        · {expired ? 'Expired' : `Expires ${new Date(a.expires_at).toLocaleDateString()}`}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant={a.is_active ? 'outline' : 'default'}
                  className={a.is_active ? '' : 'btn-gradient text-primary-foreground'}
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate({ id: a.id, activate: !a.is_active })}
                >
                  {a.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(a.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VendorsTab() {
  const { data: vendors = [], isLoading } = useVendors();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const emptyForm = { name: '', source_key: '', contact_name: '', contact_email: '', fee_pct: '', guarantee_days: '' };
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof emptyForm>(emptyForm);

  function openEdit(v: Vendor) {
    setEditId(v.id);
    setEditForm({
      name: v.name,
      source_key: v.source_key,
      contact_name: v.contact_name || '',
      contact_email: v.contact_email || '',
      fee_pct: v.fee_pct != null ? String(v.fee_pct) : '',
      guarantee_days: v.guarantee_days != null ? String(v.guarantee_days) : '',
    });
  }

  async function handleAdd() {
    if (!form.name.trim() || !form.source_key.trim()) return;
    try {
      await createVendor.mutateAsync({
        name: form.name.trim(),
        source_key: form.source_key.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        fee_pct: form.fee_pct ? parseFloat(form.fee_pct) : null,
        guarantee_days: form.guarantee_days ? parseInt(form.guarantee_days) : null,
      });
      setForm(emptyForm);
      setAddOpen(false);
      toast.success('Vendor added');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to add vendor');
    }
  }

  async function handleSaveEdit() {
    if (!editId || !editForm.name.trim() || !editForm.source_key.trim()) return;
    try {
      await updateVendor.mutateAsync({
        id: editId,
        name: editForm.name.trim(),
        source_key: editForm.source_key.trim(),
        contact_name: editForm.contact_name.trim() || null,
        contact_email: editForm.contact_email.trim() || null,
        fee_pct: editForm.fee_pct ? parseFloat(editForm.fee_pct) : null,
        guarantee_days: editForm.guarantee_days ? parseInt(editForm.guarantee_days) : null,
      });
      setEditId(null);
      toast.success('Vendor updated');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to update vendor');
    }
  }

  async function handleToggleActive(v: Vendor) {
    await updateVendor.mutateAsync({ id: v.id, is_active: !v.is_active });
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this vendor? Existing candidates tagged with this vendor source will retain their source tag.')) return;
    await deleteVendor.mutateAsync(id);
    toast.success('Vendor deleted');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} registered
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Recruitment Vendor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-full sm:col-span-2 space-y-1">
                  <Label>Vendor Name *</Label>
                  <Input
                    placeholder="e.g. Acme Recruiting Partners"
                    value={form.name}
                    onChange={e => setForm(f => ({
                      ...f,
                      name: e.target.value,
                      source_key: f.source_key || toSourceKey(e.target.value),
                    }))}
                  />
                </div>
                <div className="col-span-full sm:col-span-2 space-y-1">
                  <Label>Source Key * <span className="text-xs text-muted-foreground">(auto-generated, used internally)</span></Label>
                  <Input
                    placeholder="vendor_acme_recruiting"
                    value={form.source_key}
                    onChange={e => setForm(f => ({ ...f, source_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contact Name</Label>
                  <Input placeholder="John Smith" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Contact Email</Label>
                  <Input placeholder="john@acme.com" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fee % <span className="text-xs text-muted-foreground">(placement)</span></Label>
                  <Input type="number" min="0" max="100" step="0.5" placeholder="8.33" value={form.fee_pct} onChange={e => setForm(f => ({ ...f, fee_pct: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Guarantee Days</Label>
                  <Input type="number" min="0" placeholder="90" value={form.guarantee_days} onChange={e => setForm(f => ({ ...f, guarantee_days: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={createVendor.isPending || !form.name.trim() || !form.source_key.trim()}>
                {createVendor.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Add Vendor
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Building2 className="h-10 w-10 opacity-20" />
          <p className="text-sm">No vendors yet. Add your first recruitment partner.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Source Key</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-center">Fee %</TableHead>
              <TableHead className="text-center">Guarantee</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map(v => (
              <TableRow key={v.id}>
                {editId === v.id ? (
                  <>
                    <TableCell><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" /></TableCell>
                    <TableCell><Input value={editForm.source_key} onChange={e => setEditForm(f => ({ ...f, source_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} className="h-8 text-sm font-mono" /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input value={editForm.contact_name} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))} className="h-7 text-xs" placeholder="Name" />
                        <Input value={editForm.contact_email} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} className="h-7 text-xs" placeholder="Email" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center"><Input type="number" value={editForm.fee_pct} onChange={e => setEditForm(f => ({ ...f, fee_pct: e.target.value }))} className="h-8 text-sm w-20 mx-auto text-center" /></TableCell>
                    <TableCell className="text-center"><Input type="number" value={editForm.guarantee_days} onChange={e => setEditForm(f => ({ ...f, guarantee_days: e.target.value }))} className="h-8 text-sm w-20 mx-auto text-center" /></TableCell>
                    <TableCell />
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSaveEdit} disabled={updateVendor.isPending}><Save className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{v.source_key}</code></TableCell>
                    <TableCell>
                      {v.contact_name && <p className="text-sm">{v.contact_name}</p>}
                      {v.contact_email && <p className="text-xs text-muted-foreground">{v.contact_email}</p>}
                      {!v.contact_name && !v.contact_email && <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">{v.fee_pct != null ? `${v.fee_pct}%` : '—'}</TableCell>
                    <TableCell className="text-center">{v.guarantee_days != null ? `${v.guarantee_days}d` : '—'}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={v.is_active} onCheckedChange={() => handleToggleActive(v)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PrescreenQuestionsTab() {
  const { data: questions = [], isLoading } = usePrescreenQuestions();
  const createQuestion = useCreatePrescreenQuestion();
  const updateQuestion = useUpdatePrescreenQuestion();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PrescreenQuestionBankRow | null>(null);

  const emptyAddForm = { question_text: '', category: '' as PrescreenCategory | '', sort_hint: '' };
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [editForm, setEditForm] = useState({
    question_text: '',
    category: '' as PrescreenCategory | '',
    is_active: true,
    sort_hint: '',
  });

  const existingKeys = questions.map((q) => q.question_key);
  const activeCount = questions.filter((q) => q.is_active).length;
  const addQuestionKey = addForm.question_text.trim()
    ? uniqueQuestionKey(toQuestionKey(addForm.question_text), existingKeys)
    : '';

  function openEdit(q: PrescreenQuestionBankRow) {
    setEditing(q);
    setEditForm({
      question_text: q.question_text,
      category: q.category,
      is_active: q.is_active,
      sort_hint: String(q.sort_hint),
    });
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditing(null);
  }

  async function handleAdd() {
    if (!addForm.question_text.trim() || !addForm.category) return;
    try {
      await createQuestion.mutateAsync({
        question_key: addQuestionKey,
        question_text: addForm.question_text.trim(),
        category: addForm.category,
        sort_hint: addForm.sort_hint ? parseInt(addForm.sort_hint, 10) : 0,
      });
      setAddForm(emptyAddForm);
      setAddOpen(false);
      toast.success('Question added');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to add question');
    }
  }

  async function handleSaveEdit() {
    if (!editing || !editForm.question_text.trim() || !editForm.category) return;
    try {
      await updateQuestion.mutateAsync({
        id: editing.id,
        question_text: editForm.question_text.trim(),
        category: editForm.category,
        is_active: editForm.is_active,
        sort_hint: editForm.sort_hint ? parseInt(editForm.sort_hint, 10) : 0,
      });
      closeEdit();
      toast.success('Question updated');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to update question');
    }
  }

  async function handleToggleActive(q: PrescreenQuestionBankRow) {
    try {
      await updateQuestion.mutateAsync({ id: q.id, is_active: !q.is_active });
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to update question');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {activeCount} active / {questions.length} total questions · {PRESCREEN_CATEGORIES.length} categories ·{' '}
          {ASSIGNED_QUESTION_COUNT} picked per application
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add Question
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Pre-screen Question</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label>Category *</Label>
                <Select
                  value={addForm.category}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, category: v as PrescreenCategory }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESCREEN_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {PRESCREEN_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Question Text *</Label>
                <Textarea
                  placeholder="What interests you about working at {{company_name}}?"
                  value={addForm.question_text}
                  onChange={(e) => setAddForm((f) => ({ ...f, question_text: e.target.value }))}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{{company_name}}'} to insert the company name when applicants see the question.
                </p>
              </div>
              {addQuestionKey && (
                <div className="space-y-1">
                  <Label>Question Key</Label>
                  <code className="block text-xs bg-muted px-2 py-1.5 rounded font-mono">{addQuestionKey}</code>
                </div>
              )}
              <div className="space-y-1">
                <Label>Sort Hint</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={addForm.sort_hint}
                  onChange={(e) => setAddForm((f) => ({ ...f, sort_hint: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleAdd}
                disabled={
                  createQuestion.isPending
                  || !addForm.question_text.trim()
                  || !addForm.category
                }
              >
                {createQuestion.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Add Question
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <FileQuestion className="h-10 w-10 opacity-20" />
          <p className="text-sm">No questions in the bank yet. Add your first pre-screen question.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Category</TableHead>
              <TableHead>Question</TableHead>
              <TableHead className="text-center w-[80px]">Active</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((q) => (
              <TableRow key={q.id} className={!q.is_active ? 'opacity-60' : undefined}>
                <TableCell>
                  <Badge variant="outline" className="font-normal whitespace-nowrap">
                    {PRESCREEN_CATEGORY_LABELS[q.category] ?? q.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{q.question_text}</p>
                  <code className="text-[10px] text-muted-foreground">{q.question_key}</code>
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={q.is_active} onCheckedChange={() => handleToggleActive(q)} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(q)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) closeEdit(); else setEditOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pre-screen Question</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label>Question Key</Label>
                <code className="block text-xs bg-muted px-2 py-1.5 rounded font-mono">{editing.question_key}</code>
              </div>
              <div className="space-y-1">
                <Label>Category *</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, category: v as PrescreenCategory }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESCREEN_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {PRESCREEN_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Question Text *</Label>
                <Textarea
                  value={editForm.question_text}
                  onChange={(e) => setEditForm((f) => ({ ...f, question_text: e.target.value }))}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{{company_name}}'} to insert the company name when applicants see the question.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-active">Active</Label>
                <Switch
                  id="edit-active"
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm((f) => ({ ...f, is_active: checked }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Sort Hint</Label>
                <Input
                  type="number"
                  min="0"
                  value={editForm.sort_hint}
                  onChange={(e) => setEditForm((f) => ({ ...f, sort_hint: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSaveEdit}
                disabled={
                  updateQuestion.isPending
                  || !editForm.question_text.trim()
                  || !editForm.category
                }
              >
                {updateQuestion.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type EditableCriterion = ScorecardCriterion & { keyLocked: boolean };

function uniqueCriterionKey(base: string, existing: string[], selfIndex: number): string {
  const others = new Set(existing.filter((_, i) => i !== selfIndex));
  let key = base || 'criterion';
  let n = 2;
  while (others.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

function validateCriteria(criteria: EditableCriterion[]): string | null {
  if (criteria.length === 0) return 'At least one criterion is required';
  const keys = new Set<string>();
  for (const c of criteria) {
    if (!c.label.trim()) return 'Each criterion needs a label';
    if (!c.key.trim()) return 'Each criterion needs a stable key';
    if (keys.has(c.key)) return 'Criterion keys must be unique within a template';
    keys.add(c.key);
  }
  return null;
}

function ScorecardsTab() {
  const { data: templates = [], isLoading } = useScorecardTemplatesList();
  const updateTemplate = useUpdateScorecardTemplate();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ScorecardTemplateRow | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [criteria, setCriteria] = useState<EditableCriterion[]>([]);

  function openEdit(template: ScorecardTemplateRow) {
    setEditing(template);
    setDisplayName(template.display_name);
    setIsActive(template.is_active);
    setCriteria(template.criteria.map(c => ({ ...c, keyLocked: true })));
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditing(null);
  }

  function updateCriterion(index: number, patch: Partial<EditableCriterion>) {
    setCriteria(prev => prev.map((c, i) => {
      if (i !== index) return c;
      const next = { ...c, ...patch };
      if (!c.keyLocked && patch.label !== undefined) {
        const base = slugifyCriterionKey(patch.label);
        const keys = prev.map(x => x.key);
        next.key = uniqueCriterionKey(base, keys, index);
      }
      return next;
    }));
  }

  function addCriterion() {
    const keys = criteria.map(c => c.key);
    setCriteria(prev => [
      ...prev,
      { key: uniqueCriterionKey('criterion', keys, prev.length), label: '', scale_hint: '', keyLocked: false },
    ]);
  }

  function removeCriterion(index: number) {
    if (criteria.length <= 1) {
      toast.error('At least one criterion is required');
      return;
    }
    setCriteria(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!editing) return;
    if (!displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    const validationError = validateCriteria(criteria);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    try {
      await updateTemplate.mutateAsync({
        id: editing.id,
        stage_key: editing.stage_key,
        display_name: displayName.trim(),
        is_active: isActive,
        criteria: criteria.map(({ key, label, scale_hint }) => ({
          key,
          label: label.trim(),
          ...(scale_hint?.trim() ? { scale_hint: scale_hint.trim() } : {}),
        })),
      });
      toast.success('Scorecard template updated');
      closeEdit();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update template');
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {templates.length} scorecard template{templates.length !== 1 ? 's' : ''} — criteria used when interviewers submit feedback. Stage keys map automatically from interview stage names.
      </p>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <ClipboardList className="h-10 w-10 opacity-20" />
          <p className="text-sm">No scorecard templates found. Run the scorecard migration to seed defaults.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Stage Key</TableHead>
              <TableHead className="text-center">Criteria</TableHead>
              <TableHead className="text-center">Kit Questions</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.display_name}</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.stage_key}</code></TableCell>
                <TableCell className="text-center">{t.criteria.length}</TableCell>
                <TableCell className="text-center">{t.prompt_questions.length}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={t.is_active ? 'default' : 'secondary'}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={editOpen} onOpenChange={open => { if (!open) closeEdit(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Scorecard — {editing?.stage_key}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Display name</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Stage key</Label>
                <Input value={editing.stage_key} disabled className="font-mono text-sm bg-muted" />
                <p className="text-[11px] text-muted-foreground">Fixed — matched from interview stage names (e.g. &quot;Technical Round&quot; → technical).</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive templates fall back to the general scorecard.</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Rating criteria</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={addCriterion}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {criteria.map((c, i) => (
                    <div key={`${c.key}-${i}`} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0 mt-1">{c.key}</code>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removeCriterion(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Label (e.g. Technical Depth)"
                        value={c.label}
                        onChange={e => updateCriterion(i, { label: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Scale hint / description (optional)"
                        value={c.scale_hint ?? ''}
                        onChange={e => updateCriterion(i, { scale_hint: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Interview kit questions</Label>
                <p className="text-xs text-muted-foreground">Read-only — seeded defaults copied into interview kits at schedule time.</p>
                <ul className="rounded-lg border border-border divide-y divide-border text-sm">
                  {editing.prompt_questions.length === 0 ? (
                    <li className="px-3 py-2 text-muted-foreground text-xs">No kit questions</li>
                  ) : (
                    editing.prompt_questions.map((q, i) => (
                      <li key={i} className="px-3 py-2 text-muted-foreground">{i + 1}. {q}</li>
                    ))
                  )}
                </ul>
              </div>

              <Button className="w-full gap-2" onClick={handleSave} disabled={updateTemplate.isPending}>
                {updateTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save template
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Settings() {
  usePageTitle('Settings');
  const { role, isSuperAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const reScore = useReScoreCandidates();
  const isHR = role === 'hr';
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => {
    if (urlTab === 'social' && isSuperAdmin) return 'social';
    if (urlTab === 'chitra' && isSuperAdmin) return 'chitra';
    return isHR ? 'certifications' : 'users';
  });

  useEffect(() => {
    if (urlTab === 'social' && isSuperAdmin) setActiveTab('social');
    else if (urlTab === 'chitra' && isSuperAdmin) setActiveTab('chitra');
  }, [urlTab, isSuperAdmin]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'social' || value === 'chitra') {
      setSearchParams({ tab: value });
    } else if (urlTab) {
      searchParams.delete('tab');
      setSearchParams(searchParams);
    }
  };

  if (role !== 'admin' && role !== 'hr') {
    return (
      <div className="min-h-screen bg-background">
        <Header showSearch={false} />
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <p className="text-muted-foreground">Only admins can access settings.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header showSearch={false} />
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SettingsIcon className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">System Configuration</h1>
              <p className="text-sm text-muted-foreground">Manage credential scoring rules and job settings.</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => reScore.mutate()}
            disabled={reScore.isPending}
            className="shrink-0 w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${reScore.isPending ? 'animate-spin' : ''}`} />
            {reScore.isPending ? 'Re-scoring...' : 'Re-score All Candidates'}
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Role guides & hiring playbooks</p>
              <p className="text-xs text-muted-foreground">
                Process docs for {isHR ? 'HR' : 'admin'} workflows — complements Features Overview.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link to="/help">Open Help & Guides</Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="min-w-0">
          <ScrollArea className="w-full pb-1">
            <TabsList className="inline-flex h-auto w-max min-w-0 flex-nowrap gap-0.5 p-1">
            {!isHR && (
              <TabsTrigger value="users" className="gap-1.5 shrink-0">
                <Shield className="h-4 w-4" /> User Roles
              </TabsTrigger>
            )}
            {role === 'admin' && (
              <TabsTrigger value="business" className="gap-1.5 shrink-0">
                <Store className="h-4 w-4" /> Business
              </TabsTrigger>
            )}
            {role === 'admin' && (
              <TabsTrigger value="email" className="gap-1.5 shrink-0">
                <Mail className="h-4 w-4" /> Email
              </TabsTrigger>
            )}
            {role === 'admin' && (
              <TabsTrigger value="assessments" className="gap-1.5 shrink-0">
                <ClipboardCheck className="h-4 w-4" /> Assessments
              </TabsTrigger>
            )}
            {role === 'admin' && (
              <TabsTrigger value="scorecards" className="gap-1.5 shrink-0">
                <ClipboardList className="h-4 w-4" /> Scorecards
              </TabsTrigger>
            )}
            <TabsTrigger value="certifications" className="gap-1.5 shrink-0">
              <Award className="h-4 w-4" /> Certifications
            </TabsTrigger>
            <TabsTrigger value="colleges" className="gap-1.5 shrink-0">
              <GraduationCap className="h-4 w-4" /> Tier 1 Colleges
            </TabsTrigger>
            <TabsTrigger value="domains" className="gap-1.5 shrink-0">
              <Briefcase className="h-4 w-4" /> Job Domains
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5 shrink-0">
              <Users className="h-4 w-4" /> Teams
            </TabsTrigger>
            <TabsTrigger value="vendors" className="gap-1.5 shrink-0">
              <Building2 className="h-4 w-4" /> Vendors
            </TabsTrigger>
            <TabsTrigger value="application-questions" className="gap-1.5 shrink-0">
              <FileQuestion className="h-4 w-4" /> Application Questions
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1.5 shrink-0">
              <Megaphone className="h-4 w-4" />
              Announcements
            </TabsTrigger>
            <TabsTrigger value="red-flag-rules" className="gap-1.5 shrink-0">
              <Flag className="h-4 w-4" /> Red Flag Rules
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="chitra" className="gap-1.5 shrink-0">
                <Eye className="h-4 w-4" /> Chitra
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="social" className="gap-1.5 shrink-0">
                <Twitter className="h-4 w-4" /> Social
              </TabsTrigger>
            )}
          </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {role === 'admin' && (
            <TabsContent value="business">
              <Card>
                <CardHeader>
                  <CardTitle>Business Branding</CardTitle>
                  <CardDescription>
                    Company logo and name shown in the app header for your organization.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BusinessBrandingTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {role === 'admin' && (
            <TabsContent value="email">
              <Card>
                <CardHeader>
                  <CardTitle>Email</CardTitle>
                  <CardDescription>
                    Configure delivery settings and choose which notification types to send.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {role === 'admin' && (
            <TabsContent value="assessments">
              <Card>
                <CardHeader>
                  <CardTitle>Assessments</CardTitle>
                  <CardDescription>
                    Org-wide defaults for job assessments and AI generation profiles.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AssessmentsTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {role === 'admin' && (
            <TabsContent value="scorecards">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                      <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle>Interview Scorecards</CardTitle>
                      <CardDescription>
                        Configure rating criteria per interview stage. Interviewers see these when submitting feedback; kit questions are read-only defaults for scheduled interviews.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScorecardsTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {!isHR && (
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle>User Role Management</CardTitle>
                  <CardDescription>
                    Manage internal staff roles and applicant portal users. Staff: Admin, Recruiter, Interviewer, etc. Applicants: portal access only.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserManagementTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="certifications">
            <Card>
              <CardHeader>
                <CardTitle>Certification Tier Mapping</CardTitle>
                <CardDescription>
                  Define which professional certifications are recognized and their scoring tier.
                  Tier 1 = 30 pts, Tier 2 = 20 pts, Tier 3 = 10 pts in credential scoring.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CertTiersTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="colleges">
            <Card>
              <CardHeader>
                <CardTitle>Tier 1 College Patterns</CardTitle>
                <CardDescription>
                  Name patterns used to match Tier 1 institutions. If a candidate's institution contains any of these patterns, it scores 25 pts. 
                  AI classifies non-matching institutions into Tier 2/3 automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CollegesTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="domains">
            <Card>
              <CardHeader>
                <CardTitle>Job Domains</CardTitle>
                <CardDescription>
                  Manage the list of domains available when creating job postings. Each domain can contain multiple teams.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DomainsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams">
            <Card>
              <CardHeader>
                <CardTitle>Teams</CardTitle>
                <CardDescription>
                  Manage the list of teams available when creating job postings. Teams exist within domains.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TeamsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendors">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/40">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle>Recruitment Vendors</CardTitle>
                    <CardDescription>
                      Register external recruitment partners. Select a vendor when bulk-importing their CVs — candidates get tagged with the vendor's source key for performance tracking in Reports.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <VendorsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="application-questions">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-teal-100 dark:bg-teal-900/40">
                    <FileQuestion className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <CardTitle>Application Question Bank</CardTitle>
                    <CardDescription>
                      Manage pre-screen questions assigned to job applicants. Each application receives {ASSIGNED_QUESTION_COUNT} questions drawn from active entries across {PRESCREEN_CATEGORIES.length} categories.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <PrescreenQuestionsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="announcements">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/40">
                    <Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle>Announcements</CardTitle>
                    <CardDescription>Publish banner messages visible to all logged-in users. Multiple can be active and will cycle automatically.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AnnouncementsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="red-flag-rules">
            <Card>
              <CardHeader>
                <CardTitle>Red Flag Detection Rules</CardTitle>
                <CardDescription>
                  Configure the thresholds used when Gemini automatically detects warning signals during candidate profile enrichment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RedFlagRulesTab />
              </CardContent>
            </Card>
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="chitra">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/40">
                      <Eye className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <CardTitle>Chitragupta (Chitra)</CardTitle>
                      <CardDescription>
                        AI HR Manager — he watches all activity, enforces process discipline, escalates and rewards. Visible to super admin only.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChitraTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="social">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-sky-100 dark:bg-sky-900/40">
                      <Twitter className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <CardTitle>OSS Social Drafts</CardTitle>
                      <CardDescription>
                        Three distinct daily tweet angles (Feature, OSS, CTA) from Chitragupta — super admin only, private to SparxIT.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <SocialDraftsTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
