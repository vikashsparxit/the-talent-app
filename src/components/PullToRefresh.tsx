import { Loader2 } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  className = '',
}: PullToRefreshProps) {
  const { isRefreshing, pullProgress, containerProps, spinnerProps } = usePullToRefresh({
    onRefresh,
    threshold,
  });

  return (
    <div className={`relative ${className}`} {...containerProps}>
      {/* Pull indicator - positioned above BottomNav (z-40) */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center h-12 pointer-events-none z-50"
        style={{
          opacity: pullProgress,
          transform: `translateY(${pullProgress * -30}px)`,
        }}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2
            className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`}
            style={{
              transform: isRefreshing ? 'rotate(0deg)' : `rotate(${pullProgress * 180}deg)`,
            }}
          />
          <span className="text-sm">
            {isRefreshing ? 'Refreshing...' : 'Pull to refresh'}
          </span>
        </div>
      </div>

      {/* Spinner overlay when refreshing - positioned above BottomNav */}
      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-center h-16 bg-background/80 backdrop-blur-sm z-50">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Content */}
      <div className={isRefreshing ? 'opacity-50' : ''}>
        {children}
      </div>
    </div>
  );
}