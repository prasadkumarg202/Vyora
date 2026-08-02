import { describe, expect, it } from "vitest";
import { computeTax } from "./compute";
import type {
  BusinessTypeConfig,
  GstConfig,
  LineItem,
  TaxContext,
} from "../types";

// Karnataka supplier. Same code => CGST+SGST; different => IGST.
const KA = "29";
const MH = "27";
const intra: TaxContext = { supplierStateCode: KA, placeOfSupplyStateCode: KA };
const inter: TaxContext = { supplierStateCode: KA, placeOfSupplyStateCode: MH };

function config(gst: GstConfig): BusinessTypeConfig {
  return {
    businessType: "test",
    label: "Test",
    sector: "Test",
    letter: "Ts",
    hue: 200,
    fields: { required: [], optional: [] },
    validations: [],
    gst,
    invoice: { template: "TAX INVOICE", columns: [], extras: [] },
    reports: [],
  };
}

/** Hotel: the design's "Tariff ≥ ₹7,500" threshold, read off a pseudo-field. */
const hotel = config({
  defaultLabel: "12%",
  default: { kind: "fixed", bps: 1200 },
  slabs: [
    {
      applies: "Tariff ≥ ₹7,500",
      rate: { kind: "fixed", bps: 1800 },
      when: { op: "gte", field: "$unit_price_paise", value: 750000 },
    },
    {
      applies: "Tariff < ₹7,500",
      rate: { kind: "fixed", bps: 1200 },
      when: { op: "lt", field: "$unit_price_paise", value: 750000 },
    },
  ],
});

const restaurant = config({
  defaultLabel: "5%",
  default: { kind: "fixed", bps: 500 },
  slabs: [
    {
      applies: "Restaurant service (no ITC)",
      rate: { kind: "fixed", bps: 500 },
      itcBlocked: true,
      when: { op: "present", field: "$line_total_paise" },
    },
  ],
});

const jewellery = config({
  defaultLabel: "3%",
  default: { kind: "fixed", bps: 300 },
  slabs: [],
});

const hsnVertical = config({
  defaultLabel: "As per HSN",
  default: { kind: "hsn" },
  slabs: [],
});

const kirana = config({
  defaultLabel: "Composition 1%",
  default: { kind: "fixed", bps: 100 },
  composition: { rateBps: 100 },
  slabs: [],
});

function line(over: Partial<LineItem> = {}): LineItem {
  return { qty: 1, unitPricePaise: 750000, ...over };
}

describe("computeTax — rate resolution", () => {
  it("picks the slab whose threshold the line meets", () => {
    const at = computeTax(hotel, [line({ unitPricePaise: 750000 })], intra);
    expect(at.lines[0]?.rateBps).toBe(1800);
    expect(at.lines[0]?.appliedSlab).toBe("Tariff ≥ ₹7,500");

    const below = computeTax(hotel, [line({ unitPricePaise: 749999 })], intra);
    expect(below.lines[0]?.rateBps).toBe(1200);
    expect(below.lines[0]?.appliedSlab).toBe("Tariff < ₹7,500");
  });

  it("falls back to the vertical default when no slab matches", () => {
    const out = computeTax(
      jewellery,
      [line({ unitPricePaise: 5000000 })],
      intra,
    );
    expect(out.lines[0]?.rateBps).toBe(300);
    expect(out.lines[0]?.appliedSlab).toBeUndefined();
  });

  it("ignores descriptive slabs that carry no condition", () => {
    const descriptive = config({
      defaultLabel: "18%",
      default: { kind: "fixed", bps: 1800 },
      slabs: [{ applies: "Most items", rate: { kind: "fixed", bps: 500 } }],
    });
    const out = computeTax(descriptive, [line()], intra);
    expect(out.lines[0]?.rateBps).toBe(1800);
    expect(out.lines[0]?.appliedSlab).toBeUndefined();
  });

  it("lets a line override win over slab and default alike", () => {
    const out = computeTax(hotel, [line({ gstBps: 500 })], intra);
    expect(out.lines[0]?.rateBps).toBe(500);
    // The slab still supplies the trace: the override changed the rate, not
    // which row of the design the line belongs to.
    expect(out.lines[0]?.appliedSlab).toBe("Tariff ≥ ₹7,500");
  });

  it("resolves an HSN vertical only through an override", () => {
    const out = computeTax(
      hsnVertical,
      [line({ unitPricePaise: 5000000, gstBps: 300 })],
      intra,
    );
    expect(out.lines[0]?.rateBps).toBe(300);
    expect(out.totalTaxPaise).toBe(150000);
  });

  it("applies a range at its ceiling, absent an override", () => {
    const ranged = config({
      defaultLabel: "0–5%",
      default: { kind: "range", minBps: 0, maxBps: 500, bps: 500 },
      slabs: [],
    });
    const out = computeTax(ranged, [line({ unitPricePaise: 100000 })], intra);
    expect(out.lines[0]?.rateBps).toBe(500);
  });

  it("records the ITC block from the slab", () => {
    const out = computeTax(
      restaurant,
      [line({ unitPricePaise: 120000 })],
      intra,
    );
    expect(out.lines[0]?.itcBlocked).toBe(true);
    expect(out.lines[0]?.appliedSlab).toBe("Restaurant service (no ITC)");
  });

  it("leaves itcBlocked absent when the slab does not block it", () => {
    const out = computeTax(hotel, [line()], intra);
    expect(out.lines[0]?.itcBlocked).toBeUndefined();
    expect("itcBlocked" in (out.lines[0] ?? {})).toBe(false);
  });

  it("reads slab predicates against the injected pseudo-fields", () => {
    const byQty = config({
      defaultLabel: "18%",
      default: { kind: "fixed", bps: 1800 },
      slabs: [
        {
          applies: "Bulk",
          rate: { kind: "fixed", bps: 500 },
          when: { op: "gte", field: "$qty", value: 10 },
        },
        {
          applies: "Sale value ≥ ₹1,000",
          rate: { kind: "fixed", bps: 1200 },
          when: { op: "gte", field: "$line_total_paise", value: 100000 },
        },
      ],
    });
    expect(
      computeTax(byQty, [line({ qty: 10, unitPricePaise: 100 })], intra)
        .lines[0]?.rateBps,
    ).toBe(500);
    expect(
      computeTax(byQty, [line({ qty: 1, unitPricePaise: 100000 })], intra)
        .lines[0]?.rateBps,
    ).toBe(1200);
    expect(
      computeTax(byQty, [line({ qty: 1, unitPricePaise: 99999 })], intra)
        .lines[0]?.rateBps,
    ).toBe(1800);
  });

  it("reads slab predicates against the line's own fields", () => {
    const pharmacy = config({
      defaultLabel: "12%",
      default: { kind: "fixed", bps: 1200 },
      slabs: [
        {
          applies: "Life-saving / exempt drugs",
          rate: { kind: "fixed", bps: 0 },
          when: { op: "eq", field: "category", value: "life_saving" },
        },
      ],
    });
    const out = computeTax(
      pharmacy,
      [line({ unitPricePaise: 45000, fields: { category: "life_saving" } })],
      intra,
    );
    expect(out.lines[0]?.rateBps).toBe(0);
    expect(out.totalTaxPaise).toBe(0);
    expect(out.grandTotalPaise).toBe(45000);
  });

  it("cannot be tricked by a line field shadowing a pseudo-field", () => {
    const out = computeTax(
      hotel,
      [line({ unitPricePaise: 749999, fields: { $unit_price_paise: 999999 } })],
      intra,
    );
    expect(out.lines[0]?.rateBps).toBe(1200);
  });
});

describe("computeTax — taxable value", () => {
  it("deducts the discount before tax, never after", () => {
    // ₹50,000 of gold against a ₹20,000 old-gold exchange, jewellery at 3%.
    const out = computeTax(
      jewellery,
      [line({ unitPricePaise: 5000000, discountPaise: 2000000 })],
      intra,
    );
    expect(out.taxableValuePaise).toBe(3000000);
    expect(out.totalTaxPaise).toBe(90000); // 3% of ₹30,000, not of ₹50,000
    expect(out.grandTotalPaise).toBe(3090000);
  });

  it("multiplies qty by unit price exactly, including fractional weights", () => {
    // 8.25 g of gold at ₹5,200/g = ₹42,900, 3% = ₹1,287.
    const out = computeTax(
      jewellery,
      [line({ qty: 8.25, unitPricePaise: 520000 })],
      intra,
    );
    expect(out.taxableValuePaise).toBe(4290000);
    expect(out.totalTaxPaise).toBe(128700);
  });

  it("allows a discount down to exactly zero", () => {
    const out = computeTax(
      jewellery,
      [line({ unitPricePaise: 5000000, discountPaise: 5000000 })],
      intra,
    );
    expect(out.taxableValuePaise).toBe(0);
    expect(out.grandTotalPaise).toBe(0);
  });

  it("refuses a discount larger than the line", () => {
    expect(() =>
      computeTax(
        jewellery,
        [line(), line({ unitPricePaise: 100000, discountPaise: 100001 })],
        intra,
      ),
    ).toThrow(/Line 1: discount exceeds line value/);
  });

  it("refuses negative inputs rather than crediting tax", () => {
    expect(() => computeTax(jewellery, [line({ qty: -1 })], intra)).toThrow(
      /Line 0: qty must not be negative/,
    );
    expect(() =>
      computeTax(jewellery, [line({ unitPricePaise: -1 })], intra),
    ).toThrow(/Line 0: unitPricePaise must not be negative/);
    expect(() =>
      computeTax(jewellery, [line({ discountPaise: -1 })], intra),
    ).toThrow(/Line 0: discountPaise must not be negative/);
    expect(() => computeTax(jewellery, [line({ qty: NaN })], intra)).toThrow(
      /Line 0: qty must be a finite number/,
    );
  });
});

describe("computeTax — the CGST/SGST split", () => {
  it("halves the tax within a state", () => {
    const out = computeTax(hotel, [line()], intra);
    expect(out.totalTaxPaise).toBe(135000);
    expect(out.cgstPaise).toBe(67500);
    expect(out.sgstPaise).toBe(67500);
    expect(out.igstPaise).toBe(0);
    expect(out.grandTotalPaise).toBe(885000);
  });

  it("charges IGST across states", () => {
    const out = computeTax(hotel, [line()], inter);
    expect(out.igstPaise).toBe(135000);
    expect(out.cgstPaise).toBe(0);
    expect(out.sgstPaise).toBe(0);
    expect(out.grandTotalPaise).toBe(885000);
  });

  it("does not lose the odd paisa on an odd tax", () => {
    // 5% of 60 paise is exactly 3 paise. A /2 would drop or invent half of it.
    const out = computeTax(restaurant, [line({ unitPricePaise: 60 })], intra);
    expect(out.totalTaxPaise).toBe(3);
    expect(out.cgstPaise).toBe(2);
    expect(out.sgstPaise).toBe(1);
    expect(out.cgstPaise + out.sgstPaise).toBe(out.totalTaxPaise);
  });

  it("keeps the halves summing to the tax for every odd tax", () => {
    for (let paise = 0; paise <= 200; paise += 1) {
      const out = computeTax(
        restaurant,
        [line({ unitPricePaise: paise, gstBps: 10_000 })],
        intra,
      );
      expect(out.cgstPaise + out.sgstPaise).toBe(out.totalTaxPaise);
      expect(out.cgstPaise - out.sgstPaise).toBeLessThanOrEqual(1);
    }
  });

  it("splits per line, so odd paise cannot cancel across lines", () => {
    const out = computeTax(
      restaurant,
      [line({ unitPricePaise: 60 }), line({ unitPricePaise: 60 })],
      intra,
    );
    expect(out.totalTaxPaise).toBe(6);
    expect(out.cgstPaise).toBe(4);
    expect(out.sgstPaise).toBe(2);
  });
});

describe("computeTax — round-off", () => {
  const zeroRated = config({
    defaultLabel: "0%",
    default: { kind: "fixed", bps: 0 },
    slabs: [],
  });

  it("rounds the grand total down and reports the delta", () => {
    // ₹1,234.56 restaurant bill at 5% = ₹1,296.29.
    const out = computeTax(restaurant, [line({ unitPricePaise: 123456 })], {
      ...intra,
      roundOff: true,
    });
    expect(out.totalTaxPaise).toBe(6173);
    expect(out.roundOffPaise).toBe(-29);
    expect(out.grandTotalPaise).toBe(129600);
  });

  it("rounds the grand total up and reports the delta", () => {
    const out = computeTax(zeroRated, [line({ unitPricePaise: 100051 })], {
      ...intra,
      roundOff: true,
    });
    expect(out.roundOffPaise).toBe(49);
    expect(out.grandTotalPaise).toBe(100100);
  });

  it("rounds exactly fifty paise up", () => {
    const out = computeTax(zeroRated, [line({ unitPricePaise: 12350 })], {
      ...intra,
      roundOff: true,
    });
    expect(out.roundOffPaise).toBe(50);
    expect(out.grandTotalPaise).toBe(12400);
  });

  it("reports no round-off when the total is already whole rupees", () => {
    const out = computeTax(hotel, [line()], { ...intra, roundOff: true });
    expect(out.roundOffPaise).toBe(0);
    expect(out.grandTotalPaise).toBe(885000);
  });

  it("is off by default", () => {
    const out = computeTax(
      restaurant,
      [line({ unitPricePaise: 123456 })],
      intra,
    );
    expect(out.roundOffPaise).toBe(0);
    expect(out.grandTotalPaise).toBe(129629);
  });

  it("rounds once at the end, not per line", () => {
    // Ten lines that each round up would invent ₹4.90 of tax.
    const lines = Array.from({ length: 10 }, () =>
      line({ unitPricePaise: 10049 }),
    );
    const out = computeTax(zeroRated, lines, { ...intra, roundOff: true });
    expect(out.taxableValuePaise).toBe(100490);
    expect(out.roundOffPaise).toBe(10);
    expect(out.grandTotalPaise).toBe(100500);
  });

  it("leaves the line totals un-rounded", () => {
    const out = computeTax(restaurant, [line({ unitPricePaise: 123456 })], {
      ...intra,
      roundOff: true,
    });
    expect(out.lines[0]?.totalPaise).toBe(129629);
  });
});

describe("computeTax — composition dealers", () => {
  it("charges the customer no tax and prints no breakup", () => {
    // ₹1,000 of kirana turnover; the dealer owes 1% from its own margin.
    const out = computeTax(kirana, [line({ unitPricePaise: 100000 })], intra);
    expect(out.composition).toBe(true);
    expect(out.taxableValuePaise).toBe(100000);
    expect(out.totalTaxPaise).toBe(1000);
    expect(out.cgstPaise).toBe(0);
    expect(out.sgstPaise).toBe(0);
    expect(out.igstPaise).toBe(0);
    // The liability is visible to the caller but is NOT billed to the customer:
    // a composition dealer may not collect GST, so the bill of supply is the
    // taxable value alone.
    expect(out.grandTotalPaise).toBe(100000);
  });

  it("carries no rate or tax on the lines", () => {
    const out = computeTax(kirana, [line({ unitPricePaise: 100000 })], intra);
    expect(out.lines[0]).toEqual({
      taxableValuePaise: 100000,
      rateBps: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalTaxPaise: 0,
      totalPaise: 100000,
    });
  });

  it("levies the composition rate on total turnover, not per line", () => {
    // 3 lines of 50 paise: 1% of each rounds to 1 paisa (3 total), but 1% of
    // the ₹1.50 turnover is 2 paise. The turnover figure is the lawful one.
    const out = computeTax(
      kirana,
      [
        line({ unitPricePaise: 50 }),
        line({ unitPricePaise: 50 }),
        line({ unitPricePaise: 50 }),
      ],
      intra,
    );
    expect(out.taxableValuePaise).toBe(150);
    expect(out.totalTaxPaise).toBe(2);
  });

  it("still deducts discounts before computing turnover", () => {
    const out = computeTax(
      kirana,
      [line({ unitPricePaise: 100000, discountPaise: 20000 })],
      intra,
    );
    expect(out.taxableValuePaise).toBe(80000);
    expect(out.totalTaxPaise).toBe(800);
  });

  it("ignores the state split entirely", () => {
    const out = computeTax(kirana, [line({ unitPricePaise: 100000 })], inter);
    expect(out.igstPaise).toBe(0);
    expect(out.totalTaxPaise).toBe(1000);
  });

  it("never throws on an unresolvable rate, having no use for one", () => {
    const compositionHsn = config({
      defaultLabel: "Composition 1%",
      default: { kind: "hsn" },
      composition: { rateBps: 100 },
      slabs: [],
    });
    expect(() =>
      computeTax(compositionHsn, [line({ unitPricePaise: 100000 })], intra),
    ).not.toThrow();
  });

  it("still rounds off the bill of supply", () => {
    const out = computeTax(kirana, [line({ unitPricePaise: 100049 })], {
      ...intra,
      roundOff: true,
    });
    expect(out.grandTotalPaise).toBe(100000);
    expect(out.roundOffPaise).toBe(-49);
  });
});

describe("computeTax — refusals", () => {
  it("refuses to invent a rate for an HSN row", () => {
    expect(() => computeTax(hsnVertical, [line()], intra)).toThrow(
      /Line 0: rate comes from the item's HSN; supply gstBps/,
    );
  });

  it("refuses to invent a rate for an IGST row", () => {
    const wholesale = config({
      defaultLabel: "18%",
      default: { kind: "fixed", bps: 1800 },
      slabs: [
        {
          applies: "Inter-state supply",
          rate: { kind: "igst" },
          when: { op: "eq", field: "interstate", value: true },
        },
      ],
    });
    expect(() =>
      computeTax(wholesale, [line({ fields: { interstate: true } })], inter),
    ).toThrow(/Line 0 \(slab "Inter-state supply"\): .*inter-state split/);
  });

  it("refuses to invent a rate for an informational row", () => {
    const distributor = config({
      defaultLabel: "—",
      default: { kind: "none" },
      slabs: [],
    });
    expect(() => computeTax(distributor, [line()], intra)).toThrow(
      /Line 0: this row is informational/,
    );
  });

  it("names the slab it could not resolve", () => {
    const perHsn = config({
      defaultLabel: "As per HSN",
      default: { kind: "fixed", bps: 1800 },
      slabs: [
        {
          applies: "Rate as per HSN",
          rate: { kind: "hsn" },
          when: { op: "present", field: "$qty" },
        },
      ],
    });
    expect(() => computeTax(perHsn, [line()], intra)).toThrow(
      /slab "Rate as per HSN"/,
    );
  });

  it("refuses a nonsense state code rather than guessing the split", () => {
    expect(() =>
      computeTax(hotel, [line()], { ...intra, supplierStateCode: "KA" }),
    ).toThrow(/supplierStateCode must be a two-digit GST state code/);
    expect(() =>
      computeTax(hotel, [line()], { ...intra, placeOfSupplyStateCode: "290" }),
    ).toThrow(/placeOfSupplyStateCode must be a two-digit GST state code/);
    expect(() =>
      computeTax(hotel, [line()], { ...intra, supplierStateCode: "" }),
    ).toThrow(/supplierStateCode/);
  });

  it("refuses a nonsense override", () => {
    expect(() =>
      computeTax(hotel, [line({ gstBps: 18 })], intra),
    ).not.toThrow();
    expect(() => computeTax(hotel, [line({ gstBps: -1 })], intra)).toThrow(
      /Line 0: gstBps must be a whole number of basis points/,
    );
    expect(() => computeTax(hotel, [line({ gstBps: 10001 })], intra)).toThrow(
      /Line 0: gstBps/,
    );
    expect(() => computeTax(hotel, [line({ gstBps: 18.5 })], intra)).toThrow(
      /Line 0: gstBps/,
    );
  });
});

describe("computeTax — totals", () => {
  it("returns a zeroed breakup for an empty bill", () => {
    expect(computeTax(hotel, [], intra)).toEqual({
      lines: [],
      taxableValuePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalTaxPaise: 0,
      roundOffPaise: 0,
      grandTotalPaise: 0,
      composition: false,
    });
  });

  it("sums a mixed-rate bill and reconciles", () => {
    const out = computeTax(
      hotel,
      [
        line({ unitPricePaise: 750000, qty: 2 }), // ₹15,000 @ 18% = ₹2,700
        line({ unitPricePaise: 400000 }), // ₹4,000 @ 12% = ₹480
      ],
      intra,
    );
    expect(out.taxableValuePaise).toBe(1900000);
    expect(out.lines[0]?.totalTaxPaise).toBe(270000);
    expect(out.lines[1]?.totalTaxPaise).toBe(48000);
    expect(out.totalTaxPaise).toBe(318000);
    expect(out.cgstPaise).toBe(159000);
    expect(out.sgstPaise).toBe(159000);
    expect(out.grandTotalPaise).toBe(2218000);
    expect(out.taxableValuePaise + out.totalTaxPaise).toBe(out.grandTotalPaise);
  });

  it("stays exact on a crore-scale invoice", () => {
    // 100 rooms × ₹7,500 × 12 nights = ₹90,00,000 at 18% = ₹16,20,000.
    const out = computeTax(
      hotel,
      [line({ qty: 1200, unitPricePaise: 750000 })],
      intra,
    );
    expect(out.taxableValuePaise).toBe(900000000);
    expect(out.totalTaxPaise).toBe(162000000);
    expect(out.cgstPaise).toBe(81000000);
    expect(out.sgstPaise).toBe(81000000);
    expect(out.grandTotalPaise).toBe(1062000000);
    expect(Number.isSafeInteger(out.grandTotalPaise)).toBe(true);
  });

  it("stays exact across a thousand odd-paise lines", () => {
    const lines = Array.from({ length: 1000 }, () =>
      line({ unitPricePaise: 60 }),
    );
    const out = computeTax(restaurant, lines, intra);
    expect(out.taxableValuePaise).toBe(60000);
    expect(out.totalTaxPaise).toBe(3000);
    expect(out.cgstPaise).toBe(2000);
    expect(out.sgstPaise).toBe(1000);
    expect(out.cgstPaise + out.sgstPaise + out.igstPaise).toBe(
      out.totalTaxPaise,
    );
  });

  it("does not mutate the caller's lines", () => {
    const lines = [line({ unitPricePaise: 750000 })];
    const snapshot = structuredClone(lines);
    computeTax(hotel, lines, intra);
    expect(lines).toEqual(snapshot);
  });
});
