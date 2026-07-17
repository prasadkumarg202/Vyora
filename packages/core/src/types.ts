/**
 * The metadata contract.
 *
 * `business_types.config` is the only thing that makes a pharmacy behave like a
 * pharmacy. No module may branch on a business-type key — it reads this record.
 *
 * The design file (design/Vyora Dynamic Business Engine.dc.html) stores this as
 * display strings: prose validations, rates like "0–5%", labels as identifiers.
 * That renders but cannot execute. So every construct here carries both:
 * a machine-readable form the engine evaluates, and the verbatim design string
 * (`label` / `message` / `applies`) the UI shows. The prose is the spec of
 * record; if the two ever disagree, the prose wins and the structure is a bug.
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Rupees never appear as floats. 12.5% -> 1250 bps, ₹7,500 -> 750000 paise. */
export type Bps = number;
export type Paise = number;

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** The 11 input types used across the 18 verticals. */
export type FieldType =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "time"
  | "select"
  | "boolean"
  | "file"
  /** Camera/barcode capture. */
  | "scan"
  /** System-generated; not user-editable (e.g. KOT No). */
  | "auto";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** Stable snake_case identifier. The design only had labels; these are ours. */
  key: string;
  /** Verbatim design label, e.g. "Schedule (H/H1/X)". */
  label: string;
  type: FieldType;
  required: boolean;
  /** Required for `select`. */
  options?: SelectOption[];
  /** Display suffix pulled out of the label, e.g. "g" from "Gross wt (g)". */
  unit?: string;
  /** What a `scan` field captures. */
  scanKind?: "barcode" | "imei";
}

// ---------------------------------------------------------------------------
// Predicates — the shared condition language
// ---------------------------------------------------------------------------

/**
 * Evaluated against a flat record of field values. `field` is a FieldDef.key,
 * except for the engine-supplied pseudo-fields documented on TaxContext.
 */
export type Predicate =
  | {
      op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
      field: string;
      value: JsonValue;
    }
  | { op: "in"; field: string; values: JsonValue[] }
  | { op: "present"; field: string }
  | { op: "and" | "or"; of: Predicate[] }
  | { op: "not"; of: Predicate };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationCheck =
  /** Expiry after today; check-out after check-in; delivery on/after order. */
  | {
      kind: "date_after";
      field: string;
      than: string | "$today";
      orEqual?: boolean;
    }
  /**
   * Selling price <= MRP; net <= gross; advance <= total. `than` is another
   * field key, or a pseudo-field: `$available_stock` ("Qty cannot exceed
   * available stock" — the record alone cannot answer this, so the caller must
   * supply it), `$line_total_paise` ("Advance cannot exceed total").
   */
  | { kind: "lte_field"; field: string; than: string }
  /** Pax / weight / quantity must be greater than 0. */
  | { kind: "gt"; field: string; value: number }
  /** IMEI 15 digits, HUID 6 chars, GSTIN 15 chars. */
  | { kind: "length"; field: string; exact: number; charset?: "digits" }
  | { kind: "gstin"; field: string }
  /** Barcode unique; SKU unique per size+colour. Needs a store lookup. */
  | { kind: "unique"; fields: string[] }
  /** Batch mandatory for scheduled drugs; table required for dine-in. */
  | { kind: "required_when"; field: string; when: Predicate }
  /**
   * Prose that describes derived behaviour or an operator prompt rather than a
   * record constraint ("Warranty auto-calculated", "Daily cash reconciliation").
   * Carried so the UI can list every rule the design shows; never fails.
   */
  | { kind: "note" };

export interface ValidationRule {
  /** Verbatim design prose. This is the user-facing error text. */
  message: string;
  check: ValidationCheck;
  /** Only run when this holds — e.g. composition dealers skip tax-breakup rules. */
  when?: Predicate;
}

export interface ValidationIssue {
  /** FieldDef.key the issue attaches to, or null for record-level. */
  field: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// GST
// ---------------------------------------------------------------------------

/**
 * The design's rate strings are display text, not numbers: "12%", "0–5%",
 * "As per HSN", "IGST", "5% (no ITC)", "—". Each maps to exactly one of these.
 */
export type GstRate =
  | { kind: "fixed"; bps: Bps }
  /** A displayed span ("0–5%"); `bps` is the rate to apply absent an override. */
  | { kind: "range"; minBps: Bps; maxBps: Bps; bps: Bps }
  /** Rate comes from the item's HSN, not the vertical. */
  | { kind: "hsn" }
  /** Wholesale's inter-state row: a split, not a rate. */
  | { kind: "igst" }
  /** Distributor's "—": the row is informational. */
  | { kind: "none" };

export interface GstSlab {
  /** Verbatim design string, e.g. "Tariff ≥ ₹7,500". */
  applies: string;
  rate: GstRate;
  /**
   * Machine form of the threshold encoded in `applies`. Absent where the design
   * states no condition — then the slab is descriptive only.
   */
  when?: Predicate;
  /** "5% (no ITC)" — restaurants forfeit input credit. */
  itcBlocked?: boolean;
}

export interface CompositionScheme {
  /** Kirana: 1% of turnover. */
  rateBps: Bps;
}

export interface GstConfig {
  /** Verbatim `gstDefault`, e.g. "Composition 1%". Display only. */
  defaultLabel: string;
  /**
   * Applied when neither a slab nor an item override resolves. Note this
   * cannot carry `itcBlocked` — only a slab can. No vertical currently
   * defaults to a no-ITC rate, but a future one would lose the flag here.
   */
  default: GstRate;
  /** Present only for composition dealers; forces a bill of supply, no breakup. */
  composition?: CompositionScheme;
  slabs: GstSlab[];
}

// ---------------------------------------------------------------------------
// Invoice & reports
// ---------------------------------------------------------------------------

export interface InvoiceConfig {
  /** "TAX INVOICE", "BILL OF SUPPLY", "GUEST FOLIO", … */
  template: string;
  /** Display headers, in order. */
  columns: string[];
  /** Free-text badges, e.g. "Drug license no.". */
  extras: string[];
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface BusinessTypeConfig {
  /** Matches business_types.key. */
  businessType: string;
  label: string;
  /** Display-only presentation hints from the design tiles. */
  sector: string;
  letter: string;
  hue: number;
  fields: {
    required: FieldDef[];
    optional: FieldDef[];
  };
  validations: ValidationRule[];
  gst: GstConfig;
  invoice: InvoiceConfig;
  /** Flat display names; the design defines no report ids or params. */
  reports: string[];
}

// ---------------------------------------------------------------------------
// Tax computation
// ---------------------------------------------------------------------------

export interface LineItem {
  /** Field values keyed by FieldDef.key. Drives slab predicates. */
  fields?: Record<string, JsonValue>;
  qty: number;
  unitPricePaise: Paise;
  /** Deducted before tax (old-gold exchange, scheme discount, trade-in). */
  discountPaise?: Paise;
  /** Wins over every slab. This is how `{kind:"hsn"}` verticals get a rate. */
  gstBps?: Bps;
  hsn?: string;
}

/**
 * Pseudo-fields the engine injects before evaluating slab predicates, so the
 * design's thresholds ("Tariff ≥ ₹7,500") can be expressed against them:
 *   $unit_price_paise, $line_total_paise, $qty
 */
export interface TaxContext {
  /** Two-digit GST state code of the supplier, e.g. "29". */
  supplierStateCode: string;
  /** Two-digit state code of the place of supply. Differing => IGST. */
  placeOfSupplyStateCode: string;
  /** Round the grand total to the nearest rupee and report the delta. */
  roundOff?: boolean;
}

export interface LineTax {
  taxableValuePaise: Paise;
  rateBps: Bps;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  totalTaxPaise: Paise;
  totalPaise: Paise;
  /** Slab that resolved the rate, for the "traced to source" GST view. */
  appliedSlab?: string;
  itcBlocked?: boolean;
}

export interface TaxBreakup {
  lines: LineTax[];
  taxableValuePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  totalTaxPaise: Paise;
  /** Signed; ±50 paise at most. Zero when roundOff is off. */
  roundOffPaise: Paise;
  grandTotalPaise: Paise;
  /** True for composition dealers: no tax breakup may be printed. */
  composition: boolean;
}
