import { CandidateWithAssessment } from '@/types/candidate';
import { ScoreRing } from './ScoreRing';
import { StatusBadge } from './StatusBadge';
import { Mail, Calendar, Clock, Briefcase } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, format } from 'date-fns';

interface CandidateCardProps {
  candidate: CandidateWithAssessment;
  index: number;
}

export function CandidateCard({ candidate, index }: CandidateCardProps) {
  const initials = candidate.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const score = candidate.percentage ?? 0;
  const status = candidate.assessment_status || 'invited';

  return (
    <div
      className="card-elevated rounded-xl p-5 bg-card animate-slide-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar and Basic Info */}
        <Avatar className="w-12 h-12 border-2 border-primary/10">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-semibold text-foreground truncate">
                {candidate.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {candidate.role_applied || 'No role specified'}
              </p>
            </div>
            <StatusBadge status={status} />
          </div>

          {/* Contact Info */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              {candidate.email}
            </span>
            {candidate.assessment_title && (
              <span className="flex items-center gap-1 truncate">
                <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                {candidate.assessment_title}
              </span>
            )}
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {skills.slice(0, 4).map((skill, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-md"
                >
                  {String(skill)}
                </span>
              ))}
              {skills.length > 4 && (
                <span className="px-2 py-0.5 text-muted-foreground text-xs">
                  +{skills.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Score Ring */}
        <div className="flex flex-col items-center">
          <ScoreRing score={score} size="md" />
          <span className="text-xs text-muted-foreground mt-1">Score</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {candidate.invited_at
            ? `Invited ${format(new Date(candidate.invited_at), 'MMM d, yyyy')}`
            : `Added ${format(new Date(candidate.created_at), 'MMM d, yyyy')}`}
        </span>
        {candidate.completed_at ? (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Completed {formatDistanceToNow(new Date(candidate.completed_at), { addSuffix: true })}
          </span>
        ) : candidate.deadline ? (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Due {format(new Date(candidate.deadline), 'MMM d, yyyy')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
