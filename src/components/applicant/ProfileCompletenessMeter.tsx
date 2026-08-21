import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getProfileCompleteness, type ApplicantProfileData } from '@/lib/applicantProfile';

interface ProfileCompletenessMeterProps {
  profile: ApplicantProfileData | null;
  className?: string;
  showItems?: boolean;
}

export function ProfileCompletenessMeter({ profile, className, showItems = true }: ProfileCompletenessMeterProps) {
  const { percent, items } = getProfileCompleteness(profile);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Profile completeness</span>
        <span className={cn(
          'text-sm font-bold',
          percent === 100 ? 'text-green-600' : percent >= 60 ? 'text-amber-600' : 'text-muted-foreground',
        )}>
          {percent}%
        </span>
      </div>
      <Progress value={percent} className="h-2" />
      {showItems && (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.complete ? (
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={item.complete ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
