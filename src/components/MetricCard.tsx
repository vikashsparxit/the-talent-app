import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

type CardColor = 'primary' | 'neutral' | 'success' | 'warning' | 'info';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: CardColor;
  trend?: { value: number; isPositive: boolean };
  subtitle?: string;
  className?: string;
}

const colorConfig: Record<CardColor, { icon: string; trendChip: string }> = {
  primary: {
    icon: 'bg-primary/10 text-primary',
    trendChip: 'bg-primary/10 text-primary',
  },
  neutral: {
    icon: 'bg-muted text-muted-foreground',
    trendChip: 'bg-muted text-muted-foreground',
  },
  success: {
    icon: 'bg-[hsl(var(--chip-success-bg))] text-[hsl(var(--chip-success-text))]',
    trendChip: 'bg-[hsl(var(--chip-success-bg))] text-[hsl(var(--chip-success-text))]',
  },
  warning: {
    icon: 'bg-[hsl(var(--chip-warning-bg))] text-[hsl(var(--chip-warning-text))]',
    trendChip: 'bg-[hsl(var(--chip-warning-bg))] text-[hsl(var(--chip-warning-text))]',
  },
  info: {
    icon: 'bg-[hsl(var(--chip-neutral-bg))] text-[hsl(var(--chip-neutral-text))]',
    trendChip: 'bg-[hsl(var(--chip-neutral-bg))] text-[hsl(var(--chip-neutral-text))]',
  },
};

export function MetricCard({ title, value, icon: Icon, color = 'primary', trend, subtitle, className }: MetricCardProps) {
  const c = colorConfig[color];
  return (
    <div className={cn(
      'relative rounded-xl bg-card border-0 overflow-hidden shadow-elev-1',
      'hover:shadow-elev-2 transition-shadow',
      className
    )}>
      <div className="p-3 md:p-5">
        <div className="flex items-start justify-between gap-1.5 md:gap-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate leading-tight">
              {title}
            </p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mt-1 md:mt-1.5 leading-none tabular-nums">
              {value}
            </p>

            {subtitle && (
              <p className="text-[10px] md:text-xs text-muted-foreground mt-1.5 md:mt-2 truncate whitespace-nowrap leading-tight">
                {subtitle}
              </p>
            )}
            {trend && (
              <span className={cn(
                'inline-flex items-center gap-0.5 mt-2 rounded-full px-2 py-0.5 text-[10px] md:text-xs font-medium leading-none',
                trend.isPositive
                  ? 'bg-[hsl(var(--chip-success-bg))] text-[hsl(var(--chip-success-text))]'
                  : 'bg-[hsl(var(--chip-danger-bg))] text-[hsl(var(--chip-danger-text))]',
              )}>
                <span className="shrink-0">{trend.isPositive ? '↑' : '↓'}</span>
                <span className="truncate lg:hidden">{trend.value}%</span>
                <span className="truncate hidden lg:inline">{trend.value}% from last week</span>
              </span>
            )}
          </div>
          <div className={cn('p-2 md:p-2.5 rounded-lg shrink-0 hidden lg:flex', c.icon)}>
            <Icon className="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
