import { TriangleAlert } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";
import { Button } from "./button";

/**
 * Error state — the spec's example is "Couldn't sync / Saved locally. We'll
 * retry automatically. / [Retry now]". Offline-first: an error reassures that
 * work is safe locally, and offers a manual retry alongside the automatic one.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Retry now",
  className,
  ...props
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onError">) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-card border border-danger-border bg-danger-tonal p-4",
        className,
      )}
      {...props}
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex flex-col gap-1">
        <span className="text-body font-medium text-content">{title}</span>
        {description ? (
          <span className="text-body text-content-muted">{description}</span>
        ) : null}
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 self-start"
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
