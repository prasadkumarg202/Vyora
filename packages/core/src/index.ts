/**
 * @vyora/core — the metadata engine.
 *
 * `business_types.config` is the only thing that makes a pharmacy behave like a
 * pharmacy: every consumer reads a `BusinessTypeConfig` and asks this package
 * what to render, coerce, validate, tax and print. Nothing here branches on a
 * business-type key, and nothing outside here should either.
 *
 * This file is the curated surface `apps/web` imports. Internal helpers stay in
 * their modules.
 */

// --- The contract -----------------------------------------------------------

export type {
  Bps,
  BusinessTypeConfig,
  CompositionScheme,
  FieldDef,
  FieldType,
  GstConfig,
  GstRate,
  GstSlab,
  InvoiceConfig,
  JsonValue,
  LineItem,
  LineTax,
  Paise,
  Predicate,
  SelectOption,
  TaxBreakup,
  TaxContext,
  ValidationCheck,
  ValidationIssue,
  ValidationRule,
} from "./types";

// --- Registry: which vertical, and is this config trustworthy ----------------

export {
  BusinessTypeConfigError,
  getBusinessType,
  listBusinessTypeSummaries,
  listBusinessTypes,
  parseBusinessTypeConfig,
  parsePredicate,
  requireBusinessType,
} from "./registry";
export type { BusinessTypeSummary } from "./registry";

/** The 18 seeded verticals. Custom ones arrive via `parseBusinessTypeConfig`. */
export { BUSINESS_TYPES } from "./seed/business-types";

// --- Fields: schema-driven forms --------------------------------------------

export {
  FieldCoercionError,
  coerceRecord,
  coerceValue,
  emptyRecord,
  fieldsByKey,
  getField,
  resolveFields,
} from "./fields";

// --- Money: rupees never appear as floats -----------------------------------

export {
  allocate,
  applyBps,
  formatPaise,
  multiplyPaise,
  paiseToRupees,
  parseRupees,
  roundToNearestRupee,
  rupeesToPaise,
  sumPaise,
} from "./money";

// --- Predicates, validation -------------------------------------------------

export { evaluatePredicate } from "./predicate";

export {
  isValidGstin,
  validateRecord,
  validateRequired,
} from "./validation/evaluate";
export type {
  SkipReason,
  SkippedRule,
  ValidateOptions,
} from "./validation/evaluate";

// --- GST -------------------------------------------------------------------

export { parseRate } from "./gst/rate";
export { computeTax } from "./gst/compute";

// --- Invoice & reports ------------------------------------------------------

export { isBillOfSupply, resolveInvoice, resolveReports } from "./invoice";

// --- Reconciliation (UPI / bank statement auto-match) -----------------------

export { buildMatches, cellToPaise, extractReference, parseStatement } from "./reconcile/match";
export type {
  BuildMatchesInput,
  Match,
  MatchConfidence,
  ReconcileInvoice,
  ReconcileResult,
  StatementTxn,
} from "./reconcile/match";
export {
  gatewayPaymentsToTxns,
  normalizeCashfreePayment,
  normalizeRazorpayPayment,
} from "./reconcile/gateway";
export type { GatewayPayment } from "./reconcile/gateway";
