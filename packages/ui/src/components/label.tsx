import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Field label — the caption type token (11px/600 caps), matching the form
 * labels throughout the spec's screens.
 */
export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-caption uppercase tracking-wide text-content-muted",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
