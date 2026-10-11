import * as React from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  padding?: "5" | "6";
  contentClassName?: string;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  actions,
  padding = "5",
  contentClassName,
  children,
  className,
  ...props
}: SectionCardProps) {
  const pad = padding === "6" ? "p-6" : "p-5";

  return (
    <Card className={className} {...props}>
      <CardHeader className={cn("flex flex-row items-start justify-between gap-3 space-y-0", pad, "pb-3")}>
        <div className="min-w-0 space-y-1">
          <h2 className="text-title text-balance text-foreground">{title}</h2>
          {description ? (
            <p className="text-body text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn(pad, "pt-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
