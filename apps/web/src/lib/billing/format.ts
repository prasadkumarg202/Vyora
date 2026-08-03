import { formatPaise, type Paise } from "@vyora/core";

/**
 * Price formatting for the pricing surfaces.
 *
 * `formatPaise` always prints two decimals, which is right on an invoice and
 * wrong on a pricing card — "₹399.00 / month" reads like a rounding artefact.
 * Whole rupees drop the paise; anything with a fraction keeps it, so a future
 * ₹99.50 tier is not silently displayed as ₹99.
 */
export function rupees(paise: Paise): string {
  const formatted = formatPaise(paise);
  return formatted.endsWith(".00") ? formatted.slice(0, -3) : formatted;
}

/** Long-form date for renewal lines: 12 Apr 2027. */
export function billingDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
