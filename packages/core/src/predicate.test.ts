import { describe, expect, it } from "vitest";
import { evaluatePredicate } from "./predicate";
import type { Predicate } from "./types";

const values = {
  tariff: 750000,
  schedule: "H1",
  dine_in: true,
  hsn: "7113",
  batch: null,
  tags: ["gold", "22k"],
  meta: { a: 1 },
};

describe("evaluatePredicate", () => {
  it("compares for equality across JSON types", () => {
    expect(
      evaluatePredicate({ op: "eq", field: "schedule", value: "H1" }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "eq", field: "schedule", value: "H" }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "dine_in", value: true }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "eq", field: "tariff", value: 750000 }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "ne", field: "schedule", value: "X" }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "ne", field: "schedule", value: "H1" }, values),
    ).toBe(false);
  });

  it("compares arrays and objects structurally", () => {
    expect(
      evaluatePredicate(
        { op: "eq", field: "tags", value: ["gold", "22k"] },
        values,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "eq", field: "tags", value: ["gold"] }, values),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { op: "eq", field: "tags", value: ["gold", "24k"] },
        values,
      ),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "meta", value: { a: 1 } }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "eq", field: "meta", value: { a: 2 } }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "meta", value: { b: 1 } }, values),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { op: "eq", field: "meta", value: { a: 1, b: 2 } },
        values,
      ),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "tags", value: "gold" }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "meta", value: ["a"] }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "tags", value: { a: 1 } }, values),
    ).toBe(false);
  });

  it("orders numbers", () => {
    expect(
      evaluatePredicate({ op: "gte", field: "tariff", value: 750000 }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "gt", field: "tariff", value: 750000 }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "lt", field: "tariff", value: 750001 }, values),
    ).toBe(true);
    expect(
      evaluatePredicate({ op: "lte", field: "tariff", value: 749999 }, values),
    ).toBe(false);
  });

  it("orders strings, so ISO dates compare chronologically", () => {
    const record = { expiry: "2026-01-31" };
    expect(
      evaluatePredicate(
        { op: "gt", field: "expiry", value: "2025-12-31" },
        record,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        { op: "lt", field: "expiry", value: "2025-12-31" },
        record,
      ),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { op: "lte", field: "expiry", value: "2026-01-31" },
        record,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        { op: "gte", field: "expiry", value: "2026-02-01" },
        record,
      ),
    ).toBe(false);
  });

  it("refuses to order across types instead of coercing", () => {
    // "5" > 7500 is true in JS. It must never decide a tax rate.
    expect(
      evaluatePredicate({ op: "gt", field: "schedule", value: 5 }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "lt", field: "dine_in", value: 1 }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "gt", field: "tags", value: 1 }, values),
    ).toBe(false);
  });

  it("treats NaN as uncomparable", () => {
    expect(
      evaluatePredicate({ op: "gt", field: "n", value: 1 }, { n: NaN }),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "lt", field: "n", value: NaN }, { n: 1 }),
    ).toBe(false);
  });

  it("tests membership", () => {
    expect(
      evaluatePredicate(
        { op: "in", field: "schedule", values: ["H", "H1", "X"] },
        values,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        { op: "in", field: "schedule", values: ["H", "X"] },
        values,
      ),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "in", field: "schedule", values: [] }, values),
    ).toBe(false);
  });

  it("tests presence", () => {
    expect(
      evaluatePredicate({ op: "present", field: "schedule" }, values),
    ).toBe(true);
    expect(evaluatePredicate({ op: "present", field: "dine_in" }, values)).toBe(
      true,
    );
    expect(evaluatePredicate({ op: "present", field: "nope" }, values)).toBe(
      false,
    );
  });

  it("treats an unknown field as absent, never as a match", () => {
    expect(
      evaluatePredicate({ op: "eq", field: "nope", value: "x" }, values),
    ).toBe(false);
    // An absent field is not "not equal" either: a half-filled record must not
    // fire a slab.
    expect(
      evaluatePredicate({ op: "ne", field: "nope", value: "x" }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "gte", field: "nope", value: 0 }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "in", field: "nope", values: ["x"] }, values),
    ).toBe(false);
  });

  it("treats an explicit null as absent", () => {
    expect(evaluatePredicate({ op: "present", field: "batch" }, values)).toBe(
      false,
    );
    expect(
      evaluatePredicate({ op: "eq", field: "batch", value: null }, values),
    ).toBe(false);
  });

  it("never matches a null on the predicate's side either", () => {
    expect(
      evaluatePredicate({ op: "eq", field: "schedule", value: null }, values),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { op: "in", field: "schedule", values: [null] },
        values,
      ),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "eq", field: "meta", value: null }, values),
    ).toBe(false);
  });

  it("does not read inherited properties", () => {
    expect(
      evaluatePredicate({ op: "present", field: "toString" }, values),
    ).toBe(false);
    expect(
      evaluatePredicate({ op: "present", field: "constructor" }, values),
    ).toBe(false);
  });

  it("combines with and/or/not", () => {
    const p: Predicate = {
      op: "and",
      of: [
        { op: "gte", field: "tariff", value: 750000 },
        { op: "not", of: { op: "eq", field: "schedule", value: "X" } },
      ],
    };
    expect(evaluatePredicate(p, values)).toBe(true);

    expect(
      evaluatePredicate(
        {
          op: "or",
          of: [
            { op: "eq", field: "schedule", value: "X" },
            { op: "eq", field: "dine_in", value: true },
          ],
        },
        values,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        {
          op: "or",
          of: [
            { op: "eq", field: "schedule", value: "X" },
            { op: "eq", field: "dine_in", value: false },
          ],
        },
        values,
      ),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { op: "not", of: { op: "present", field: "nope" } },
        values,
      ),
    ).toBe(true);
  });

  it("nests to arbitrary depth", () => {
    const p: Predicate = {
      op: "or",
      of: [
        {
          op: "and",
          of: [
            { op: "eq", field: "dine_in", value: true },
            {
              op: "or",
              of: [
                { op: "in", field: "schedule", values: ["H1"] },
                { op: "present", field: "nope" },
              ],
            },
          ],
        },
        { op: "eq", field: "schedule", value: "X" },
      ],
    };
    expect(evaluatePredicate(p, values)).toBe(true);
  });

  it("is vacuously true for an empty and, false for an empty or", () => {
    expect(evaluatePredicate({ op: "and", of: [] }, values)).toBe(true);
    expect(evaluatePredicate({ op: "or", of: [] }, values)).toBe(false);
  });

  it("does not mutate the record", () => {
    const record: Record<string, never> = {};
    evaluatePredicate({ op: "present", field: "x" }, record);
    expect(Object.keys(record)).toHaveLength(0);
  });
});
