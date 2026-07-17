/**
 * Lookup layer over business type configs.
 *
 * Seeded verticals arrive from `./seed/business-types`; custom/no-code verticals
 * arrive from `business_types.config` (jsonb) at runtime. `parseBusinessTypeConfig`
 * is the trust boundary for the latter — nothing else in the engine re-checks shape.
 */

import type {
  BusinessTypeConfig,
  CompositionScheme,
  FieldDef,
  FieldType,
  GstConfig,
  GstRate,
  GstSlab,
  InvoiceConfig,
  JsonValue,
  Predicate,
  SelectOption,
  ValidationCheck,
  ValidationRule,
} from "./types";
import { BUSINESS_TYPES } from "./seed/business-types";

export interface BusinessTypeSummary {
  businessType: string;
  label: string;
  sector: string;
  letter: string;
  hue: number;
}

/** Thrown by `parseBusinessTypeConfig`. `path` locates the offending node. */
export class BusinessTypeConfigError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`Invalid business type config at ${path}: ${detail}`);
    this.name = "BusinessTypeConfigError";
    this.path = path;
  }
}

let index: Map<string, BusinessTypeConfig> | undefined;

function byKey(): Map<string, BusinessTypeConfig> {
  index ??= new Map(
    BUSINESS_TYPES.map((config) => [config.businessType, config]),
  );
  return index;
}

export function getBusinessType(key: string): BusinessTypeConfig | undefined {
  return byKey().get(key);
}

/**
 * The design prototype's `find()` ends in `|| this.data[0]`, silently rendering
 * the first vertical for an unknown id. That is safe for a static mockup and
 * unacceptable here: the config is the only thing that makes a pharmacy behave
 * like a pharmacy, so a fallback would let an unknown key run expiry-free,
 * schedule-free billing under whatever vertical happens to sort first. No
 * fallback — an unknown key is a bug, and it surfaces as one.
 */
export function requireBusinessType(key: string): BusinessTypeConfig {
  const config = getBusinessType(key);
  if (!config) {
    throw new Error(
      `Unknown business type "${key}". Known keys: ${[...byKey().keys()].join(", ")}`,
    );
  }
  return config;
}

export function listBusinessTypes(): readonly BusinessTypeConfig[] {
  return BUSINESS_TYPES;
}

/** The onboarding tile grid renders exactly these five fields; configs are heavy. */
export function listBusinessTypeSummaries(): readonly BusinessTypeSummary[] {
  return BUSINESS_TYPES.map((config) => ({
    businessType: config.businessType,
    label: config.label,
    sector: config.sector,
    letter: config.letter,
    hue: config.hue,
  }));
}

// ---------------------------------------------------------------------------
// Parsing — hand-written because the runtime carries no schema library
// ---------------------------------------------------------------------------

const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "number",
  "currency",
  "percent",
  "date",
  "time",
  "select",
  "boolean",
  "file",
  "scan",
  "auto",
];

const SCAN_KINDS = ["barcode", "imei"] as const;

const CHECK_KINDS: readonly ValidationCheck["kind"][] = [
  "date_after",
  "lte_field",
  "gt",
  "length",
  "gstin",
  "unique",
  "required_when",
  "note",
];

const COMPARISON_OPS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const;

function fail(path: string, detail: string): never {
  throw new BusinessTypeConfigError(path, detail);
}

function asObject(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(path, `expected an object, got ${describe(raw)}`);
  }
  return raw as Record<string, unknown>;
}

function asArray(raw: unknown, path: string): unknown[] {
  if (!Array.isArray(raw))
    fail(path, `expected an array, got ${describe(raw)}`);
  return raw;
}

function asString(raw: unknown, path: string): string {
  if (typeof raw !== "string")
    fail(path, `expected a string, got ${describe(raw)}`);
  return raw;
}

function asNonEmptyString(raw: unknown, path: string): string {
  const value = asString(raw, path);
  if (value.trim() === "") fail(path, "expected a non-empty string");
  return value;
}

function asNumber(raw: unknown, path: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    fail(path, `expected a finite number, got ${describe(raw)}`);
  }
  return raw;
}

function asInteger(raw: unknown, path: string): number {
  const value = asNumber(raw, path);
  if (!Number.isInteger(value)) fail(path, `expected an integer, got ${value}`);
  return value;
}

function asBoolean(raw: unknown, path: string): boolean {
  if (typeof raw !== "boolean")
    fail(path, `expected a boolean, got ${describe(raw)}`);
  return raw;
}

function asStringArray(raw: unknown, path: string): string[] {
  return asArray(raw, path).map((entry, i) => asString(entry, `${path}[${i}]`));
}

function describe(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return "an array";
  return typeof raw;
}

function parseJsonValue(raw: unknown, path: string): JsonValue {
  if (raw === null) return null;
  if (typeof raw === "string" || typeof raw === "boolean") return raw;
  if (typeof raw === "number") return asNumber(raw, path);
  if (Array.isArray(raw))
    return raw.map((entry, i) => parseJsonValue(entry, `${path}[${i}]`));
  if (typeof raw === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(raw)) {
      out[key] = parseJsonValue(value, `${path}.${key}`);
    }
    return out;
  }
  fail(path, `not JSON-representable (${describe(raw)})`);
}

function parseSelectOption(raw: unknown, path: string): SelectOption {
  const obj = asObject(raw, path);
  return {
    value: asString(obj["value"], `${path}.value`),
    label: asString(obj["label"], `${path}.label`),
  };
}

function parseFieldDef(raw: unknown, path: string): FieldDef {
  const obj = asObject(raw, path);
  const type = asString(obj["type"], `${path}.type`);
  if (!FIELD_TYPES.includes(type as FieldType)) {
    fail(`${path}.type`, `"${type}" is not one of ${FIELD_TYPES.join(", ")}`);
  }

  const field: FieldDef = {
    key: asNonEmptyString(obj["key"], `${path}.key`),
    label: asNonEmptyString(obj["label"], `${path}.label`),
    type: type as FieldType,
    required: asBoolean(obj["required"], `${path}.required`),
  };

  // types.ts calls `options` required for select, but the design defines no option
  // lists for any of its 18 verticals — the seed cannot supply what the spec of
  // record never stated. So options are enforced as well-formed when present and
  // left to the UI (free text) when absent, rather than rejecting the real seed.
  if (obj["options"] !== undefined) {
    field.options = asArray(obj["options"], `${path}.options`).map((entry, i) =>
      parseSelectOption(entry, `${path}.options[${i}]`),
    );
  }
  if (obj["unit"] !== undefined)
    field.unit = asNonEmptyString(obj["unit"], `${path}.unit`);
  if (obj["scanKind"] !== undefined) {
    const kind = asString(obj["scanKind"], `${path}.scanKind`);
    if (!SCAN_KINDS.includes(kind as (typeof SCAN_KINDS)[number])) {
      fail(
        `${path}.scanKind`,
        `"${kind}" is not one of ${SCAN_KINDS.join(", ")}`,
      );
    }
    field.scanKind = kind as (typeof SCAN_KINDS)[number];
  }
  return field;
}

export function parsePredicate(raw: unknown, path = "predicate"): Predicate {
  const obj = asObject(raw, path);
  const op = asString(obj["op"], `${path}.op`);

  if (COMPARISON_OPS.includes(op as (typeof COMPARISON_OPS)[number])) {
    return {
      op: op as (typeof COMPARISON_OPS)[number],
      field: asNonEmptyString(obj["field"], `${path}.field`),
      value: parseJsonValue(obj["value"], `${path}.value`),
    };
  }
  if (op === "in") {
    return {
      op,
      field: asNonEmptyString(obj["field"], `${path}.field`),
      values: asArray(obj["values"], `${path}.values`).map((entry, i) =>
        parseJsonValue(entry, `${path}.values[${i}]`),
      ),
    };
  }
  if (op === "present") {
    return { op, field: asNonEmptyString(obj["field"], `${path}.field`) };
  }
  if (op === "and" || op === "or") {
    return {
      op,
      of: asArray(obj["of"], `${path}.of`).map((entry, i) =>
        parsePredicate(entry, `${path}.of[${i}]`),
      ),
    };
  }
  if (op === "not") {
    return { op, of: parsePredicate(obj["of"], `${path}.of`) };
  }
  fail(`${path}.op`, `"${op}" is not a known predicate operator`);
}

function parseValidationCheck(raw: unknown, path: string): ValidationCheck {
  const obj = asObject(raw, path);
  const kind = asString(obj["kind"], `${path}.kind`);
  if (!CHECK_KINDS.includes(kind as ValidationCheck["kind"])) {
    fail(`${path}.kind`, `"${kind}" is not one of ${CHECK_KINDS.join(", ")}`);
  }

  switch (kind as ValidationCheck["kind"]) {
    case "date_after": {
      const check: Extract<ValidationCheck, { kind: "date_after" }> = {
        kind: "date_after",
        field: asNonEmptyString(obj["field"], `${path}.field`),
        than: asNonEmptyString(obj["than"], `${path}.than`),
      };
      if (obj["orEqual"] !== undefined) {
        check.orEqual = asBoolean(obj["orEqual"], `${path}.orEqual`);
      }
      return check;
    }
    case "lte_field":
      return {
        kind: "lte_field",
        field: asNonEmptyString(obj["field"], `${path}.field`),
        than: asNonEmptyString(obj["than"], `${path}.than`),
      };
    case "gt":
      return {
        kind: "gt",
        field: asNonEmptyString(obj["field"], `${path}.field`),
        value: asNumber(obj["value"], `${path}.value`),
      };
    case "length": {
      const check: Extract<ValidationCheck, { kind: "length" }> = {
        kind: "length",
        field: asNonEmptyString(obj["field"], `${path}.field`),
        exact: asInteger(obj["exact"], `${path}.exact`),
      };
      if (obj["charset"] !== undefined) {
        const charset = asString(obj["charset"], `${path}.charset`);
        if (charset !== "digits")
          fail(`${path}.charset`, `"${charset}" is not "digits"`);
        check.charset = charset;
      }
      return check;
    }
    case "gstin":
      return {
        kind: "gstin",
        field: asNonEmptyString(obj["field"], `${path}.field`),
      };
    case "unique":
      return {
        kind: "unique",
        fields: asArray(obj["fields"], `${path}.fields`).map((entry, i) =>
          asNonEmptyString(entry, `${path}.fields[${i}]`),
        ),
      };
    case "required_when":
      return {
        kind: "required_when",
        field: asNonEmptyString(obj["field"], `${path}.field`),
        when: parsePredicate(obj["when"], `${path}.when`),
      };
    case "note":
      return { kind: "note" };
  }
}

function parseValidationRule(raw: unknown, path: string): ValidationRule {
  const obj = asObject(raw, path);
  const rule: ValidationRule = {
    message: asNonEmptyString(obj["message"], `${path}.message`),
    check: parseValidationCheck(obj["check"], `${path}.check`),
  };
  if (obj["when"] !== undefined)
    rule.when = parsePredicate(obj["when"], `${path}.when`);
  return rule;
}

function parseGstRate(raw: unknown, path: string): GstRate {
  const obj = asObject(raw, path);
  const kind = asString(obj["kind"], `${path}.kind`);
  switch (kind) {
    case "fixed":
      return { kind, bps: asInteger(obj["bps"], `${path}.bps`) };
    case "range": {
      const minBps = asInteger(obj["minBps"], `${path}.minBps`);
      const maxBps = asInteger(obj["maxBps"], `${path}.maxBps`);
      const bps = asInteger(obj["bps"], `${path}.bps`);
      if (minBps > maxBps)
        fail(path, `minBps ${minBps} exceeds maxBps ${maxBps}`);
      if (bps < minBps || bps > maxBps) {
        fail(
          path,
          `bps ${bps} falls outside the displayed span ${minBps}–${maxBps}`,
        );
      }
      return { kind, minBps, maxBps, bps };
    }
    case "hsn":
    case "igst":
    case "none":
      return { kind };
    default:
      fail(`${path}.kind`, `"${kind}" is not a known GST rate kind`);
  }
}

function parseGstSlab(raw: unknown, path: string): GstSlab {
  const obj = asObject(raw, path);
  const slab: GstSlab = {
    applies: asNonEmptyString(obj["applies"], `${path}.applies`),
    rate: parseGstRate(obj["rate"], `${path}.rate`),
  };
  if (obj["when"] !== undefined)
    slab.when = parsePredicate(obj["when"], `${path}.when`);
  if (obj["itcBlocked"] !== undefined) {
    slab.itcBlocked = asBoolean(obj["itcBlocked"], `${path}.itcBlocked`);
  }
  return slab;
}

function parseComposition(raw: unknown, path: string): CompositionScheme {
  const obj = asObject(raw, path);
  return { rateBps: asInteger(obj["rateBps"], `${path}.rateBps`) };
}

function parseGstConfig(raw: unknown, path: string): GstConfig {
  const obj = asObject(raw, path);
  const gst: GstConfig = {
    defaultLabel: asNonEmptyString(obj["defaultLabel"], `${path}.defaultLabel`),
    default: parseGstRate(obj["default"], `${path}.default`),
    slabs: asArray(obj["slabs"], `${path}.slabs`).map((entry, i) =>
      parseGstSlab(entry, `${path}.slabs[${i}]`),
    ),
  };
  if (obj["composition"] !== undefined) {
    gst.composition = parseComposition(
      obj["composition"],
      `${path}.composition`,
    );
  }
  return gst;
}

function parseInvoiceConfig(raw: unknown, path: string): InvoiceConfig {
  const obj = asObject(raw, path);
  return {
    template: asNonEmptyString(obj["template"], `${path}.template`),
    columns: asStringArray(obj["columns"], `${path}.columns`),
    extras: asStringArray(obj["extras"], `${path}.extras`),
  };
}

/**
 * Validates a config record loaded from `business_types.config` (jsonb).
 * Returns a normalized copy: unknown keys are dropped, so a DB row cannot
 * smuggle fields past the contract.
 */
export function parseBusinessTypeConfig(raw: unknown): BusinessTypeConfig {
  const obj = asObject(raw, "config");
  const fields = asObject(obj["fields"], "config.fields");

  const hue = asNumber(obj["hue"], "config.hue");
  if (hue < 0 || hue >= 360) fail("config.hue", `expected 0–359, got ${hue}`);

  const required = asArray(fields["required"], "config.fields.required").map(
    (entry, i) => parseFieldDef(entry, `config.fields.required[${i}]`),
  );
  const optional = asArray(fields["optional"], "config.fields.optional").map(
    (entry, i) => parseFieldDef(entry, `config.fields.optional[${i}]`),
  );

  // Field keys address values in a single flat record; a duplicate would make one
  // definition silently unreachable.
  const seen = new Set<string>();
  for (const field of [...required, ...optional]) {
    if (seen.has(field.key))
      fail("config.fields", `duplicate field key "${field.key}"`);
    seen.add(field.key);
  }

  return {
    businessType: asNonEmptyString(obj["businessType"], "config.businessType"),
    label: asNonEmptyString(obj["label"], "config.label"),
    sector: asNonEmptyString(obj["sector"], "config.sector"),
    letter: asNonEmptyString(obj["letter"], "config.letter"),
    hue,
    fields: { required, optional },
    validations: asArray(obj["validations"], "config.validations").map(
      (entry, i) => parseValidationRule(entry, `config.validations[${i}]`),
    ),
    gst: parseGstConfig(obj["gst"], "config.gst"),
    invoice: parseInvoiceConfig(obj["invoice"], "config.invoice"),
    reports: asStringArray(obj["reports"], "config.reports"),
  };
}
