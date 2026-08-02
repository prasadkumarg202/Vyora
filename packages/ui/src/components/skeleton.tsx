import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Loading placeholder. The spec's loading state is "skeleton", not a spinner —
 * it holds the shape of the content that is about to arrive.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // A subtle shimmer reads as "loading" rather than "broken image".
      className={cn(
        "relative overflow-hidden rounded-control bg-border-subtle",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent",
        className,
      )}
      aria-hidden
      {...props}
    />
  );
}
