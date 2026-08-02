/**
 * @vyora/ui — the design system.
 *
 * Tokens live in ./styles.css (imported by each app once); components below map
 * to them. Implemented from design/Vyora Design System.dc.html in Phase 4.
 */
export { cn } from "./lib/cn";

export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { Input, type InputProps } from "./components/input";
export { Label } from "./components/label";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";
export { Skeleton } from "./components/skeleton";
export { EmptyState } from "./components/empty-state";
export { ErrorState } from "./components/error-state";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
