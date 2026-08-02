import { describe, expect, it } from "vitest";

import { isBillOfSupply, resolveInvoice, resolveReports } from "./invoice";
import { requireBusinessType } from "./registry";
import type { BusinessTypeConfig } from "./types";

function config(
  overrides: Partial<BusinessTypeConfig> = {},
): BusinessTypeConfig {
  return {
    businessType: "fixture",
    label: "Fixture",
    sector: "Test",
    letter: "Fx",
    hue: 200,
    fields: { required: [], optional: [] },
    validations: [],
    gst: {
      defaultLabel: "12%",
      default: { kind: "fixed", bps: 1200 },
      slabs: [],
    },
    invoice: {
      template: "TAX INVOICE",
      columns: ["Item", "Qty"],
      extras: ["Round-off"],
    },
    reports: ["GSTR-1", "Daily sales"],
    ...overrides,
  };
}

describe("resolveInvoice", () => {
  it("returns the config's invoice block verbatim", () => {
    expect(resolveInvoice(requireBusinessType("pharmacy"))).toEqual(
      requireBusinessType("pharmacy").invoice,
    );
  });
});

describe("resolveReports", () => {
  it("returns the report names", () => {
    expect(resolveReports(config())).toEqual(["GSTR-1", "Daily sales"]);
  });

  it("does not hand out the config's own array", () => {
    const source = config();
    resolveReports(source).push("Injected");
    expect(source.reports).toEqual(["GSTR-1", "Daily sales"]);
  });
});

describe("isBillOfSupply", () => {
  it("is true for the composition dealer in the design (kirana)", () => {
    const kirana = requireBusinessType("kirana");
    expect(kirana.gst.composition).toBeDefined();
    expect(kirana.invoice.template).toBe("BILL OF SUPPLY");
    expect(isBillOfSupply(kirana)).toBe(true);
  });

  it("is false for a tax-invoice vertical (pharmacy)", () => {
    expect(isBillOfSupply(requireBusinessType("pharmacy"))).toBe(false);
  });

  it("is false for every seeded vertical without a composition scheme", () => {
    for (const seeded of [
      requireBusinessType("grocery"),
      requireBusinessType("restaurant"),
    ]) {
      expect(isBillOfSupply(seeded)).toBe(false);
    }
  });

  it("throws when a composition scheme is declared without the bill-of-supply title", () => {
    const broken = config({
      gst: {
        defaultLabel: "Composition 1%",
        default: { kind: "fixed", bps: 100 },
        composition: { rateBps: 100 },
        slabs: [],
      },
    });
    expect(() => isBillOfSupply(broken)).toThrow(/BILL OF SUPPLY/);
  });

  it("throws when the bill-of-supply title is declared without a composition scheme", () => {
    const broken = config({
      invoice: { template: "BILL OF SUPPLY", columns: ["Item"], extras: [] },
    });
    expect(() => isBillOfSupply(broken)).toThrow(/inconsistent/);
  });
});
