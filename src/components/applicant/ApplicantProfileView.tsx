import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProfileCompletenessMeter } from '@/components/applicant/ProfileCompletenessMeter';
import { ApplicantAvatarUpload } from '@/components/applicant/ApplicantAvatarUpload';
import {
  parseSkills,
  parseDocuments,
  parseEducation,
  parseWorkExperience,
  getResumeLastUpdated,
  isResumeStale,
  isResumeParsed,
  formatProfileDate,
  getApplicantDisplayName,
  getGenderLabel,
  getMaritalStatusLabel,
  getBloodGroupLabel,
} from '@/lib/applicantProfile';
import { openResumeUrl } from '@/lib/resumeStorage';
import type { ApplicantProfile } from '@/hooks/useApplicantAuth';
import {
  User,
  Phone,
  Linkedin,
  FileText,
  Building2,
  GraduationCap,
  Pencil,
  Mail,
  AlertTriangle,
  Clock,
  Calendar,
  Heart,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ApplicantProfileViewProps {
  profile: ApplicantProfile;
  onEdit: () => void;
  className?: string;
}

export function ApplicantProfileView({
  profile,
  onEdit,
  className,
}: ApplicantProfileViewProps) {
  const skills = parseSkills(profile.skills);
  const documents = parseDocuments(profile.documents);
  const workExperience = parseWorkExperience(profile.work_experience);
  const education = parseEducation(profile.education);
  const resumeLastUpdated = getResumeLastUpdated(profile);
  const resumeStale = isResumeStale(profile);
  const showViewCv = !!profile.resume_url && isResumeParsed(profile);

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <ApplicantAvatarUpload avatarUrl={profile.avatar_url} size="lg" showLabel />
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showViewCv && (
            <Button
              variant="outline"
              onClick={() => openResumeUrl(profile.resume_url!)}
              className="gap-1"
            >
              <FileText className="h-4 w-4" />
              View CV
            </Button>
          )}
          <Button onClick={onEdit} className="gap-1">
            <Pencil className="h-4 w-4" />
            Update Profile
          </Button>
        </div>
      </div>

      {resumeStale && (
        <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900">Your resume may be out of date</p>
            <p className="text-sm text-amber-800 mt-1">
              It&apos;s been over 3 months since your last resume update. Refresh your certifications,
              skills, and experience so recruiters see your latest details.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-amber-300 bg-white hover:bg-amber-100"
              onClick={onEdit}
            >
              Update Resume
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Completeness</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileCompletenessMeter profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact & Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{profile.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{getApplicantDisplayName(profile) || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{profile.phone || '—'}</span>
          </div>
          {profile.emergency_phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>Emergency: {profile.emergency_phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Linkedin className="h-4 w-4 text-muted-foreground" />
            {profile.linkedin_url ? (
              <a
                href={profile.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate"
              >
                {profile.linkedin_url}
              </a>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="flex items-start gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="min-w-0">
              {profile.resume_url ? (
                <>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => openResumeUrl(profile.resume_url!)}
                  >
                    View Resume
                  </button>
                  {resumeLastUpdated && (
                    <p className={cn(
                      'flex items-center gap-1 text-xs mt-1',
                      resumeStale ? 'text-amber-700 font-medium' : 'text-muted-foreground',
                    )}>
                      <Clock className="h-3 w-3" />
                      Last updated {format(resumeLastUpdated, 'MMM d, yyyy')}
                    </p>
                  )}
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">DOB (on documents)</p>
            <p className="font-medium">{formatProfileDate(profile.dob_documented)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">DOB (actual)</p>
            <p className="font-medium">{formatProfileDate(profile.dob_actual)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Gender</p>
            <p className="font-medium">{getGenderLabel(profile.gender)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Marital status</p>
            <p className="font-medium">{getMaritalStatusLabel(profile.marital_status)}</p>
          </div>
          <div>
            <p className="text-muted-foreground flex items-center gap-1">
              <Heart className="h-3 w-3" />
              Blood group
            </p>
            <p className="font-medium">{getBloodGroupLabel(profile.blood_group)}</p>
          </div>
        </CardContent>
      </Card>

      {skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <Badge key={skill} variant="secondary">{skill}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {workExperience.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Work Experience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workExperience.map((exp, idx) => (
              <div key={idx} className="border-b last:border-0 pb-3 last:pb-0">
                <p className="font-medium">{exp.title || 'Role'}</p>
                <p className="text-sm text-muted-foreground">{exp.company}</p>
                {(exp.start_date || exp.end_date) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {exp.start_date} — {exp.end_date || 'Present'}
                  </p>
                )}
                {exp.description && <p className="text-sm mt-2">{exp.description}</p>}
                {exp.reason_for_leaving && (
                  <p className="text-sm mt-2 text-muted-foreground">
                    Reason for leaving: {exp.reason_for_leaving}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {education.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Education
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {education.map((edu, idx) => (
              <div key={idx} className="border-b last:border-0 pb-3 last:pb-0">
                <p className="font-medium">{edu.degree_name || 'Degree'}</p>
                <p className="text-sm text-muted-foreground">{edu.board_university}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                  {edu.year_of_completion && <span>Completed {edu.year_of_completion}</span>}
                  {edu.grade && <span>Grade: {edu.grade}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => openResumeUrl(doc.url)}
                  >
                    {doc.name}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
