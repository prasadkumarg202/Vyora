/**
 * Invoice and report resolution.
 *
 * Nothing here branches on a business-type key: the template, columns, extras and
 * report names all come from the config record.
 */

import type { BusinessTypeConfig, InvoiceConfig } from "./types";

/** The GST title a composition dealer must print instead of a tax invoice. */
const BILL_OF_SUPPLY = "BILL OF SUPPLY";

export function resolveInvoice(config: BusinessTypeConfig): InvoiceConfig {
  return config.invoice;
}

/**
 * Composition dealers cannot collect GST, so they print a bill of supply with no
 * tax breakup (design: Kirana, "BILL OF SUPPLY" + the "Composition dealer" extra
 * + the rule "Composition dealers omit tax breakup").
 *
 * Derived from `gst.composition`, which is the machine-readable form, but the
 * invariant is that it agrees with the template prose. types.ts is explicit that
 * the prose is the spec of record and the structure is the derivative, so a
 * disagreement is a config bug — and a silent one would either print a tax
 * invoice for a dealer who may not charge tax, or suppress the breakup for one
 * who must. Neither is recoverable at print time, so it throws.
 */
export function isBillOfSupply(config: BusinessTypeConfig): boolean {
  const composition = config.gst.composition !== undefined;
  const titled =
    config.invoice.template.trim().toUpperCase() === BILL_OF_SUPPLY;

  if (composition !== titled) {
    throw new Error(
      `Business type "${config.businessType}" is inconsistent: gst.composition is ` +
        `${composition ? "present" : "absent"} but invoice.template is ` +
        `"${config.invoice.template}". A composition scheme and a "${BILL_OF_SUPPLY}" ` +
        `template must be declared together.`,
    );
  }
  return composition;
}

export function resolveReports(config: BusinessTypeConfig): string[] {
  return [...config.reports];
}
