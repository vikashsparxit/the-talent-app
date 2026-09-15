import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CandidateRedFlag } from '@/lib/applicantProfile';

const ROTATE_INTERVAL_MS = 3500;

interface RedFlagsCarouselProps {
  flags: CandidateRedFlag[];
}

export function RedFlagsCarousel({ flags }: RedFlagsCarouselProps) {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    setIndex(0);
  }, [flags.length]);

  useEffect(() => {
    if (index >= flags.length && flags.length > 0) {
      setIndex(flags.length - 1);
    }
  }, [flags.length, index]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (flags.length <= 1) return;
      setIndex((i) => (i + dir + flags.length) % flags.length);
    },
    [flags.length],
  );

  useEffect(() => {
    if (flags.length <= 1) return;
    const timer = setInterval(() => {
      if (!paused.current) go(1);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flags.length, go]);

  if (flags.length === 0) return null;

  const safeIndex = Math.min(index, flags.length - 1);
  const flag = flags[safeIndex];
  const multi = flags.length > 1;

  return (
    <div
      className="-mt-2"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      <div
        className={cn(
          'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
          flag.severity === 'high' && 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400',
          flag.severity === 'medium' && 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
          flag.severity === 'low' && 'bg-muted text-muted-foreground',
        )}
      >
        {multi && (
          <button
            type="button"
            aria-label="Previous flag"
            onClick={() => go(-1)}
            className="shrink-0 mt-0.5 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <span className="block">{flag.message}</span>
          {multi && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium opacity-70 tabular-nums">
                Flag {safeIndex + 1} of {flags.length}
              </span>
              <div className="flex items-center gap-1" role="tablist" aria-label="Flag indicators">
                {flags.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === safeIndex}
                    aria-label={`Flag ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === safeIndex ? 'w-3 bg-current opacity-80' : 'w-1.5 bg-current opacity-30 hover:opacity-50',
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        {multi && (
          <button
            type="button"
            aria-label="Next flag"
            onClick={() => go(1)}
            className="shrink-0 mt-0.5 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
