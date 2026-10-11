import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-caption font-medium transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-solid text-primary-foreground hover:bg-primary-solid/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        soft: "border-border/60 bg-[hsl(var(--chip-neutral-bg))] text-[hsl(var(--chip-neutral-text))] hover:bg-[hsl(var(--chip-neutral-bg))]/80",
        success: "border-transparent bg-[hsl(var(--chip-success-bg))] text-[hsl(var(--chip-success-text))]",
        warning: "border-transparent bg-[hsl(var(--chip-warning-bg))] text-[hsl(var(--chip-warning-text))]",
        danger: "border-transparent bg-[hsl(var(--chip-danger-bg))] text-[hsl(var(--chip-danger-text))]",
        neutral: "border-transparent bg-[hsl(var(--chip-neutral-bg))] text-[hsl(var(--chip-neutral-text))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
