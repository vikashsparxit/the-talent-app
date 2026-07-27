import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import { useApplicantUpdateProfile } from '@/hooks/useApplicantPortal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import { openResumeUrl } from '@/lib/resumeStorage';
import {
  validateApplicantProfileSave,
  normalizeLinkedInUrl,
  splitFullName,
  parseSkills,
  parseEducation,
  parseWorkExperience,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  BLOOD_GROUP_OPTIONS,
  EMPTY_EDUCATION_ENTRY,
  EMPTY_WORK_EXPERIENCE_ENTRY,
  type EducationEntry,
  type WorkExperienceEntry,
} from '@/lib/applicantProfile';
import type { ApplicantDocument } from '@/lib/applicantProfile';
import {
  Upload,
  Linkedin,
  Phone,
  FileText,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
  GraduationCap,
  Building2,
  X,
  Calendar,
  Heart,
} from 'lucide-react';
import { ApplicantAvatarUpload } from '@/components/applicant/ApplicantAvatarUpload';

interface ApplicantProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicantProfileModal({ open, onOpenChange }: ApplicantProfileModalProps) {
  const { toast } = useToast();
  const { user, profile } = useApplicantAuth();
  const updateProfile = useApplicantUpdateProfile();

  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isDocUploading, setIsDocUploading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    phone: '',
    emergency_phone: '',
    linkedin_url: '',
    resume_url: '',
    dob_actual: '',
    dob_documented: '',
    gender: '',
    marital_status: '',
    blood_group: '',
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [documents, setDocuments] = useState<ApplicantDocument[]>([]);
  const [workExperience, setWorkExperience] = useState<WorkExperienceEntry[]>([]);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [linkedinFromResume, setLinkedinFromResume] = useState(false);

  useEffect(() => {
    if (profile && open) {
      const invalidFullName = profile.full_name?.includes('@');
      const split = invalidFullName
        ? { first_name: '', middle_name: profile.middle_name || '', last_name: '' }
        : profile.first_name || profile.last_name
          ? {
              first_name: profile.first_name || '',
              middle_name: profile.middle_name || '',
              last_name: profile.last_name || '',
            }
          : splitFullName(profile.full_name || '');

      setProfileForm({
        first_name: split.first_name,
        middle_name: split.middle_name || '',
        last_name: split.last_name,
        phone: profile.phone || '',
        emergency_phone: profile.emergency_phone || '',
        linkedin_url: profile.linkedin_url ? normalizeLinkedInUrl(profile.linkedin_url) : '',
        resume_url: profile.resume_url || '',
        dob_actual: profile.dob_actual ? profile.dob_actual.slice(0, 10) : '',
        dob_documented: profile.dob_documented ? profile.dob_documented.slice(0, 10) : '',
        gender: profile.gender || '',
        marital_status: profile.marital_status || '',
        blood_group: profile.blood_group || '',
      });
      setLinkedinFromResume(false);
      setSkills(parseSkills(profile.skills));
      setDocuments(Array.isArray(profile.documents) ? (profile.documents as ApplicantDocument[]) : []);
      setWorkExperience(parseWorkExperience(profile.work_experience));
      setEducation(parseEducation(profile.education));
    }
  }, [profile, open]);

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
      const fileName = `${user?.id}-resume-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('resumes').upload(fileName, file);
      if (uploadError) throw uploadError;

      setProfileForm((prev) => ({ ...prev, resume_url: fileName }));
      toast({ title: 'Resume uploaded successfully' });

      setIsParsing(true);
      toast({ title: 'Analyzing resume...', description: 'Extracting your details with AI' });

      try {
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
          body: { resume_url: fileName, ...getDevGeminiKeyBody() },
        });

        if (parseError) throw parseError;

        if (parseData?.success && parseData.data) {
          const extracted = parseData.data;
          const nameParts = extracted.full_name ? splitFullName(extracted.full_name) : null;
          setProfileForm((prev) => ({
            ...prev,
            first_name: nameParts?.first_name || prev.first_name,
            middle_name: nameParts?.middle_name || prev.middle_name,
            last_name: nameParts?.last_name || prev.last_name,
            phone: extracted.phone || prev.phone,
            linkedin_url: extracted.linkedin_url
              ? normalizeLinkedInUrl(extracted.linkedin_url)
              : prev.linkedin_url,
          }));
          if (extracted.linkedin_url) {
            setLinkedinFromResume(true);
          }
          if (extracted.work_experience && Array.isArray(extracted.work_experience)) {
            setWorkExperience(parseWorkExperience(extracted.work_experience));
          }
          if (extracted.education && Array.isArray(extracted.education)) {
            setEducation(parseEducation(extracted.education));
          }
          if (extracted.skills && Array.isArray(extracted.skills)) {
            setSkills(extracted.skills.filter((s: unknown) => typeof s === 'string'));
          }
          toast({ title: 'Resume parsed!', description: 'Your details have been auto-filled. Review and save.' });
        }
      } catch (parseErr) {
        console.error('Resume parse error:', parseErr);
        toast({ title: 'Could not auto-fill from resume', description: 'You can still enter details manually.' });
      } finally {
        setIsParsing(false);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      toast({ title: 'Upload failed', description: message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload a PDF or Word document', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }

    setIsDocUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-doc-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('resumes').upload(fileName, file);
      if (uploadError) throw uploadError;

      const newDoc: ApplicantDocument = {
        id: crypto.randomUUID(),
        name: file.name,
        url: fileName,
        type: 'other',
        uploaded_at: new Date().toISOString(),
      };
      setDocuments((prev) => [...prev, newDoc]);
      toast({ title: 'Document uploaded' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      toast({ title: 'Upload failed', description: message, variant: 'destructive' });
    } finally {
      setIsDocUploading(false);
      e.target.value = '';
    }
  };

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput('');
  };

  const handleUpdateProfile = async () => {
    const linkedinUrl = normalizeLinkedInUrl(profileForm.linkedin_url);
    if (linkedinUrl !== profileForm.linkedin_url) {
      setProfileForm((prev) => ({ ...prev, linkedin_url: linkedinUrl }));
    }

    const validation = validateApplicantProfileSave({
      first_name: profileForm.first_name,
      middle_name: profileForm.middle_name,
      last_name: profileForm.last_name,
      dob_documented: profileForm.dob_documented,
      gender: profileForm.gender,
      marital_status: profileForm.marital_status,
      blood_group: profileForm.blood_group,
      linkedin_url: linkedinUrl,
    });
    if (!validation.valid) {
      toast({
        title: validation.title,
        description: validation.description,
        variant: 'destructive',
      });
      return;
    }

    await updateProfile.mutateAsync({
      first_name: profileForm.first_name.trim(),
      last_name: profileForm.last_name.trim(),
      middle_name: profileForm.middle_name.trim() || null,
      phone: profileForm.phone,
      emergency_phone: profileForm.emergency_phone.trim() || null,
      linkedin_url: linkedinUrl,
      dob_actual: profileForm.dob_actual.trim() || null,
      dob_documented: profileForm.dob_documented.trim(),
      gender: profileForm.gender,
      marital_status: profileForm.marital_status,
      blood_group: profileForm.blood_group,
      resume_url: profileForm.resume_url,
      work_experience: workExperience,
      education: education,
      skills,
      documents,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your Profile</DialogTitle>
          <DialogDescription>
            Keep your profile complete — details here will auto-fill when you apply for jobs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ApplicantAvatarUpload avatarUrl={profile?.avatar_url} showLabel />

          <div className="space-y-2">
            <Label htmlFor="profile_email">Email</Label>
            <Input
              id="profile_email"
              value={profile?.email || user?.email || ''}
              disabled
              className="bg-muted cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profile_first_name">First Name *</Label>
              <Input
                id="profile_first_name"
                placeholder="First name"
                value={profileForm.first_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_middle_name">Middle Name</Label>
              <Input
                id="profile_middle_name"
                placeholder="Optional"
                value={profileForm.middle_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, middle_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_last_name">Last Name *</Label>
              <Input
                id="profile_last_name"
                placeholder="Last name"
                value={profileForm.last_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base font-semibold flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Personal Details
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profile_dob_documented">Date of Birth (on documents) *</Label>
                <Input
                  id="profile_dob_documented"
                  type="date"
                  value={profileForm.dob_documented}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, dob_documented: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">As shown on your official ID or certificates</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_dob_actual">Date of Birth (actual)</Label>
                <Input
                  id="profile_dob_actual"
                  type="date"
                  value={profileForm.dob_actual}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, dob_actual: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Optional, if different from documents</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select
                  value={profileForm.gender || undefined}
                  onValueChange={(value) => setProfileForm((prev) => ({ ...prev, gender: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Marital Status *</Label>
                <Select
                  value={profileForm.marital_status || undefined}
                  onValueChange={(value) => setProfileForm((prev) => ({ ...prev, marital_status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {MARITAL_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  Blood Group *
                </Label>
                <Select
                  value={profileForm.blood_group || undefined}
                  onValueChange={(value) => setProfileForm((prev) => ({ ...prev, blood_group: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUP_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profile_phone" className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Phone Number
              </Label>
              <Input
                id="profile_phone"
                placeholder="+91 98765 43210"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_emergency_phone" className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Emergency Phone
              </Label>
              <Input
                id="profile_emergency_phone"
                placeholder="Alternative contact number"
                value={profileForm.emergency_phone}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, emergency_phone: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile_linkedin" className="flex items-center gap-1">
              <Linkedin className="h-3 w-3" />
              LinkedIn URL *
            </Label>
            <Input
              id="profile_linkedin"
              placeholder="https://linkedin.com/in/yourprofile"
              value={profileForm.linkedin_url}
              onChange={(e) => {
                setLinkedinFromResume(false);
                setProfileForm((prev) => ({ ...prev, linkedin_url: e.target.value }));
              }}
              onBlur={() => {
                const normalized = normalizeLinkedInUrl(profileForm.linkedin_url);
                if (normalized !== profileForm.linkedin_url) {
                  setProfileForm((prev) => ({ ...prev, linkedin_url: normalized }));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {linkedinFromResume
                ? 'Auto-filled from your resume — review and edit if needed.'
                : 'Required. Auto-filled from resume if parsed during upload.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Resume / CV
            </Label>
            <p className="text-xs text-muted-foreground">
              Import from resume or LinkedIn PDF — upload your file and we&apos;ll auto-fill your details.
            </p>
            {profileForm.resume_url ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between border rounded-md p-3 bg-muted/50">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Resume uploaded</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openResumeUrl(profileForm.resume_url)}>
                      View
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        Replace
                        <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} />
                      </label>
                    </Button>
                  </div>
                </div>
                {isParsing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md bg-blue-50">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Extracting details from your resume...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-md p-4 text-center">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">PDF or Word, max 10MB</p>
                <Button variant="outline" size="sm" asChild disabled={isUploading}>
                  <label className="cursor-pointer">
                    {isUploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Upload Resume</>
                    )}
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} />
                  </label>
                </Button>
              </div>
            )}
          </div>

          {/* Skills */}
          <div className="space-y-2 pt-2 border-t">
            <Label>Skills</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a skill"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddSkill}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="gap-1">
                    {skill}
                    <button type="button" onClick={() => setSkills((prev) => prev.filter((s) => s !== skill))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Additional Documents */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label>Additional Documents</Label>
              <Button variant="outline" size="sm" asChild disabled={isDocUploading}>
                <label className="cursor-pointer">
                  {isDocUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-3 w-3 mr-1" /> Add</>}
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleDocumentUpload} />
                </label>
              </Button>
            </div>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Upload certificates, cover letters, or other supporting documents.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                    <button type="button" className="text-left hover:underline" onClick={() => openResumeUrl(doc.url)}>
                      {doc.name}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDocuments((prev) => prev.filter((d) => d.id !== doc.id))}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Work Experience */}
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
                onClick={() => setWorkExperience((prev) => [...prev, { ...EMPTY_WORK_EXPERIENCE_ENTRY }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {workExperience.length === 0 && (
              <p className="text-sm text-muted-foreground">No experience added yet. Upload a resume to auto-fill or add manually.</p>
            )}
            {workExperience.map((exp, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Experience {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setWorkExperience((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Company" value={exp.company} onChange={(e) => setWorkExperience((prev) => prev.map((item, i) => i === idx ? { ...item, company: e.target.value } : item))} />
                  <Input placeholder="Job Title" value={exp.title} onChange={(e) => setWorkExperience((prev) => prev.map((item, i) => i === idx ? { ...item, title: e.target.value } : item))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Start (e.g. 2020-01)" value={exp.start_date} onChange={(e) => setWorkExperience((prev) => prev.map((item, i) => i === idx ? { ...item, start_date: e.target.value } : item))} />
                  <Input placeholder="End (e.g. Present)" value={exp.end_date} onChange={(e) => setWorkExperience((prev) => prev.map((item, i) => i === idx ? { ...item, end_date: e.target.value } : item))} />
                </div>
                <Textarea placeholder="Brief description of role" value={exp.description} rows={2} onChange={(e) => setWorkExperience((prev) => prev.map((item, i) => i === idx ? { ...item, description: e.target.value } : item))} />
                <Input
                  placeholder="Reason for leaving (optional)"
                  value={exp.reason_for_leaving ?? ''}
                  onChange={(e) => setWorkExperience((prev) => prev.map((item, i) => i === idx ? { ...item, reason_for_leaving: e.target.value } : item))}
                />
              </div>
            ))}
          </div>

          {/* Education */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1 text-base font-semibold">
                <GraduationCap className="h-4 w-4" />
                Education
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEducation((prev) => [...prev, { ...EMPTY_EDUCATION_ENTRY }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {education.length === 0 && (
              <p className="text-sm text-muted-foreground">No education added yet. Upload a resume to auto-fill or add manually.</p>
            )}
            {education.map((edu, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Education {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEducation((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Degree / Class (e.g. B.Tech, 12th)" value={edu.degree_name} onChange={(e) => setEducation((prev) => prev.map((item, i) => i === idx ? { ...item, degree_name: e.target.value } : item))} />
                  <Input placeholder="Year of completion" value={edu.year_of_completion} onChange={(e) => setEducation((prev) => prev.map((item, i) => i === idx ? { ...item, year_of_completion: e.target.value } : item))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Board / University" value={edu.board_university} onChange={(e) => setEducation((prev) => prev.map((item, i) => i === idx ? { ...item, board_university: e.target.value } : item))} />
                  <Input placeholder="Grade (% or CGPA)" value={edu.grade} onChange={(e) => setEducation((prev) => prev.map((item, i) => i === idx ? { ...item, grade: e.target.value } : item))} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleUpdateProfile} disabled={updateProfile.isPending || isUploading || isParsing}>
            {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
