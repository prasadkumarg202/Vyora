/**
 * Invoice and report resolution.
 *
 * Nothing here branches on a business-type key: the template, columns, extras and
 * report names all come from the config record.
 */

import type { BusinessTypeConfig, InvoiceConfig } from "./types";

/** The GST title a composition dealer must print instead of a tax invoice. */
const BILL_OF_SUPPLY = "BILL OF SUPPLY";
/** Named so the error can say which title the vertical should carry. */
const TAX_INVOICE = "TAX INVOICE";

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
  // Section 31(3)(c): a supplier issues a Bill of Supply instead of a tax
  // invoice when it cannot charge tax on the face of the document — either
  // because it is under composition, or because the supply itself is exempt.
  // Two different reasons, one obligation.
  const owed =
    config.gst.composition !== undefined || config.gst.exempt === true;
  const titled =
    config.invoice.template.trim().toUpperCase() === BILL_OF_SUPPLY;

  if (owed !== titled) {
    throw new Error(
      `Business type "${config.businessType}" is inconsistent: it ` +
        `${owed ? "is" : "is not"} a Bill of Supply supplier (composition: ` +
        `${config.gst.composition !== undefined}, exempt: ` +
        `${config.gst.exempt === true}) but invoice.template is ` +
        `"${config.invoice.template}", not ` +
        `"${owed ? BILL_OF_SUPPLY : TAX_INVOICE}". The two must be declared ` +
        `together — a document titled "${TAX_INVOICE}" that charges no tax is ` +
        `a compliance defect, not a cosmetic one.`,
    );
  }
  return owed;
}

export function resolveReports(config: BusinessTypeConfig): string[] {
  return [...config.reports];
}
