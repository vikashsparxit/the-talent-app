import { cn } from '@/lib/utils';

interface ScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-12 h-12',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
};

const textSizes = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

export function ScoreRing({ score, size = 'md', showLabel = true, className }: ScoreRingProps) {
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getGradient = (score: number) => {
    if (score >= 85) return 'from-success/20 to-success/5';
    if (score >= 70) return 'from-primary/20 to-primary/5';
    if (score >= 50) return 'from-warning/20 to-warning/5';
    return 'from-destructive/20 to-destructive/5';
  };

  const getStrokeColor = (score: number) => {
    if (score >= 85) return 'stroke-success';
    if (score >= 70) return 'stroke-primary';
    if (score >= 50) return 'stroke-warning';
    return 'stroke-destructive';
  };

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={cn('relative flex items-center justify-center', sizeClasses[size], className)}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={cn(getStrokeColor(score), 'transition-all duration-700 ease-out')}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>
      {showLabel && (
        <div className={cn(
          'absolute inset-0 flex items-center justify-center font-semibold',
          textSizes[size],
          getScoreColor(score)
        )}>
          {score}
        </div>
      )}
    </div>
  );
}
