/**
 * The validation engine.
 *
 * Walks `BusinessTypeConfig.validations` in config order and returns one issue
 * per failing rule. Order is load-bearing: the design renders validations as an
 * ordered checklist, so issues must come back in the order the rules are
 * declared.
 *
 * Absent-value semantics (uniform across every check): an absent value —
 * `undefined`, `null`, or `""` — SKIPS the check rather than failing it.
 * Required-ness is expressed by `FieldDef.required` (see `validateRequired`)
 * and by `{kind:"required_when"}`; the constraint checks only constrain values
 * that exist. Without this, an empty optional field would emit "Expiry date
 * must be after today" on a blank form.
 */

import type {
  BusinessTypeConfig,
  JsonValue,
  ValidationIssue,
  ValidationRule,
} from "../types";
import { evaluatePredicate } from "../predicate";

/** Why a rule produced no verdict. Surfaced through `ValidateOptions.onSkip`. */
export type SkipReason =
  /** The rule's `when` predicate did not match. */
  | "when-not-met"
  /** A field the check reads is absent. */
  | "absent-value"
  /** A field holds a type the check cannot interpret (and cannot coerce). */
  | "type-mismatch"
  /** `{kind:"unique"}` with no `opts.isUnique` lookup supplied. */
  | "no-unique-lookup"
  /** `{kind:"note"}` — prose, never evaluable. */
  | "note";

export interface SkippedRule {
  /** Index into `config.validations`. */
  index: number;
  rule: ValidationRule;
  reason: SkipReason;
}

export interface ValidateOptions {
  /**
   * Calendar day for `than: "$today"`, as `YYYY-MM-DD`. Engine-supplied so the
   * result never depends on the wall clock or the host timezone. Defaults to
   * the host's local calendar day.
   */
  today?: string;
  /**
   * Store lookup for `{kind:"unique"}`, which cannot be decided from the record
   * alone. Absent => every unique rule is skipped and reported via `onSkip`.
   */
  isUnique?: (fields: string[], values: JsonValue[]) => boolean;
  /**
   * Called for every rule that yields no verdict. Callers that must not ship an
   * un-evaluated `unique` rule (e.g. a server-side commit path) can watch this
   * instead of trusting an empty issue list.
   */
  onSkip?: (skipped: SkippedRule) => void;
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

function isAbsent(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Numbers arrive from form inputs as strings ("450" from a currency field), so
 * numeric strings coerce. Anything else (booleans, objects, "abc") is a
 * mismatch the check declines rather than guesses at — `Number(true)` is 1 and
 * `Number([])` is 0, and either would silently pass a price comparison.
 */
function toNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Reduces a value to its calendar day as `YYYY-MM-DD`.
 *
 * Deliberately never constructs a `Date`. "Expiry must be after today" is a
 * calendar-day question; parsing to a timestamp would make the answer depend on
 * the host timezone (`new Date("2026-07-17")` is midnight UTC, which is still
 * 2026-07-16 in the Americas). Zero-padded fixed-width day strings compare
 * correctly with `<`/`>`, so the whole engine stays timezone-free.
 */
function toCalendarDay(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = ISO_DATE.exec(value.trim());
  return match ? match[0] : undefined;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// GSTIN
// ---------------------------------------------------------------------------

/**
 * GSTIN structure and checksum come from the GST standard, not from the design:
 * the design says only "must be valid (15 chars)" and shows the sample
 * `29ABCDE1234F1Z5`. Encoded here as the published rule —
 *   [2-digit state code][10-char PAN][entity digit][Z][checksum]
 * — with the standard mod-36 check character.
 *
 * The PAN segment is itself structured (5 letters, 4 digits, 1 letter); the
 * entity code is 1-9 or A-Z; position 14 is the literal 'Z' for a regular
 * registration.
 */
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The checksum alphabet: value = index. 0-9 => 0-9, A-Z => 10-35. */
const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Standard GSTIN check character over the first 14 positions: each character's
 * alphabet value is multiplied by an alternating 1/2 factor, the product is
 * folded back into base 36 (quotient + remainder), and the check digit is the
 * complement of the running sum mod 36.
 */
function gstinCheckChar(first14: string): string | undefined {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_ALPHABET.indexOf(first14[i] as string);
    if (value < 0) return undefined;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
}

export function isValidGstin(candidate: string): boolean {
  const gstin = candidate.trim();
  if (gstin.length !== 15) return false;
  if (!GSTIN_FORMAT.test(gstin)) return false;
  return gstinCheckChar(gstin.slice(0, 14)) === gstin[14];
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Evaluates every rule in `config.validations` against `values`.
 *
 * Returns one issue per failing rule, in config order, carrying the rule's
 * verbatim `message` — the design prose is the spec of record, so the engine
 * never rewrites it.
 */
export function validateRecord(
  config: BusinessTypeConfig,
  values: Record<string, JsonValue>,
  opts: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const today = opts.today ?? localToday();

  config.validations.forEach((rule, index) => {
    const skip = (reason: SkipReason) => opts.onSkip?.({ index, rule, reason });

    if (rule.when && !evaluatePredicate(rule.when, values)) {
      skip("when-not-met");
      return;
    }

    const fail = (field: string | null) =>
      issues.push({ field, message: rule.message });

    const check = rule.check;
    switch (check.kind) {
      case "date_after": {
        const actual = toCalendarDay(values[check.field]);
        if (actual === undefined) {
          skip(
            isAbsent(values[check.field]) ? "absent-value" : "type-mismatch",
          );
          return;
        }
        const bound =
          check.than === "$today" ? today : toCalendarDay(values[check.than]);
        if (bound === undefined) {
          skip(isAbsent(values[check.than]) ? "absent-value" : "type-mismatch");
          return;
        }
        const ok = check.orEqual ? actual >= bound : actual > bound;
        if (!ok) fail(check.field);
        return;
      }

      case "lte_field": {
        const actual = toNumber(values[check.field]);
        const bound = toNumber(values[check.than]);
        if (actual === undefined) {
          skip(
            isAbsent(values[check.field]) ? "absent-value" : "type-mismatch",
          );
          return;
        }
        if (bound === undefined) {
          skip(isAbsent(values[check.than]) ? "absent-value" : "type-mismatch");
          return;
        }
        if (!(actual <= bound)) fail(check.field);
        return;
      }

      case "gt": {
        const actual = toNumber(values[check.field]);
        if (actual === undefined) {
          skip(
            isAbsent(values[check.field]) ? "absent-value" : "type-mismatch",
          );
          return;
        }
        if (!(actual > check.value)) fail(check.field);
        return;
      }

      case "length": {
        const raw = values[check.field];
        if (typeof raw !== "string") {
          // Not coerced from number: an IMEI or HUID is an identifier, and
          // String(0123456) has already lost its leading zero by the time it
          // reaches us.
          skip(isAbsent(raw) ? "absent-value" : "type-mismatch");
          return;
        }
        if (raw === "") {
          skip("absent-value");
          return;
        }
        const ok =
          raw.length === check.exact &&
          (check.charset !== "digits" || /^[0-9]+$/.test(raw));
        if (!ok) fail(check.field);
        return;
      }

      case "gstin": {
        const raw = values[check.field];
        if (typeof raw !== "string" || raw === "") {
          skip(isAbsent(raw) ? "absent-value" : "type-mismatch");
          return;
        }
        if (!isValidGstin(raw)) fail(check.field);
        return;
      }

      case "unique": {
        if (!opts.isUnique) {
          skip("no-unique-lookup");
          return;
        }
        if (check.fields.every((f) => isAbsent(values[f]))) {
          skip("absent-value");
          return;
        }
        const lookupValues = check.fields.map((f) => values[f] ?? null);
        // A composite key ("SKU unique per size+colour") belongs to no single
        // input, so it surfaces as a record-level issue.
        const field =
          check.fields.length === 1 ? (check.fields[0] as string) : null;
        if (!opts.isUnique(check.fields, lookupValues)) fail(field);
        return;
      }

      case "required_when": {
        if (!evaluatePredicate(check.when, values)) {
          skip("when-not-met");
          return;
        }
        if (isAbsent(values[check.field])) fail(check.field);
        return;
      }

      case "note":
        skip("note");
        return;
    }
  });

  return issues;
}

/**
 * Checks every `FieldDef.required` field is present.
 *
 * Kept separate from `validateRecord` because the two answer different
 * questions: required-ness is a property of the field definition, while
 * `config.validations` is the design's prose checklist. Callers that render the
 * checklist want only the latter.
 */
export function validateRequired(
  config: BusinessTypeConfig,
  values: Record<string, JsonValue>,
): ValidationIssue[] {
  return config.fields.required
    .filter((field) => isAbsent(values[field.key]))
    .map((field) => ({
      field: field.key,
      message: `${field.label} is required`,
    }));
}
