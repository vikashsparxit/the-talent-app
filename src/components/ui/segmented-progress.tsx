import { cn } from "@/lib/utils";

type ChartSeries = 1 | 2 | 3 | 4 | 5;

const seriesClass: Record<ChartSeries, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

export interface SegmentedProgressProps {
  value: number;
  total: number;
  ticks?: number;
  series?: ChartSeries;
  size?: "md" | "sm";
  label?: string;
  className?: string;
}

export function SegmentedProgress({
  value,
  total,
  ticks = 40,
  series = 1,
  size = "md",
  label,
  className,
}: SegmentedProgressProps) {
  const safeTotal = total > 0 ? total : 1;
  const filled = Math.min(ticks, Math.max(0, Math.round((value / safeTotal) * ticks)));
  const ariaLabel = label ?? `${value} of ${total}`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn(
        "flex w-full items-stretch gap-1",
        size === "md" ? "h-6" : "h-4",
        className,
      )}
    >
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          className={cn(
            "min-w-0 flex-1 rounded-xs",
            i < filled ? seriesClass[series] : "bg-track",
          )}
        />
      ))}
    </div>
  );
}
