import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Text input. Radius 10 (input token), 44px touch target, focus ring from the
 * spec. `aria-invalid` swaps the border to danger, so form validation needs no
 * extra classes at the call site.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex min-h-touch w-full rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none transition-colors",
          "placeholder:text-content-muted",
          "focus-visible:border-primary focus-visible:shadow-focus",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:shadow-none",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
