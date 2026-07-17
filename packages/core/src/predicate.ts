import type { JsonValue, Predicate } from "./types";

/**
 * The shared condition language, evaluated against a flat record of field
 * values. Both the GST slab resolver and the validation engine run predicates
 * against untrusted, partially-filled records, so this must be total: it never
 * throws and never touches anything outside its arguments.
 *
 * An unknown field is treated as absent, and every comparison against an absent
 * field is false — including `ne`. A predicate that fires because a field has
 * not been filled in yet would silently pick the wrong tax slab.
 */
export function evaluatePredicate(
  p: Predicate,
  values: Record<string, JsonValue>,
): boolean {
  switch (p.op) {
    case "and":
      return p.of.every((child) => evaluatePredicate(child, values));
    case "or":
      return p.of.some((child) => evaluatePredicate(child, values));
    case "not":
      return !evaluatePredicate(p.of, values);
    case "present":
      return lookup(p.field, values) !== undefined;
    case "in": {
      const value = lookup(p.field, values);
      if (value === undefined) return false;
      return p.values.some((candidate) => jsonEquals(value, candidate));
    }
    case "eq":
    case "ne": {
      const value = lookup(p.field, values);
      if (value === undefined) return false;
      const equal = jsonEquals(value, p.value);
      return p.op === "eq" ? equal : !equal;
    }
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const value = lookup(p.field, values);
      if (value === undefined) return false;
      return compare(p.op, value, p.value);
    }
  }
}

/** `null` reads as "not answered", which is what an absent key means too. */
function lookup(
  field: string,
  values: Record<string, JsonValue>,
): JsonValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, field)) return undefined;
  const value = values[field];
  return value === null ? undefined : value;
}

/**
 * Ordered comparison is defined only within a type. Numbers cover the design's
 * thresholds ("Tariff ≥ ₹7,500"); strings cover ISO dates, where lexical order
 * is chronological order. Anything else compares false rather than coercing —
 * `"5" > 7500` must not decide a tax rate.
 */
function compare(
  op: "lt" | "lte" | "gt" | "gte",
  left: JsonValue,
  right: JsonValue,
): boolean {
  if (typeof left === "number" && typeof right === "number") {
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    return orderedBy(op, left, right);
  }
  if (typeof left === "string" && typeof right === "string") {
    return orderedBy(op, left, right);
  }
  return false;
}

function orderedBy<T extends number | string>(
  op: "lt" | "lte" | "gt" | "gte",
  left: T,
  right: T,
): boolean {
  switch (op) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
  }
}

function jsonEquals(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => jsonEquals(item, b[index] as JsonValue));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        jsonEquals(a[key] as JsonValue, b[key] as JsonValue),
    );
  }
  return false;
}
