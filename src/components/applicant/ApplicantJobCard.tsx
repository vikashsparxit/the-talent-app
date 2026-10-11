import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getMatchScoreColorClass } from '@/lib/jobMatchScore';
import type { Job } from '@/types/jobs';
import { jobTypeLabels, experienceLevelLabels } from '@/types/jobs';
import { format } from 'date-fns';
import {
  Building2,
  CheckCircle,
  Clock,
  Eye,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { JobShareButton } from '@/components/applicant/JobShareButton';
import { cn } from '@/lib/utils';

const MAX_SKILL_TAGS = 3;

interface ApplicantJobCardProps {
  job: Job;
  matchScore: number;
  showMatchScore?: boolean;
  isRelevant?: boolean;
  alreadyApplied: boolean;
  applyBlocked?: boolean;
  applyBlockMessage?: string;
  profileIncomplete: boolean;
  isApplying: boolean;
  onQuickApply: (job: Job) => void;
  onReferralShared?: () => void;
}

export function ApplicantJobCard({
  job,
  matchScore,
  showMatchScore = false,
  isRelevant = false,
  alreadyApplied,
  applyBlocked = false,
  applyBlockMessage,
  profileIncomplete,
  isApplying,
  onQuickApply,
  onReferralShared,
}: ApplicantJobCardProps) {
  const visibleSkills = job.required_skills.slice(0, MAX_SKILL_TAGS);
  const hiddenSkillCount = Math.max(0, job.required_skills.length - MAX_SKILL_TAGS);

  return (
    <div
      className={cn(
        'border rounded-lg p-4 hover:shadow-sm transition-shadow',
        isRelevant && 'border-primary/30 bg-primary/[0.02]',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/applicant/jobs/${job.id}`}
              className="font-semibold text-lg hover:text-primary transition-colors"
            >
              {job.title}
            </Link>
            {isRelevant && (
              <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3" />
                Relevant for you
              </Badge>
            )}
            {alreadyApplied && (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Applied
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-1">
            <Badge variant="secondary">{jobTypeLabels[job.job_type] || job.job_type}</Badge>
            {job.experience_level && (
              <Badge variant="outline">
                {experienceLevelLabels[job.experience_level] || job.experience_level}
              </Badge>
            )}
          </div>

          {job.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
          )}

          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            {job.department && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {job.department}
              </span>
            )}
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
            )}
            {job.application_deadline && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Deadline: {format(new Date(job.application_deadline), 'PP')}
              </span>
            )}
          </div>

          {visibleSkills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 items-center">
              {visibleSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs font-normal">
                  {skill}
                </Badge>
              ))}
              {hiddenSkillCount > 0 && (
                <span className="text-xs text-muted-foreground">+{hiddenSkillCount} more in full description</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 shrink-0 w-full sm:w-[8.5rem] sm:max-w-[8.5rem]">
          {showMatchScore && (
            <div className="text-center w-full">
              <div className="flex items-center gap-1.5 justify-end mb-1">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Profile Match</span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={matchScore} className="h-2 flex-1 min-w-0" />
                <span className={cn('text-sm font-bold shrink-0', getMatchScoreColorClass(matchScore))}>
                  {matchScore}%
                </span>
              </div>
            </div>
          )}

          <JobShareButton
            job={job}
            variant="outline"
            size="sm"
            className="w-full px-2 text-xs sm:text-sm"
            onReferralShared={onReferralShared}
          />

          <Button variant="outline" size="sm" asChild className="w-full px-2 text-xs sm:text-sm">
            <Link to={`/applicant/jobs/${job.id}`}>
              <Eye className="h-4 w-4 mr-1 shrink-0" />
              View Details
            </Link>
          </Button>

          {alreadyApplied ? (
            <Button variant="outline" size="sm" disabled className="w-full px-2 text-xs sm:text-sm">
              <CheckCircle className="h-4 w-4 mr-1 shrink-0" />
              Applied
            </Button>
          ) : applyBlocked ? (
            <Button variant="outline" size="sm" disabled className="w-full px-2 text-xs sm:text-sm" title={applyBlockMessage}>
              Quick Apply
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onQuickApply(job)}
              disabled={isApplying}
              className="w-full gap-1 px-2 text-xs sm:text-sm"
            >
              {isApplying ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Send className="h-4 w-4 shrink-0" />
              )}
              {profileIncomplete ? 'Complete Profile' : 'Quick Apply'}
            </Button>
          )}
          {applyBlocked && applyBlockMessage && !alreadyApplied && (
            <p className="text-xs text-muted-foreground text-center leading-tight">{applyBlockMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
