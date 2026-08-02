import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Button, per the Design System spec: "One primary action per view."
 *
 * Variants: primary · secondary · outline · ghost · danger.
 * Sizes: small 32 · medium 40 · large 48 (desktop). Touch targets stay >= 44px
 * via min-height, so the medium button is finger-safe on mobile without a
 * separate size.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-body font-medium transition-colors outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-content hover:bg-primary-hover",
        secondary:
          "bg-primary-tonal text-primary hover:bg-primary-tonal/70",
        outline:
          "border border-border bg-surface text-content hover:bg-canvas",
        ghost: "text-content hover:bg-canvas",
        danger: "bg-danger text-white hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3 text-caption",
        md: "h-10 min-h-touch px-4",
        lg: "h-12 min-h-touch px-5 text-body-lg",
        icon: "h-10 w-10 min-h-touch min-w-touch",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. an <a>) instead of a <button>. */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
