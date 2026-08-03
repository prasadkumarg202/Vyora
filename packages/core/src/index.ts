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

/** The 19 seeded verticals. Custom ones arrive via `parseBusinessTypeConfig`. */
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

// --- India: states, GSTIN & PAN ---------------------------------------------

export {
  INDIAN_STATES,
  gstinPan,
  gstinStateCode,
  isValidPan,
  stateByCode,
  stateCodeFor,
} from "./india/states";
export type { IndianState } from "./india/states";

// --- GST -------------------------------------------------------------------

export { parseRate } from "./gst/rate";
export { computeTax } from "./gst/compute";
export { computeDocument } from "./gst/document";
export type {
  DocumentCharge,
  DocumentDiscount,
  DocumentInput,
  DocumentTotals,
} from "./gst/document";

// --- Invoice & reports ------------------------------------------------------

export { isBillOfSupply, resolveInvoice, resolveReports } from "./invoice";

// --- Billing: the price ladder and what each plan unlocks -------------------

export {
  BASIC_PLAN,
  GST_BPS,
  PLANS,
  PLAN_ORDER,
  PURCHASABLE_PLANS,
  TRIAL_PLAN,
  getPlan,
  isAtLeast,
  parseBillingCycle,
  parsePlanId,
  planRank,
  priceOf,
  splitGstInclusive,
  yearlyAsMonthly,
  yearlySavingsPct,
} from "./billing/plans";
export type {
  BillingCycle,
  GstSplit,
  PlanDef,
  PlanId,
  PlanLimits,
} from "./billing/plans";

export {
  COMPARISON,
  FEATURES,
  FEATURE_GROUPS,
  FEATURE_LIST,
  featuresAddedBy,
  featuresInGroup,
  parseFeatureKey,
  shippedFeaturesFor,
} from "./billing/features";
export type {
  ComparisonRow,
  FeatureDef,
  FeatureGroup,
  FeatureKey,
  FeatureStatus,
} from "./billing/features";

export {
  DAYS_UNTIL_LOCK,
  LOCKED_FEATURES,
  PAST_DUE_GRACE_DAYS,
  POST_TRIAL_GRACE_DAYS,
  TRIAL_DAYS,
  TRIAL_WARN_DAYS,
  can,
  canAddDevice,
  canAddUser,
  freshTrialState,
  isPlanned,
  isUpgrade,
  parseSubscriptionStatus,
  requiredPlanFor,
  resolveEntitlement,
} from "./billing/entitlement";
export type {
  Entitlement,
  OrgBillingState,
  SeatCheck,
  SubscriptionStatus,
} from "./billing/entitlement";

// --- Reconciliation (UPI / bank statement auto-match) -----------------------

export {
  buildMatches,
  cellToPaise,
  extractReference,
  parseStatement,
} from "./reconcile/match";
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
