import { describe, expect, it, vi } from "vitest";

import type {
  BusinessTypeConfig,
  FieldDef,
  JsonValue,
  ValidationRule,
} from "../types";
import {
  isValidGstin,
  validateRecord,
  validateRequired,
  type SkippedRule,
} from "./evaluate";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(
  validations: ValidationRule[],
  required: FieldDef[] = [],
): BusinessTypeConfig {
  return {
    businessType: "test",
    label: "Test",
    sector: "Test",
    letter: "T",
    hue: 0,
    fields: { required, optional: [] },
    validations,
    gst: {
      defaultLabel: "—",
      default: { kind: "none" },
      slabs: [],
    },
    invoice: { template: "TAX INVOICE", columns: [], extras: [] },
    reports: [],
  };
}

function run(
  validations: ValidationRule[],
  values: Record<string, JsonValue>,
  opts?: Parameters<typeof validateRecord>[2],
) {
  return validateRecord(makeConfig(validations), values, opts);
}

const TODAY = { today: "2026-07-17" };

// ---------------------------------------------------------------------------
// date_after
// ---------------------------------------------------------------------------

describe("date_after", () => {
  const expiry: ValidationRule[] = [
    {
      message: "Expiry date must be after today",
      check: { kind: "date_after", field: "expiry", than: "$today" },
    },
  ];

  it("passes when the date is after today", () => {
    expect(run(expiry, { expiry: "2026-07-18" }, TODAY)).toEqual([]);
  });

  it("fails when the date equals today", () => {
    expect(run(expiry, { expiry: "2026-07-17" }, TODAY)).toEqual([
      { field: "expiry", message: "Expiry date must be after today" },
    ]);
  });

  it("fails when the date is before today", () => {
    expect(run(expiry, { expiry: "2026-07-16" }, TODAY)).toHaveLength(1);
  });

  it("accepts today when orEqual is set", () => {
    const rules: ValidationRule[] = [
      {
        message: "Delivery date must be on or after order date",
        check: {
          kind: "date_after",
          field: "delivery",
          than: "order",
          orEqual: true,
        },
      },
    ];
    expect(run(rules, { delivery: "2026-07-17", order: "2026-07-17" })).toEqual(
      [],
    );
    expect(
      run(rules, { delivery: "2026-07-16", order: "2026-07-17" }),
    ).toHaveLength(1);
  });

  it("compares another field, not just $today", () => {
    const rules: ValidationRule[] = [
      {
        message: "Check-out must be after check-in",
        check: { kind: "date_after", field: "check_out", than: "check_in" },
      },
    ];
    expect(
      run(rules, { check_out: "2026-07-18", check_in: "2026-07-17" }),
    ).toEqual([]);
    expect(
      run(rules, { check_out: "2026-07-17", check_in: "2026-07-17" }),
    ).toHaveLength(1);
  });

  it("compares by calendar day, ignoring any time component", () => {
    // A timestamp-based comparison would make 23:59 vs 00:00 flip the verdict.
    expect(
      run(expiry, { expiry: "2026-07-17T23:59:59.999Z" }, TODAY),
    ).toHaveLength(1);
    expect(run(expiry, { expiry: "2026-07-18T00:00:00.000Z" }, TODAY)).toEqual(
      [],
    );
  });

  it("is timezone-independent", () => {
    // Kiritimati (+14) and Midway (-11) straddle the date line: a Date-based
    // comparison of "2026-07-17" against today would flip verdicts between
    // them. Nothing in the engine constructs a Date on this path, so all three
    // zones must agree.
    const zones = ["Pacific/Kiritimati", "UTC", "Pacific/Midway"];
    const verdicts = zones.map((tz) => {
      vi.stubEnv("TZ", tz);
      return [
        run(expiry, { expiry: "2026-07-17" }, TODAY).length,
        run(expiry, { expiry: "2026-07-18" }, TODAY).length,
      ];
    });
    vi.unstubAllEnvs();
    expect(verdicts).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
  });

  it("is independent of the wall clock when today is supplied", () => {
    vi.useFakeTimers();
    const verdicts = [
      "2026-07-17T00:00:00.000Z",
      "2026-07-17T23:59:59.999Z",
      "2030-01-01T12:00:00.000Z",
    ].map((instant) => {
      vi.setSystemTime(new Date(instant));
      return run(expiry, { expiry: "2026-07-18" }, TODAY).length;
    });
    vi.useRealTimers();
    expect(verdicts).toEqual([0, 0, 0]);
  });

  it("defaults today to the host calendar day", () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const yesterday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate(),
    )}`;
    expect(run(expiry, { expiry: yesterday })).toHaveLength(1);
    expect(run(expiry, { expiry: "2999-01-01" })).toEqual([]);
  });

  it("skips when the field is absent, empty or not a date", () => {
    expect(run(expiry, {}, TODAY)).toEqual([]);
    expect(run(expiry, { expiry: null }, TODAY)).toEqual([]);
    expect(run(expiry, { expiry: "" }, TODAY)).toEqual([]);
    expect(run(expiry, { expiry: "not-a-date" }, TODAY)).toEqual([]);
    expect(run(expiry, { expiry: 20260718 }, TODAY)).toEqual([]);
  });

  it("skips when the comparison field is absent", () => {
    const rules: ValidationRule[] = [
      {
        message: "Check-out must be after check-in",
        check: { kind: "date_after", field: "check_out", than: "check_in" },
      },
    ];
    expect(run(rules, { check_out: "2026-07-18" })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// lte_field
// ---------------------------------------------------------------------------

describe("lte_field", () => {
  const rules: ValidationRule[] = [
    {
      message: "Selling price cannot exceed MRP",
      check: { kind: "lte_field", field: "price", than: "mrp" },
    },
  ];

  it("passes below and at the bound", () => {
    expect(run(rules, { price: 90, mrp: 100 })).toEqual([]);
    expect(run(rules, { price: 100, mrp: 100 })).toEqual([]);
  });

  it("fails above the bound", () => {
    expect(run(rules, { price: 101, mrp: 100 })).toEqual([
      { field: "price", message: "Selling price cannot exceed MRP" },
    ]);
  });

  it("coerces numeric strings from form inputs", () => {
    expect(run(rules, { price: "101", mrp: "100" })).toHaveLength(1);
    expect(run(rules, { price: "99.5", mrp: "100" })).toEqual([]);
  });

  it("skips absent, non-numeric and non-finite values rather than throwing", () => {
    expect(run(rules, {})).toEqual([]);
    expect(run(rules, { price: 101 })).toEqual([]);
    expect(run(rules, { price: "abc", mrp: 100 })).toEqual([]);
    expect(run(rules, { price: true, mrp: 100 })).toEqual([]);
    expect(run(rules, { price: 101, mrp: null })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// gt
// ---------------------------------------------------------------------------

describe("gt", () => {
  const rules: ValidationRule[] = [
    {
      message: "Pax must be greater than 0",
      check: { kind: "gt", field: "pax", value: 0 },
    },
  ];

  it("passes strictly above the bound", () => {
    expect(run(rules, { pax: 1 })).toEqual([]);
  });

  it("fails at and below the bound", () => {
    expect(run(rules, { pax: 0 })).toEqual([
      { field: "pax", message: "Pax must be greater than 0" },
    ]);
    expect(run(rules, { pax: -1 })).toHaveLength(1);
  });

  it("coerces numeric strings and skips absent values", () => {
    expect(run(rules, { pax: "0" })).toHaveLength(1);
    expect(run(rules, { pax: "2" })).toEqual([]);
    expect(run(rules, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// length
// ---------------------------------------------------------------------------

describe("length", () => {
  const imei: ValidationRule[] = [
    {
      message: "IMEI must be 15 digits",
      check: { kind: "length", field: "imei", exact: 15, charset: "digits" },
    },
  ];

  it("passes an exact 15-digit IMEI", () => {
    expect(run(imei, { imei: "123456789012345" })).toEqual([]);
  });

  it("fails 14 digits", () => {
    expect(run(imei, { imei: "12345678901234" })).toEqual([
      { field: "imei", message: "IMEI must be 15 digits" },
    ]);
  });

  it("fails 16 digits", () => {
    expect(run(imei, { imei: "1234567890123456" })).toHaveLength(1);
  });

  it("fails 15 non-digit characters", () => {
    expect(run(imei, { imei: "12345678901234X" })).toHaveLength(1);
    expect(run(imei, { imei: "1234567890 2345" })).toHaveLength(1);
  });

  it("checks HUID as 6 chars with no charset restriction", () => {
    const huid: ValidationRule[] = [
      {
        message: "HUID must be 6 characters",
        check: { kind: "length", field: "huid", exact: 6 },
      },
    ];
    expect(run(huid, { huid: "AZ4123" })).toEqual([]);
    expect(run(huid, { huid: "123456" })).toEqual([]);
    expect(run(huid, { huid: "AZ412" })).toHaveLength(1);
  });

  it("skips absent values and non-strings", () => {
    expect(run(imei, {})).toEqual([]);
    expect(run(imei, { imei: "" })).toEqual([]);
    expect(run(imei, { imei: null })).toEqual([]);
    // Coercing a number would already have dropped any leading zero.
    expect(run(imei, { imei: 123456789012345 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// gstin
// ---------------------------------------------------------------------------

describe("gstin", () => {
  const rules: ValidationRule[] = [
    {
      message: "GSTIN must be valid (15 chars)",
      check: { kind: "gstin", field: "gstin" },
    },
  ];

  it("accepts real GSTINs whose checksum resolves", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("24AAACC1206D1ZM")).toBe(true);
    expect(run(rules, { gstin: "27AAPFU0939F1ZV" })).toEqual([]);
  });

  it("rejects a wrong checksum character", () => {
    expect(isValidGstin("27AAPFU0939F1ZA")).toBe(false);
    expect(run(rules, { gstin: "27AAPFU0939F1ZA" })).toEqual([
      { field: "gstin", message: "GSTIN must be valid (15 chars)" },
    ]);
  });

  it("rejects wrong lengths", () => {
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1ZVV")).toBe(false);
    expect(isValidGstin("")).toBe(false);
  });

  it("rejects structurally wrong 15-char strings", () => {
    // Lowercase, letters in the state code, PAN shape violated, and a non-'Z'
    // at position 14 — each independently disqualifying.
    expect(isValidGstin("27aapfu0939f1zv")).toBe(false);
    expect(isValidGstin("AAAAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("271APFU0939F1ZV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1YV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F0ZV")).toBe(false);
  });

  /**
   * The design's sample `29ABCDE1234F1Z5` is a fabricated placeholder: it is
   * well-formed but its check character should be 'W'. Pinned here so the
   * conflict between the design string and the GST standard stays visible
   * rather than quietly weakening the checksum.
   */
  it("rejects the design's placeholder sample and accepts its corrected form", () => {
    expect(isValidGstin("29ABCDE1234F1Z5")).toBe(false);
    expect(isValidGstin("29ABCDE1234F1ZW")).toBe(true);
  });

  it("tolerates surrounding whitespace but skips absent values", () => {
    expect(run(rules, { gstin: " 27AAPFU0939F1ZV " })).toEqual([]);
    expect(run(rules, {})).toEqual([]);
    expect(run(rules, { gstin: "" })).toEqual([]);
    expect(run(rules, { gstin: 29 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// unique
// ---------------------------------------------------------------------------

describe("unique", () => {
  const rules: ValidationRule[] = [
    {
      message: "Barcode must be unique",
      check: { kind: "unique", fields: ["barcode"] },
    },
  ];

  it("skips when no lookup is supplied, and reports the skip", () => {
    const onSkip = vi.fn();
    expect(run(rules, { barcode: "abc" }, { onSkip })).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith(
      expect.objectContaining({ index: 0, reason: "no-unique-lookup" }),
    );
  });

  it("passes when the lookup says unique", () => {
    expect(run(rules, { barcode: "abc" }, { isUnique: () => true })).toEqual(
      [],
    );
  });

  it("fails when the lookup says duplicate", () => {
    expect(run(rules, { barcode: "abc" }, { isUnique: () => false })).toEqual([
      { field: "barcode", message: "Barcode must be unique" },
    ]);
  });

  it("passes the fields and their values to the lookup", () => {
    const isUnique = vi.fn().mockReturnValue(true);
    run(rules, { barcode: "abc" }, { isUnique });
    expect(isUnique).toHaveBeenCalledWith(["barcode"], ["abc"]);
  });

  it("reports a composite key at record level and nulls absent members", () => {
    const composite: ValidationRule[] = [
      {
        message: "SKU must be unique per size + colour",
        check: { kind: "unique", fields: ["sku", "size", "colour"] },
      },
    ];
    const isUnique = vi.fn().mockReturnValue(false);
    expect(run(composite, { sku: "S1", size: "M" }, { isUnique })).toEqual([
      { field: null, message: "SKU must be unique per size + colour" },
    ]);
    expect(isUnique).toHaveBeenCalledWith(
      ["sku", "size", "colour"],
      ["S1", "M", null],
    );
  });

  it("skips when every key field is absent", () => {
    const isUnique = vi.fn().mockReturnValue(false);
    expect(run(rules, {}, { isUnique })).toEqual([]);
    expect(isUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// required_when
// ---------------------------------------------------------------------------

describe("required_when", () => {
  const rules: ValidationRule[] = [
    {
      message: "Batch No is mandatory for scheduled drugs",
      check: {
        kind: "required_when",
        field: "batch_no",
        when: { op: "in", field: "schedule", values: ["H", "H1", "X"] },
      },
    },
  ];

  it("fails when the predicate matches and the field is absent", () => {
    expect(run(rules, { schedule: "H1" })).toEqual([
      {
        field: "batch_no",
        message: "Batch No is mandatory for scheduled drugs",
      },
    ]);
    expect(run(rules, { schedule: "H1", batch_no: "" })).toHaveLength(1);
    expect(run(rules, { schedule: "H1", batch_no: null })).toHaveLength(1);
  });

  it("passes when the predicate matches and the field is present", () => {
    expect(run(rules, { schedule: "H1", batch_no: "B-77" })).toEqual([]);
  });

  it("passes when the predicate does not match", () => {
    expect(run(rules, { schedule: "OTC" })).toEqual([]);
    expect(run(rules, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// note
// ---------------------------------------------------------------------------

describe("note", () => {
  it("never fails and is reported as skipped", () => {
    const onSkip = vi.fn();
    const rules: ValidationRule[] = [
      {
        message: "Warranty auto-calculated from invoice date",
        check: { kind: "note" },
      },
    ];
    expect(run(rules, {}, { onSkip })).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "note" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Rule-level `when` gating
// ---------------------------------------------------------------------------

describe("rule-level when", () => {
  const rules: ValidationRule[] = [
    {
      message: "GSTIN must be valid (15 chars)",
      check: { kind: "gstin", field: "gstin" },
      when: { op: "eq", field: "scheme", value: "regular" },
    },
  ];

  it("runs the check when the predicate matches", () => {
    expect(run(rules, { scheme: "regular", gstin: "bogus" })).toHaveLength(1);
  });

  it("skips the whole rule when the predicate does not match", () => {
    const onSkip = vi.fn();
    expect(
      run(rules, { scheme: "composition", gstin: "bogus" }, { onSkip }),
    ).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "when-not-met" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Engine-level behaviour
// ---------------------------------------------------------------------------

describe("validateRecord", () => {
  it("returns issues in config order", () => {
    const rules: ValidationRule[] = [
      { message: "first", check: { kind: "gt", field: "a", value: 0 } },
      { message: "note", check: { kind: "note" } },
      { message: "second", check: { kind: "gt", field: "b", value: 0 } },
      { message: "third", check: { kind: "gt", field: "c", value: 0 } },
    ];
    expect(run(rules, { a: 0, b: 0, c: 0 }).map((i) => i.message)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("uses the rule message verbatim", () => {
    const message = "Selling price ≤ MRP — cannot exceed";
    expect(
      run([{ message, check: { kind: "gt", field: "a", value: 0 } }], { a: 0 }),
    ).toEqual([{ field: "a", message }]);
  });

  it("returns no issues for an empty record", () => {
    const rules: ValidationRule[] = [
      {
        message: "Expiry date must be after today",
        check: { kind: "date_after", field: "expiry", than: "$today" },
      },
      {
        message: "Pax must be greater than 0",
        check: { kind: "gt", field: "pax", value: 0 },
      },
      {
        message: "IMEI must be 15 digits",
        check: { kind: "length", field: "imei", exact: 15 },
      },
      {
        message: "GSTIN must be valid (15 chars)",
        check: { kind: "gstin", field: "gstin" },
      },
    ];
    expect(run(rules, {}, TODAY)).toEqual([]);
  });

  it("reports every skipped rule with its index", () => {
    const skipped: SkippedRule[] = [];
    const rules: ValidationRule[] = [
      { message: "a", check: { kind: "note" } },
      { message: "b", check: { kind: "unique", fields: ["x"] } },
      { message: "c", check: { kind: "gt", field: "missing", value: 0 } },
    ];
    run(rules, { x: "1" }, { onSkip: (s) => skipped.push(s) });
    expect(skipped.map((s) => [s.index, s.reason])).toEqual([
      [0, "note"],
      [1, "no-unique-lookup"],
      [2, "absent-value"],
    ]);
  });

  it("works with no options at all", () => {
    expect(() => validateRecord(makeConfig([]), {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateRequired
// ---------------------------------------------------------------------------

describe("validateRequired", () => {
  const fields: FieldDef[] = [
    { key: "item_name", label: "Item Name", type: "text", required: true },
    { key: "mrp", label: "MRP (₹)", type: "currency", required: true },
  ];

  it("reports each absent required field with its label", () => {
    expect(validateRequired(makeConfig([], fields), {})).toEqual([
      { field: "item_name", message: "Item Name is required" },
      { field: "mrp", message: "MRP (₹) is required" },
    ]);
  });

  it("treats null and empty string as absent", () => {
    expect(
      validateRequired(makeConfig([], fields), { item_name: "", mrp: null }),
    ).toHaveLength(2);
  });

  it("accepts present values, including falsy non-absent ones", () => {
    expect(
      validateRequired(makeConfig([], fields), { item_name: "Crocin", mrp: 0 }),
    ).toEqual([]);
    const boolField: FieldDef[] = [
      {
        key: "gst_reg",
        label: "GST Registered",
        type: "boolean",
        required: true,
      },
    ];
    expect(
      validateRequired(makeConfig([], boolField), { gst_reg: false }),
    ).toEqual([]);
  });

  it("ignores optional fields", () => {
    const config = makeConfig([], []);
    config.fields.optional = [
      { key: "hsn", label: "HSN", type: "text", required: false },
    ];
    expect(validateRequired(config, {})).toEqual([]);
  });
});
