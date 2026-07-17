/**
 * Schema-driven form support.
 *
 * Every value the app stores passes through `coerceValue`, so this is where raw
 * form input (always strings, from an <input>) becomes the canonical type the
 * engine computes on — Paise for currency, Bps for percent. Nothing downstream
 * re-parses.
 */

import type { BusinessTypeConfig, FieldDef, JsonValue } from "./types";
import { parseRupees } from "./money";

/** Thrown when raw input cannot be represented as the field's canonical type. */
export class FieldCoercionError extends Error {
  /** FieldDef.key, so a form can attach the message to the offending input. */
  readonly field: string;
  readonly raw: unknown;

  constructor(field: FieldDef, raw: unknown, detail: string) {
    super(`${field.label} (${field.key}): ${detail}`);
    this.name = "FieldCoercionError";
    this.field = field.key;
    this.raw = raw;
  }
}

/** Required first (design order), then optional; order within each preserved. */
export function resolveFields(config: BusinessTypeConfig): FieldDef[] {
  return [...config.fields.required, ...config.fields.optional];
}

export function getField(
  config: BusinessTypeConfig,
  key: string,
): FieldDef | undefined {
  return resolveFields(config).find((field) => field.key === key);
}

export function fieldsByKey(
  config: BusinessTypeConfig,
): Record<string, FieldDef> {
  return Object.fromEntries(
    resolveFields(config).map((field) => [field.key, field]),
  );
}

/**
 * Initial values for a new form. Empty is `null`, not zero — a blank Qty and a
 * Qty of 0 are different claims, and only the second may reach a tax computation.
 * `auto` fields are system-generated (KOT No), so they start null too and are
 * never rendered as inputs.
 */
export function emptyRecord(
  config: BusinessTypeConfig,
): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = {};
  for (const field of resolveFields(config)) {
    record[field.key] =
      field.type === "text" ? "" : field.type === "boolean" ? false : null;
  }
  return record;
}

function isBlank(raw: unknown): boolean {
  return (
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && raw.trim() === "")
  );
}

function asInputString(field: FieldDef, raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  throw new FieldCoercionError(
    field,
    raw,
    `expected a string, got ${typeof raw}`,
  );
}

function coerceNumber(field: FieldDef, raw: unknown): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw))
      throw new FieldCoercionError(field, raw, "not a finite number");
    return raw;
  }
  const text = asInputString(field, raw);
  const value = Number(text);
  if (!Number.isFinite(value))
    throw new FieldCoercionError(field, raw, `"${text}" is not a number`);
  return value;
}

function coercePercent(field: FieldDef, raw: unknown): number {
  const text = typeof raw === "string" ? raw.trim().replace(/%$/, "") : raw;
  const percent = coerceNumber(field, text);
  // Percent fields in the design are all tax/discount rates; outside 0–100 is a
  // typo, and 12.5% must survive as 1250 bps rather than a float.
  if (percent < 0 || percent > 100) {
    throw new FieldCoercionError(
      field,
      raw,
      `expected a percentage in 0–100, got ${percent}`,
    );
  }
  return Math.round(percent * 100);
}

function coerceDate(field: FieldDef, raw: unknown): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime()))
      throw new FieldCoercionError(field, raw, "invalid Date");
    // Local components, not toISOString(): a Date at local midnight shifts a day
    // in UTC, and an expiry that moves is a recall waiting to happen.
    const month = String(raw.getMonth() + 1).padStart(2, "0");
    const day = String(raw.getDate()).padStart(2, "0");
    return `${raw.getFullYear()}-${month}-${day}`;
  }
  const text = asInputString(field, raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (!match)
    throw new FieldCoercionError(
      field,
      raw,
      `"${text}" is not an ISO date (YYYY-MM-DD)`,
    );
  const [, year, month, day] = match as unknown as [
    string,
    string,
    string,
    string,
  ];
  const probe = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.getUTCDate() !== Number(day)) {
    throw new FieldCoercionError(
      field,
      raw,
      `"${text}" is not a real calendar date`,
    );
  }
  return `${year}-${month}-${day}`;
}

function coerceTime(field: FieldDef, raw: unknown): string {
  const text = asInputString(field, raw);
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match)
    throw new FieldCoercionError(field, raw, `"${text}" is not a time (HH:MM)`);
  const [, hours, minutes] = match as unknown as [string, string, string];
  if (Number(hours) > 23 || Number(minutes) > 59) {
    throw new FieldCoercionError(
      field,
      raw,
      `"${text}" is not a valid time of day`,
    );
  }
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function coerceBoolean(field: FieldDef, raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === 0) return raw === 1;
  const text = asInputString(field, raw).toLowerCase();
  // "on" is what an unadorned HTML checkbox posts.
  if (text === "true" || text === "on" || text === "1") return true;
  if (text === "false" || text === "off" || text === "0") return false;
  throw new FieldCoercionError(field, raw, `"${text}" is not a boolean`);
}

function coerceSelect(field: FieldDef, raw: unknown): string {
  const text = asInputString(field, raw);
  // The design defines no option lists, so a select without `options` accepts any
  // value; the constraint only exists once a config supplies one.
  if (!field.options) return text;
  const option = field.options.find((entry) => entry.value === text);
  if (!option) {
    const allowed = field.options.map((entry) => entry.value).join(", ");
    throw new FieldCoercionError(
      field,
      raw,
      `"${text}" is not one of: ${allowed}`,
    );
  }
  return option.value;
}

function coerceCurrency(field: FieldDef, raw: unknown): number {
  try {
    return parseRupees(typeof raw === "string" ? raw.trim() : String(raw));
  } catch (error) {
    throw new FieldCoercionError(field, raw, (error as Error).message);
  }
}

/**
 * Raw form input -> the field's canonical type. Throws `FieldCoercionError` on
 * anything it cannot represent; blank input is not an error here (a missing
 * required value is validation's call, not coercion's) and yields the field's
 * empty value.
 */
export function coerceValue(field: FieldDef, raw: unknown): JsonValue {
  if (isBlank(raw)) {
    return field.type === "text" ? "" : field.type === "boolean" ? false : null;
  }

  // `auto` is system-generated and never user-editable; coercion only carries
  // through whatever the engine already wrote.
  switch (field.type) {
    case "text":
    case "file":
    case "scan":
    case "auto":
      return asInputString(field, raw);
    case "number":
      return coerceNumber(field, raw);
    case "currency":
      return coerceCurrency(field, raw);
    case "percent":
      return coercePercent(field, raw);
    case "date":
      return coerceDate(field, raw);
    case "time":
      return coerceTime(field, raw);
    case "select":
      return coerceSelect(field, raw);
    case "boolean":
      return coerceBoolean(field, raw);
  }
}

/**
 * Coerces a whole form submission against the config, starting from
 * `emptyRecord` so the result is complete. Keys the config does not define are
 * dropped: the config is the contract, and the record feeds predicates that
 * address fields by key. Throws on the first bad value.
 */
export function coerceRecord(
  config: BusinessTypeConfig,
  raw: Record<string, unknown>,
): Record<string, JsonValue> {
  const record = emptyRecord(config);
  for (const field of resolveFields(config)) {
    if (field.key in raw)
      record[field.key] = coerceValue(field, raw[field.key]);
  }
  return record;
}
