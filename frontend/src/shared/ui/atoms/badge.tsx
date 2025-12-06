"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-surface-800 text-surface-200",
        primary: "bg-primary-900 text-primary-200 border border-primary-700",
        accent: "bg-accent-900 text-accent-200 border border-accent-700",
        success: "bg-green-900 text-green-200 border border-green-700",
        warning: "bg-yellow-900 text-yellow-200 border border-yellow-700",
        danger: "bg-red-900 text-red-200 border border-red-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

