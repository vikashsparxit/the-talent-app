import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

type CardColor = 'red' | 'blue' | 'emerald' | 'amber' | 'violet';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: CardColor;
  trend?: { value: number; isPositive: boolean };
  subtitle?: string;
  className?: string;
}

const colorConfig: Record<CardColor, { icon: string; bar: string; badge: string }> = {
  red:     { icon: 'bg-red-500/10 text-red-600',     bar: 'bg-red-500',     badge: 'text-red-600' },
  blue:    { icon: 'bg-blue-500/10 text-blue-600',   bar: 'bg-blue-500',    badge: 'text-blue-600' },
  emerald: { icon: 'bg-emerald-500/10 text-emerald-600', bar: 'bg-emerald-500', badge: 'text-emerald-600' },
  amber:   { icon: 'bg-amber-500/10 text-amber-600', bar: 'bg-amber-500',   badge: 'text-amber-600' },
  violet:  { icon: 'bg-violet-500/10 text-violet-600', bar: 'bg-violet-500', badge: 'text-violet-600' },
};

export function MetricCard({ title, value, icon: Icon, color = 'red', trend, subtitle, className }: MetricCardProps) {
  const c = colorConfig[color];
  return (
    <div className={cn(
      'relative rounded-xl bg-card border border-border/60 overflow-hidden',
      'shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.12)] transition-shadow',
      className
    )}>
      {/* Coloured top accent bar */}
      <div className={cn('h-1 w-full', c.bar)} />

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
              <p className={cn(
                'text-[10px] md:text-xs mt-1 font-medium flex items-center gap-0.5 min-w-0 leading-tight',
                trend.isPositive ? 'text-emerald-600' : 'text-red-500'
              )}>
                <span className="shrink-0 leading-none">{trend.isPositive ? '↑' : '↓'}</span>
                <span className="truncate whitespace-nowrap lg:hidden">{trend.value}%</span>
                <span className="truncate whitespace-nowrap hidden lg:inline">{trend.value}% from last week</span>
              </p>
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
