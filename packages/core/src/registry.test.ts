import { describe, expect, it } from "vitest";

import {
  BusinessTypeConfigError,
  getBusinessType,
  listBusinessTypeSummaries,
  listBusinessTypes,
  parseBusinessTypeConfig,
  requireBusinessType,
} from "./registry";
import type { BusinessTypeConfig } from "./types";

/** Shaped like a config arriving from `business_types.config` (jsonb). */
function validRaw(): Record<string, unknown> {
  return {
    businessType: "kirana",
    label: "Kirana",
    sector: "Neighbourhood store",
    letter: "Kr",
    hue: 120,
    fields: {
      required: [
        { key: "item_name", label: "Item name", type: "text", required: true },
        { key: "qty", label: "Qty", type: "number", required: true },
        { key: "rate", label: "Rate", type: "currency", required: true },
      ],
      optional: [
        {
          key: "unit",
          label: "Unit",
          type: "select",
          required: false,
          options: [{ value: "kg", label: "kg" }],
        },
        { key: "gst", label: "GST", type: "percent", required: false },
      ],
    },
    validations: [
      {
        message: "Credit (khata) within customer limit",
        check: { kind: "note" },
      },
      {
        message: "Composition dealers omit tax breakup",
        check: { kind: "note" },
        when: { op: "present", field: "khata" },
      },
    ],
    gst: {
      defaultLabel: "Composition 1%",
      default: { kind: "fixed", bps: 100 },
      composition: { rateBps: 100 },
      slabs: [
        { applies: "Composition scheme", rate: { kind: "fixed", bps: 100 } },
        { applies: "Exempt goods", rate: { kind: "fixed", bps: 0 } },
      ],
    },
    invoice: {
      template: "BILL OF SUPPLY",
      columns: ["Item", "Qty", "Rate", "Amount"],
      extras: ["Khata balance", "Composition dealer"],
    },
    reports: ["Khata outstanding", "Daily sales", "Top customers"],
  };
}

/** Applies a patch to the valid config, `undefined` deleting the key. */
function rawWith(patch: Record<string, unknown>): Record<string, unknown> {
  const raw = { ...validRaw(), ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete raw[key];
  }
  return raw;
}

describe("getBusinessType", () => {
  it("returns the config for a known key", () => {
    expect(getBusinessType("pharmacy")?.businessType).toBe("pharmacy");
  });

  it("returns undefined for an unknown key", () => {
    expect(getBusinessType("bakery")).toBeUndefined();
  });
});

describe("requireBusinessType", () => {
  it("returns the config for a known key", () => {
    expect(requireBusinessType("kirana").label).toBe("Kirana");
  });

  it("throws an error naming the key", () => {
    expect(() => requireBusinessType("bakery")).toThrow(/bakery/);
  });

  it("does not fall back to the first business type", () => {
    const first = listBusinessTypes()[0];
    expect(first).toBeDefined();
    let returned: BusinessTypeConfig | undefined;
    try {
      returned = requireBusinessType("bakery");
    } catch {
      returned = undefined;
    }
    expect(returned).toBeUndefined();
    expect(returned).not.toBe(first);
  });

  it("throws for an empty key rather than resolving one", () => {
    expect(() => requireBusinessType("")).toThrow();
  });
});

describe("listBusinessTypes", () => {
  it("lists the seeded verticals with unique keys", () => {
    const all = listBusinessTypes();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((c) => c.businessType)).size).toBe(all.length);
  });
});

describe("listBusinessTypeSummaries", () => {
  it("returns exactly the tile fields, one per business type", () => {
    const summaries = listBusinessTypeSummaries();
    expect(summaries.length).toBe(listBusinessTypes().length);
    for (const summary of summaries) {
      expect(Object.keys(summary).sort()).toEqual([
        "businessType",
        "hue",
        "label",
        "letter",
        "sector",
      ]);
    }
  });

  it("mirrors the underlying configs", () => {
    const pharmacy = requireBusinessType("pharmacy");
    const summary = listBusinessTypeSummaries().find(
      (s) => s.businessType === "pharmacy",
    );
    expect(summary).toEqual({
      businessType: pharmacy.businessType,
      label: pharmacy.label,
      sector: pharmacy.sector,
      letter: pharmacy.letter,
      hue: pharmacy.hue,
    });
  });
});

describe("parseBusinessTypeConfig", () => {
  it("accepts every seeded config unchanged", () => {
    for (const config of listBusinessTypes()) {
      expect(parseBusinessTypeConfig(config)).toEqual(config);
    }
  });

  it("accepts a config round-tripped through JSON, as the DB delivers it", () => {
    const raw = JSON.parse(JSON.stringify(validRaw())) as unknown;
    expect(parseBusinessTypeConfig(raw).businessType).toBe("kirana");
  });

  it("drops keys the contract does not define", () => {
    const parsed = parseBusinessTypeConfig(
      rawWith({ __proto_hack: "x", extra: 1 }),
    );
    expect("extra" in parsed).toBe(false);
  });

  it("throws BusinessTypeConfigError carrying the offending path", () => {
    try {
      parseBusinessTypeConfig(rawWith({ hue: "blue" }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessTypeConfigError);
      expect((error as BusinessTypeConfigError).path).toBe("config.hue");
    }
  });

  it.each([
    ["not an object", null],
    ["an array", []],
    ["a string", "kirana"],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseBusinessTypeConfig(raw)).toThrow(BusinessTypeConfigError);
  });

  it.each([
    ["missing businessType", rawWith({ businessType: undefined })],
    ["empty businessType", rawWith({ businessType: "   " })],
    ["missing label", rawWith({ label: undefined })],
    ["missing sector", rawWith({ sector: undefined })],
    ["missing letter", rawWith({ letter: undefined })],
    ["missing hue", rawWith({ hue: undefined })],
    ["hue as a string", rawWith({ hue: "120" })],
    ["hue out of range", rawWith({ hue: 400 })],
    ["missing fields", rawWith({ fields: undefined })],
    [
      "fields.required not an array",
      rawWith({ fields: { required: {}, optional: [] } }),
    ],
    ["missing fields.optional", rawWith({ fields: { required: [] } })],
    ["missing validations", rawWith({ validations: undefined })],
    ["validations not an array", rawWith({ validations: "none" })],
    ["missing gst", rawWith({ gst: undefined })],
    ["missing invoice", rawWith({ invoice: undefined })],
    ["reports not an array of strings", rawWith({ reports: ["ok", 7] })],
  ])("rejects a config with %s", (_label, raw) => {
    expect(() => parseBusinessTypeConfig(raw)).toThrow(BusinessTypeConfigError);
  });

  it.each([
    [
      "a bad type enum",
      { key: "k", label: "K", type: "colour", required: true },
    ],
    ["a missing type", { key: "k", label: "K", required: true }],
    ["a missing key", { label: "K", type: "text", required: true }],
    ["an empty key", { key: "", label: "K", type: "text", required: true }],
    ["a missing label", { key: "k", type: "text", required: true }],
    [
      "required as a string",
      { key: "k", label: "K", type: "text", required: "yes" },
    ],
    [
      "options as a string",
      { key: "k", label: "K", type: "select", required: true, options: "a" },
    ],
    [
      "a malformed option",
      {
        key: "k",
        label: "K",
        type: "select",
        required: true,
        options: [{ value: "a" }],
      },
    ],
    [
      "a bad scanKind",
      { key: "k", label: "K", type: "scan", required: true, scanKind: "qr" },
    ],
  ])("rejects a field def with %s", (_label, field) => {
    expect(() =>
      parseBusinessTypeConfig(
        rawWith({ fields: { required: [field], optional: [] } }),
      ),
    ).toThrow(BusinessTypeConfigError);
  });

  it("rejects duplicate field keys across required and optional", () => {
    const raw = rawWith({
      fields: {
        required: [
          { key: "qty", label: "Qty", type: "number", required: true },
        ],
        optional: [
          { key: "qty", label: "Quantity", type: "text", required: false },
        ],
      },
    });
    expect(() => parseBusinessTypeConfig(raw)).toThrow(/duplicate field key/);
  });

  it.each([
    ["an unknown check kind", { message: "m", check: { kind: "vibes" } }],
    ["a missing message", { check: { kind: "note" } }],
    ["a missing check", { message: "m" }],
    [
      "a length check without exact",
      { message: "m", check: { kind: "length", field: "imei" } },
    ],
    [
      "a non-integer length",
      { message: "m", check: { kind: "length", field: "imei", exact: 15.5 } },
    ],
    [
      "an unknown predicate op",
      {
        message: "m",
        check: {
          kind: "required_when",
          field: "batch",
          when: { op: "matches" },
        },
      },
    ],
    [
      "a required_when without a predicate",
      { message: "m", check: { kind: "required_when", field: "batch" } },
    ],
    [
      "a malformed when predicate",
      { message: "m", check: { kind: "note" }, when: { op: "and" } },
    ],
  ])("rejects a validation rule with %s", (_label, rule) => {
    expect(() =>
      parseBusinessTypeConfig(rawWith({ validations: [rule] })),
    ).toThrow(BusinessTypeConfigError);
  });

  it("accepts nested and/or/not predicates", () => {
    const raw = rawWith({
      validations: [
        {
          message: "Batch No mandatory for scheduled drugs",
          check: {
            kind: "required_when",
            field: "batch_no",
            when: {
              op: "and",
              of: [
                { op: "in", field: "schedule", values: ["H", "H1", "X"] },
                { op: "not", of: { op: "eq", field: "otc", value: true } },
              ],
            },
          },
        },
      ],
    });
    expect(parseBusinessTypeConfig(raw).validations).toHaveLength(1);
  });

  it.each([
    [
      "an unknown rate kind",
      { defaultLabel: "x", default: { kind: "flat" }, slabs: [] },
    ],
    [
      "fixed without bps",
      { defaultLabel: "x", default: { kind: "fixed" }, slabs: [] },
    ],
    [
      "a non-integer bps",
      { defaultLabel: "x", default: { kind: "fixed", bps: 12.5 }, slabs: [] },
    ],
    [
      "a range whose bps sits outside the span",
      {
        defaultLabel: "x",
        default: { kind: "range", minBps: 0, maxBps: 500, bps: 1200 },
        slabs: [],
      },
    ],
    [
      "an inverted range",
      {
        defaultLabel: "x",
        default: { kind: "range", minBps: 500, maxBps: 0, bps: 0 },
        slabs: [],
      },
    ],
    ["slabs missing", { defaultLabel: "x", default: { kind: "hsn" } }],
    [
      "a slab without applies",
      {
        defaultLabel: "x",
        default: { kind: "hsn" },
        slabs: [{ rate: { kind: "hsn" } }],
      },
    ],
    [
      "composition without rateBps",
      {
        defaultLabel: "x",
        default: { kind: "hsn" },
        slabs: [],
        composition: {},
      },
    ],
  ])("rejects a gst config with %s", (_label, gst) => {
    expect(() => parseBusinessTypeConfig(rawWith({ gst }))).toThrow(
      BusinessTypeConfigError,
    );
  });

  it.each([
    ["a missing template", { columns: ["Item"], extras: [] }],
    [
      "columns as a string",
      { template: "TAX INVOICE", columns: "Item", extras: [] },
    ],
    [
      "non-string extras",
      { template: "TAX INVOICE", columns: ["Item"], extras: [1] },
    ],
  ])("rejects an invoice config with %s", (_label, invoice) => {
    expect(() => parseBusinessTypeConfig(rawWith({ invoice }))).toThrow(
      BusinessTypeConfigError,
    );
  });
});
