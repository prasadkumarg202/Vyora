import { describe, expect, it } from "vitest";

import {
  FieldCoercionError,
  coerceRecord,
  coerceValue,
  emptyRecord,
  fieldsByKey,
  getField,
  resolveFields,
} from "./fields";
import type { BusinessTypeConfig, FieldDef, FieldType } from "./types";

function field(type: FieldType, extra: Partial<FieldDef> = {}): FieldDef {
  return { key: `${type}_field`, label: type, type, required: false, ...extra };
}

function config(): BusinessTypeConfig {
  return {
    businessType: "fixture",
    label: "Fixture",
    sector: "Test",
    letter: "Fx",
    hue: 200,
    fields: {
      required: [
        field("text", { key: "item_name", label: "Item name", required: true }),
        field("number", { key: "qty", label: "Qty", required: true }),
        field("currency", { key: "mrp", label: "MRP", required: true }),
      ],
      optional: [
        field("percent", { key: "gst", label: "GST" }),
        field("boolean", { key: "is_gift", label: "Gift wrap" }),
        field("auto", { key: "kot_no", label: "KOT No" }),
        field("date", { key: "expiry", label: "Expiry" }),
      ],
    },
    validations: [],
    gst: {
      defaultLabel: "12%",
      default: { kind: "fixed", bps: 1200 },
      slabs: [],
    },
    invoice: { template: "TAX INVOICE", columns: ["Item"], extras: [] },
    reports: [],
  };
}

describe("resolveFields", () => {
  it("puts required fields first, then optional, preserving design order", () => {
    expect(resolveFields(config()).map((f) => f.key)).toEqual([
      "item_name",
      "qty",
      "mrp",
      "gst",
      "is_gift",
      "kot_no",
      "expiry",
    ]);
  });
});

describe("getField", () => {
  it("finds fields in either group", () => {
    expect(getField(config(), "qty")?.label).toBe("Qty");
    expect(getField(config(), "gst")?.label).toBe("GST");
  });

  it("returns undefined for an unknown key", () => {
    expect(getField(config(), "nope")).toBeUndefined();
  });
});

describe("fieldsByKey", () => {
  it("indexes every field", () => {
    const index = fieldsByKey(config());
    expect(Object.keys(index)).toHaveLength(7);
    expect(index["mrp"]?.type).toBe("currency");
  });
});

describe("emptyRecord", () => {
  it("gives per-type initial values for a new form", () => {
    expect(emptyRecord(config())).toEqual({
      item_name: "",
      qty: null,
      mrp: null,
      gst: null,
      is_gift: false,
      kot_no: null,
      expiry: null,
    });
  });
});

describe("coerceValue", () => {
  it("returns the empty value for blank input", () => {
    expect(coerceValue(field("text"), "")).toBe("");
    expect(coerceValue(field("boolean"), undefined)).toBe(false);
    expect(coerceValue(field("number"), "   ")).toBeNull();
    expect(coerceValue(field("currency"), null)).toBeNull();
    expect(coerceValue(field("date"), "")).toBeNull();
  });

  it("trims text", () => {
    expect(coerceValue(field("text"), "  Paracetamol  ")).toBe("Paracetamol");
  });

  it("parses currency into paise integers", () => {
    expect(coerceValue(field("currency"), "7,500")).toBe(750000);
    expect(coerceValue(field("currency"), "12.5")).toBe(1250);
    expect(coerceValue(field("currency"), 99)).toBe(9900);
  });

  it("rejects unparseable currency as a FieldCoercionError naming the field", () => {
    try {
      coerceValue(field("currency", { key: "mrp", label: "MRP" }), "abc");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FieldCoercionError);
      expect((error as FieldCoercionError).field).toBe("mrp");
      expect((error as Error).message).toContain("MRP");
    }
  });

  it("parses percent into bps", () => {
    expect(coerceValue(field("percent"), "12")).toBe(1200);
    expect(coerceValue(field("percent"), "12.5%")).toBe(1250);
    expect(coerceValue(field("percent"), 0)).toBe(0);
    expect(coerceValue(field("percent"), 3)).toBe(300);
  });

  it.each([["-1"], ["101"], ["twelve"]])("rejects percent %s", (raw) => {
    expect(() => coerceValue(field("percent"), raw)).toThrow(
      FieldCoercionError,
    );
  });

  it("parses numbers", () => {
    expect(coerceValue(field("number"), "12")).toBe(12);
    expect(coerceValue(field("number"), "2.5")).toBe(2.5);
    expect(coerceValue(field("number"), -3)).toBe(-3);
  });

  it.each([["12abc"], ["1,2"], [Number.NaN], [Number.POSITIVE_INFINITY], [{}]])(
    "rejects number input %s",
    (raw) => {
      expect(() => coerceValue(field("number"), raw)).toThrow(
        FieldCoercionError,
      );
    },
  );

  it("normalizes dates to ISO", () => {
    expect(coerceValue(field("date"), "2026-03-31")).toBe("2026-03-31");
    expect(coerceValue(field("date"), "2026-03-31T10:00:00Z")).toBe(
      "2026-03-31",
    );
    expect(coerceValue(field("date"), new Date(2026, 2, 31))).toBe(
      "2026-03-31",
    );
  });

  it.each([["31-03-2026"], ["2026-02-30"], ["2026-13-01"], ["tomorrow"]])(
    "rejects date %s",
    (raw) => {
      expect(() => coerceValue(field("date"), raw)).toThrow(FieldCoercionError);
    },
  );

  it("rejects an invalid Date object", () => {
    expect(() => coerceValue(field("date"), new Date("nope"))).toThrow(
      FieldCoercionError,
    );
  });

  it("normalizes times to HH:MM", () => {
    expect(coerceValue(field("time"), "9:05")).toBe("09:05");
    expect(coerceValue(field("time"), "21:30:15")).toBe("21:30");
  });

  it.each([["25:00"], ["12:60"], ["noon"]])("rejects time %s", (raw) => {
    expect(() => coerceValue(field("time"), raw)).toThrow(FieldCoercionError);
  });

  it("coerces booleans from checkbox-shaped input", () => {
    expect(coerceValue(field("boolean"), true)).toBe(true);
    expect(coerceValue(field("boolean"), "on")).toBe(true);
    expect(coerceValue(field("boolean"), "false")).toBe(false);
    expect(coerceValue(field("boolean"), 1)).toBe(true);
    expect(coerceValue(field("boolean"), 0)).toBe(false);
  });

  it("rejects non-boolean input", () => {
    expect(() => coerceValue(field("boolean"), "maybe")).toThrow(
      FieldCoercionError,
    );
  });

  it("validates select values against the option list", () => {
    const schedule = field("select", {
      key: "schedule",
      label: "Schedule (H/H1/X)",
      options: [
        { value: "H", label: "H" },
        { value: "H1", label: "H1" },
        { value: "X", label: "X" },
      ],
    });
    expect(coerceValue(schedule, "H1")).toBe("H1");
    expect(() => coerceValue(schedule, "Z")).toThrow(/not one of: H, H1, X/);
  });

  it("accepts any value for a select with no option list", () => {
    expect(coerceValue(field("select"), "kg")).toBe("kg");
  });

  it("passes through file, scan and auto values as strings", () => {
    expect(coerceValue(field("file"), "rx/abc.png")).toBe("rx/abc.png");
    expect(
      coerceValue(field("scan", { scanKind: "imei" }), "353879100000001"),
    ).toBe("353879100000001");
    expect(coerceValue(field("auto"), "KOT-12")).toBe("KOT-12");
  });
});

describe("coerceRecord", () => {
  it("returns a complete canonical record", () => {
    expect(
      coerceRecord(config(), {
        item_name: " Rice ",
        qty: "2",
        mrp: "60",
        gst: "5",
      }),
    ).toEqual({
      item_name: "Rice",
      qty: 2,
      mrp: 6000,
      gst: 500,
      is_gift: false,
      kot_no: null,
      expiry: null,
    });
  });

  it("drops keys the config does not define", () => {
    const record = coerceRecord(config(), { item_name: "Rice", smuggled: "x" });
    expect("smuggled" in record).toBe(false);
  });

  it("throws on the first bad value", () => {
    expect(() => coerceRecord(config(), { qty: "many" })).toThrow(
      FieldCoercionError,
    );
  });
});
