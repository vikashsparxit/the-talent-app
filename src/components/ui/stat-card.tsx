import * as React from "react";
import { Link } from "react-router";

import { SegmentedProgress } from "@/components/ui/segmented-progress";
import { cn } from "@/lib/utils";

type ChartSeries = 1 | 2 | 3 | 4 | 5;

export interface StatCardProps {
  label: string;
  value: string | number;
  total?: number;
  hint?: string;
  series?: ChartSeries;
  href?: string;
  menu?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

export function StatCard({
  label,
  value,
  total,
  hint,
  series = 1,
  href,
  menu,
  trend,
  className,
}: StatCardProps) {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/,/g, ""));
  const showProgress = total != null && Number.isFinite(numericValue);
  const ratioHint =
    showProgress && hint == null ? `${numericValue.toLocaleString()} / ${total.toLocaleString()}` : hint;
  const ariaLabel = [
    label,
    String(value),
    total != null ? `of ${total.toLocaleString()} total` : null,
    hint,
  ]
    .filter(Boolean)
    .join(". ");
  const progressLabel = showProgress ? `${numericValue.toLocaleString()} of ${total.toLocaleString()}` : "";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-body font-medium text-balance text-foreground sm:text-title">{label}</p>
        {menu}
      </div>
      <p className="mt-2 text-2xl font-medium leading-none tracking-tight tabular-nums text-foreground sm:text-kpi">
        {value}
      </p>
      {(ratioHint || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {ratioHint ? <span className="tabular-nums">{ratioHint}</span> : null}
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 font-medium tabular-nums",
                trend.isPositive
                  ? "bg-[hsl(var(--chip-success-bg))] text-[hsl(var(--chip-success-text))]"
                  : "bg-[hsl(var(--chip-danger-bg))] text-[hsl(var(--chip-danger-text))]",
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {trend.value}%
            </span>
          ) : null}
        </div>
      )}
      {showProgress ? (
        <div className="mt-auto pt-4">
          <SegmentedProgress
            className="sm:hidden"
            value={numericValue}
            total={total}
            ticks={24}
            size="sm"
            series={series}
            label={progressLabel}
          />
          <SegmentedProgress
            className="hidden sm:flex"
            value={numericValue}
            total={total}
            series={series}
            label={progressLabel}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-card bg-card p-4 shadow-border sm:p-5",
        href && "transition-shadow duration-fast ease-out hover:shadow-border-hover",
        className,
      )}
    >
      {href ? (
        <>
          <div className="pointer-events-none flex flex-1 flex-col">{body}</div>
          <Link
            to={href}
            className="absolute inset-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={ariaLabel}
          />
        </>
      ) : (
        body
      )}
    </div>
  );
}
