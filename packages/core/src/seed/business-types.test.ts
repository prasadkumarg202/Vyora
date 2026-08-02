import { describe, expect, it } from "vitest";

import type { BusinessTypeConfig, FieldDef } from "../types.js";
import { parseRate } from "../gst/rate.js";
import { BUSINESS_TYPES } from "./business-types.js";
import rawJson from "./business-types.raw.json";

interface RawField {
  l: string;
  t: string;
}

interface RawEntry {
  id: string;
  name: string;
  letter: string;
  hue: number;
  sector: string;
  required: RawField[];
  optional: RawField[];
  validations: string[];
  gstDefault: string;
  gst: { l: string; r: string }[];
  invTitle: string;
  invCols: string[];
  invExtras: string[];
  reports: string[];
}

const RAW = rawJson as RawEntry[];

const rawById = new Map(RAW.map((entry) => [entry.id, entry]));

const allFields = (config: BusinessTypeConfig): FieldDef[] => [
  ...config.fields.required,
  ...config.fields.optional,
];

const raw = (config: BusinessTypeConfig): RawEntry => {
  const entry = rawById.get(config.businessType);
  if (!entry) throw new Error(`no raw entry for ${config.businessType}`);
  return entry;
};

const byId = (id: string): BusinessTypeConfig => {
  const config = BUSINESS_TYPES.find((b) => b.businessType === id);
  if (!config) throw new Error(`no config for ${id}`);
  return config;
};

describe("BUSINESS_TYPES", () => {
  it("covers exactly the 18 verticals the raw design data defines", () => {
    expect(BUSINESS_TYPES).toHaveLength(18);
    expect(RAW).toHaveLength(18);
    expect(BUSINESS_TYPES.map((b) => b.businessType)).toEqual(
      RAW.map((entry) => entry.id),
    );
  });

  it("has unique ids", () => {
    const ids = BUSINESS_TYPES.map((b) => b.businessType);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(
  BUSINESS_TYPES.map((config) => [config.businessType, config] as const),
)("%s", (_id, config) => {
  it("carries the design's display identity verbatim", () => {
    const entry = raw(config);
    expect(config.label).toBe(entry.name);
    expect(config.sector).toBe(entry.sector);
    expect(config.letter).toBe(entry.letter);
    expect(config.hue).toBe(entry.hue);
  });

  it("keeps every field label and type, in order", () => {
    const entry = raw(config);
    expect(
      config.fields.required.map((f) => ({ l: f.label, t: f.type })),
    ).toEqual(entry.required);
    expect(
      config.fields.optional.map((f) => ({ l: f.label, t: f.type })),
    ).toEqual(entry.optional);
    expect(config.fields.required.every((f) => f.required)).toBe(true);
    expect(config.fields.optional.every((f) => !f.required)).toBe(true);
  });

  it("gives every field a unique snake_case key", () => {
    const keys = allFields(config).map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys)
      expect(key).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  });

  it("gives every select non-empty options with unique values", () => {
    for (const field of allFields(config).filter((f) => f.type === "select")) {
      expect(field.options, `${field.key} options`).toBeDefined();
      expect(field.options?.length, `${field.key} options`).toBeGreaterThan(0);
      const values = field.options?.map((o) => o.value) ?? [];
      expect(new Set(values).size).toBe(values.length);
      expect(values.every((v) => v.length > 0)).toBe(true);
    }
  });

  it("gives every scan field a scanKind, and nothing else one", () => {
    for (const field of allFields(config)) {
      if (field.type === "scan")
        expect(field.scanKind, `${field.key}`).toBeDefined();
      else expect(field.scanKind, `${field.key}`).toBeUndefined();
    }
  });

  // The fidelity guard: the prose is the spec of record. Every rule the engine
  // holds must show the user the exact string the design wrote.
  it("shows only verbatim design prose as validation messages", () => {
    const entry = raw(config);
    for (const rule of config.validations) {
      expect(entry.validations).toContain(rule.message);
    }
  });

  it("carries every design validation, none dropped", () => {
    const entry = raw(config);
    const messages = new Set(config.validations.map((r) => r.message));
    for (const message of entry.validations)
      expect(messages).toContain(message);
  });

  it("points every check at a real field key or a documented pseudo-field", () => {
    const known = new Set(allFields(config).map((f) => f.key));
    const pseudo = new Set([
      "$today",
      "$qty",
      "$unit_price_paise",
      "$line_total_paise",
      "$available_stock",
    ]);
    // `rate` is the engine's selling price on verticals whose design form has
    // no explicit selling-price field (pharmacy, medical).
    const engineSupplied = new Set(["rate", "tariff"]);
    const resolves = (field: string) =>
      known.has(field) || pseudo.has(field) || engineSupplied.has(field);

    for (const rule of config.validations) {
      const check = rule.check;
      switch (check.kind) {
        case "date_after":
          expect(resolves(check.field), check.field).toBe(true);
          expect(resolves(check.than), check.than).toBe(true);
          break;
        case "lte_field":
          expect(resolves(check.field), check.field).toBe(true);
          expect(resolves(check.than), check.than).toBe(true);
          break;
        case "gt":
        case "length":
        case "gstin":
        case "required_when":
          expect(resolves(check.field), check.field).toBe(true);
          break;
        case "unique":
          expect(check.fields.length).toBeGreaterThan(0);
          for (const field of check.fields)
            expect(resolves(field), field).toBe(true);
          break;
        case "note":
          break;
      }
    }
  });

  it("keeps the GST default label and every slab's applies verbatim", () => {
    const entry = raw(config);
    expect(config.gst.defaultLabel).toBe(entry.gstDefault);
    expect(config.gst.slabs.map((s) => s.applies)).toEqual(
      entry.gst.map((slab) => slab.l),
    );
  });

  it("keeps the invoice and reports verbatim", () => {
    const entry = raw(config);
    expect(config.invoice.template).toBe(entry.invTitle);
    expect(config.invoice.columns).toEqual(entry.invCols);
    expect(config.invoice.extras).toEqual(entry.invExtras);
    expect(config.reports).toEqual(entry.reports);
  });

  it("expresses every rate in basis points within 0–28%", () => {
    const rates = [config.gst.default, ...config.gst.slabs.map((s) => s.rate)];
    for (const rate of rates) {
      if (rate.kind === "fixed") {
        expect(rate.bps).toBeGreaterThanOrEqual(0);
        expect(rate.bps).toBeLessThanOrEqual(2800);
      }
      if (rate.kind === "range") {
        expect(rate.minBps).toBeLessThan(rate.maxBps);
        expect(rate.bps).toBeGreaterThanOrEqual(rate.minBps);
        expect(rate.bps).toBeLessThanOrEqual(rate.maxBps);
      }
    }
  });
});

describe("the design's awkward corners", () => {
  it("prices apparel and room tariffs against paise thresholds", () => {
    const garments = byId("garments");
    expect(garments.gst.slabs.map((s) => s.when)).toEqual([
      { op: "lt", field: "$unit_price_paise", value: 100000 },
      { op: "gte", field: "$unit_price_paise", value: 100000 },
    ]);

    const hotel = byId("hotel");
    expect(hotel.gst.slabs[0]?.when).toEqual({
      op: "lt",
      field: "$unit_price_paise",
      value: 750000,
    });
    expect(hotel.gst.slabs[1]?.when).toEqual({
      op: "gte",
      field: "$unit_price_paise",
      value: 750000,
    });
    // "Restaurant within hotel" states no threshold, so it gets no predicate.
    expect(hotel.gst.slabs[2]?.when).toBeUndefined();
  });

  it("makes Kirana a composition dealer at 1%", () => {
    const kirana = byId("kirana");
    expect(kirana.gst.defaultLabel).toBe("Composition 1%");
    expect(kirana.gst.composition).toEqual({ rateBps: 100 });
    expect(kirana.gst.default).toEqual({ kind: "fixed", bps: 100 });
  });

  it("leaves composition off every other vertical", () => {
    for (const config of BUSINESS_TYPES) {
      if (config.businessType === "kirana") continue;
      expect(config.gst.composition, config.businessType).toBeUndefined();
    }
  });

  it("defaults Furniture to 18%, not to its first (12%) slab", () => {
    const furniture = byId("furniture");
    expect(furniture.gst.default).toEqual({ kind: "fixed", bps: 1800 });
    expect(furniture.gst.slabs[0]?.rate).toEqual({ kind: "fixed", bps: 1200 });
  });

  it("blocks ITC on the standard restaurant slab only", () => {
    const restaurant = byId("restaurant");
    const standard = restaurant.gst.slabs.find(
      (s) => s.applies === "Standard restaurant",
    );
    expect(standard?.itcBlocked).toBe(true);
    expect(standard?.rate).toEqual({ kind: "fixed", bps: 500 });
    expect(
      restaurant.gst.slabs.find((s) => s.applies.includes("AC / hotel"))
        ?.itcBlocked,
    ).toBeUndefined();
  });

  it("resolves the HSN-driven verticals from the item, not the vertical", () => {
    for (const id of ["wholesale", "retail", "distributor"]) {
      expect(byId(id).gst.default, id).toEqual({ kind: "hsn" });
    }
    expect(byId("wholesale").gst.slabs[1]?.rate).toEqual({ kind: "igst" });
    expect(byId("distributor").gst.slabs[1]?.rate).toEqual({ kind: "none" });
  });

  it("splits the IMEI prose into its two constraints under one message", () => {
    const rules = byId("mobile").validations.filter(
      (r) => r.message === "IMEI must be 15 digits and unique",
    );
    expect(rules.map((r) => r.check)).toEqual([
      { kind: "length", field: "imei", exact: 15, charset: "digits" },
      { kind: "unique", fields: ["imei"] },
    ]);
  });

  it("scans barcodes as barcodes and IMEIs as IMEIs", () => {
    expect(
      byId("mobile").fields.required.find((f) => f.key === "imei")?.scanKind,
    ).toBe("imei");
    for (const id of ["grocery", "hardware", "retail"]) {
      expect(
        byId(id).fields.optional.find((f) => f.key === "barcode")?.scanKind,
      ).toBe("barcode");
    }
  });

  it("units the weights the design put in the label", () => {
    const jewellery = byId("jewellery");
    expect(
      jewellery.fields.required.find((f) => f.key === "gross_wt"),
    ).toMatchObject({
      label: "Gross wt (g)",
      unit: "g",
    });
    expect(
      jewellery.fields.required.find((f) => f.key === "net_wt")?.unit,
    ).toBe("g");
  });

  it("keys the same concept the same way across verticals", () => {
    const keyOf = (id: string, label: string) =>
      allFields(byId(id)).find((f) => f.label === label)?.key;

    expect(keyOf("pharmacy", "Item name")).toBe("item_name");
    expect(keyOf("manufacturing", "Product")).toBe("item_name");
    expect(keyOf("automobile", "Service / part")).toBe("item_name");
    expect(keyOf("catering", "Menu items")).toBe("item_name");
    expect(keyOf("distributor", "Batch")).toBe("batch_no");
    expect(keyOf("pharmacy", "Batch No")).toBe("batch_no");
    expect(keyOf("grocery", "Weight / unit")).toBe("unit");
    expect(keyOf("hardware", "Unit")).toBe("unit");
    expect(keyOf("wholesale", "Party GSTIN")).toBe("party_gstin");
    expect(keyOf("distributor", "Retailer GSTIN")).toBe("party_gstin");
    expect(keyOf("manufacturing", "Qty produced")).toBe("qty");
  });
});

describe("hand-authored rates agree with the rate parser", () => {
  // The seed is hand-authored while parseRate() reads the same design strings
  // at runtime, so the two can drift silently — and did: the seed once billed
  // "0-5%" at 0% while the parser billed 5%. Undercharging is the dangerous
  // direction (it surfaces at the annual return, out of the dealer's margin),
  // so pin them together rather than trusting them to agree.
  //
  // A vertical may deliberately NARROW a displayed span to a rate the engine
  // refuses to guess ("Rate follows item HSN" -> hsn, forcing a per-item
  // override). That is the only sanctioned divergence.
  const narrowed = new Set(["hsn", "igst", "none"]);

  it.each([...BUSINESS_TYPES])("$businessType", (config) => {
    const entry = raw(config);

    config.gst.slabs.forEach((slab, i) => {
      const parsed = parseRate(entry.gst[i]!.r);
      if (narrowed.has(slab.rate.kind) && !narrowed.has(parsed.kind)) return;
      expect(
        slab.rate,
        `${config.businessType} slab "${slab.applies}"`,
      ).toEqual(parsed);
    });
  });

  it("never bills a displayed span below its ceiling", () => {
    for (const config of BUSINESS_TYPES) {
      for (const slab of config.gst.slabs) {
        if (slab.rate.kind !== "range") continue;
        expect(slab.rate.bps, `${config.businessType} "${slab.applies}"`).toBe(
          slab.rate.maxBps,
        );
      }
    }
  });
});
