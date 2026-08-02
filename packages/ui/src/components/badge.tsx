import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Status badge — pill, 11px/600, tonal bg + border, per the spec's status
 * badges: paid/green, pending/amber, overdue/red, info/indigo, neutral/gray.
 *
 * The tones are named by semantic role (success/warning/…) not by domain word
 * (paid/overdue), so the same badge serves invoices, sync state, and stock
 * without redefining colours. The mapping (paid → success, overdue → danger)
 * lives at the call site.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-caption",
  {
    variants: {
      tone: {
        neutral: "border-border bg-canvas text-content-muted",
        success: "border-success-border bg-success-tonal text-success",
        warning: "border-warning-border bg-warning-tonal text-warning",
        danger: "border-danger-border bg-danger-tonal text-danger",
        info: "border-info-border bg-info-tonal text-info",
        primary: "border-primary-tonal-border bg-primary-tonal text-primary",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Show a leading status dot in the current text colour. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden
          className="size-1.5 rounded-pill bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

export { badgeVariants };
