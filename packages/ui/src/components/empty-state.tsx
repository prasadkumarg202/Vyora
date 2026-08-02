import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Empty state — the spec's rule: every list defines an empty state with a title,
 * a one-line hint, and the primary action. "No invoices yet / Create your first
 * invoice to get started / [New invoice]" is the canonical example.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-card bg-canvas text-content-muted [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-h3">{title}</h3>
        {description ? (
          <p className="max-w-sm text-body text-content-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
