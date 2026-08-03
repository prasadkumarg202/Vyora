import { describe, expect, it } from "vitest";

import { BUSINESS_TYPES } from "../seed/business-types";
import type { BusinessTypeConfig, LineItem, Paise, TaxContext } from "../types";
import { computeDocument } from "./document";

const grocery = BUSINESS_TYPES.find(
  (b) => b.businessType === "grocery",
) as BusinessTypeConfig;

const intra: TaxContext = {
  supplierStateCode: "36",
  placeOfSupplyStateCode: "36",
  roundOff: false,
};

const line = (
  unitPricePaise: number,
  qty: number,
  gstBps: number,
): LineItem => ({
  qty,
  unitPricePaise: unitPricePaise as Paise,
  gstBps,
});

describe("document discount", () => {
  it("reduces taxable value rather than the total after tax", () => {
    // ₹1,000 at 18%, ₹100 off. Taxable value must be ₹900, tax ₹162 — not
    // ₹180 of tax on ₹1,000 with ₹100 knocked off the bottom.
    const doc = computeDocument(grocery, {
      lines: [line(100_000, 1, 1800)],
      discount: { kind: "amount", amountPaise: 10_000 as Paise },
      ctx: intra,
    });

    expect(doc.discountPaise).toBe(10_000);
    expect(doc.tax.taxableValuePaise).toBe(90_000);
    expect(doc.tax.totalTaxPaise).toBe(16_200);
    expect(doc.tax.grandTotalPaise).toBe(106_200);
  });

  it("splits by value across mixed rates, not evenly", () => {
    // ₹900 at 18% and ₹100 at 5%. A ₹100 discount belongs 90/10, so ₹90 comes
    // off the 18% line. Splitting it evenly would move real tax between rates.
    const doc = computeDocument(grocery, {
      lines: [line(90_000, 1, 1800), line(10_000, 1, 500)],
      discount: { kind: "amount", amountPaise: 10_000 as Paise },
      ctx: intra,
    });

    expect(doc.allocatedDiscounts).toEqual([9_000, 1_000]);
    expect(doc.tax.lines[0]!.taxableValuePaise).toBe(81_000);
    expect(doc.tax.lines[1]!.taxableValuePaise).toBe(9_000);
    // 18% of 810 + 5% of 90 = 145.80 + 4.50
    expect(doc.tax.totalTaxPaise).toBe(14_580 + 450);
  });

  it("allocates to the paisa, with no drift on the last line", () => {
    // ₹100 over three equal lines cannot divide evenly.
    const doc = computeDocument(grocery, {
      lines: [line(10_000, 1, 500), line(10_000, 1, 500), line(10_000, 1, 500)],
      discount: { kind: "amount", amountPaise: 10_000 as Paise },
      ctx: intra,
    });

    const sum = doc.allocatedDiscounts.reduce((a, b) => a + b, 0);
    expect(sum).toBe(10_000);
  });

  it("takes a percentage off the value of supply", () => {
    const doc = computeDocument(grocery, {
      lines: [line(100_000, 2, 1800)],
      discount: { kind: "percent", bps: 1000 },
      ctx: intra,
    });

    expect(doc.grossPaise).toBe(200_000);
    expect(doc.discountPaise).toBe(20_000);
    expect(doc.tax.taxableValuePaise).toBe(180_000);
  });

  it("never discounts more than the bill", () => {
    const doc = computeDocument(grocery, {
      lines: [line(10_000, 1, 500)],
      discount: { kind: "amount", amountPaise: 99_999 as Paise },
      ctx: intra,
    });

    expect(doc.discountPaise).toBe(10_000);
    expect(doc.tax.taxableValuePaise).toBe(0);
    expect(doc.tax.grandTotalPaise).toBe(0);
  });

  it("leaves a line's own discount intact and adds to it", () => {
    const doc = computeDocument(grocery, {
      lines: [
        {
          qty: 1,
          unitPricePaise: 100_000 as Paise,
          discountPaise: 5_000 as Paise,
          gstBps: 1800,
        },
      ],
      discount: { kind: "amount", amountPaise: 10_000 as Paise },
      ctx: intra,
    });

    // ₹1,000 − ₹50 line discount − ₹100 document discount.
    expect(doc.grossPaise).toBe(95_000);
    expect(doc.tax.taxableValuePaise).toBe(85_000);
  });
});

describe("additional charges", () => {
  it("taxes a charge instead of appending it tax-free", () => {
    const doc = computeDocument(grocery, {
      lines: [line(100_000, 1, 1800)],
      charges: [{ label: "Delivery", amountPaise: 5_000 as Paise }],
      ctx: intra,
    });

    expect(doc.chargesPaise).toBe(5_000);
    expect(doc.tax.taxableValuePaise).toBe(105_000);
    // The charge follows the principal supply's rate, so 18% on the whole.
    expect(doc.tax.totalTaxPaise).toBe(18_900);
  });

  it("takes the highest rate on the bill for an unrated charge", () => {
    const doc = computeDocument(grocery, {
      lines: [line(10_000, 1, 500), line(10_000, 1, 1800)],
      charges: [{ label: "Packing", amountPaise: 10_000 as Paise }],
      ctx: intra,
    });

    const chargeLine = doc.tax.lines[doc.itemLineCount]!;
    expect(chargeLine.rateBps).toBe(1800);
  });

  it("honours a rate the shop sets on the charge itself", () => {
    const doc = computeDocument(grocery, {
      lines: [line(10_000, 1, 1800)],
      charges: [
        { label: "Insurance", amountPaise: 10_000 as Paise, gstBps: 500 },
      ],
      ctx: intra,
    });

    expect(doc.tax.lines[doc.itemLineCount]!.rateBps).toBe(500);
  });

  it("keeps items and charges tellable apart", () => {
    const doc = computeDocument(grocery, {
      lines: [line(10_000, 1, 500), line(10_000, 1, 500)],
      charges: [{ label: "Delivery", amountPaise: 5_000 as Paise }],
      ctx: intra,
    });

    expect(doc.itemLineCount).toBe(2);
    expect(doc.tax.lines).toHaveLength(3);
  });
});

describe("discount and charges together", () => {
  it("discounts the goods and still taxes the delivery", () => {
    const doc = computeDocument(grocery, {
      lines: [line(100_000, 1, 1800)],
      discount: { kind: "amount", amountPaise: 10_000 as Paise },
      charges: [{ label: "Delivery", amountPaise: 5_000 as Paise }],
      ctx: intra,
    });

    // Discount applies to the goods only — a charge added by the shop is not
    // something the shop is also discounting.
    expect(doc.tax.taxableValuePaise).toBe(95_000);
    expect(doc.tax.totalTaxPaise).toBe(17_100);
  });

  it("still splits CGST and SGST evenly within the state", () => {
    const doc = computeDocument(grocery, {
      lines: [line(100_000, 1, 1800)],
      discount: { kind: "percent", bps: 1000 },
      charges: [{ label: "Delivery", amountPaise: 10_000 as Paise }],
      ctx: intra,
    });

    expect(doc.tax.igstPaise).toBe(0);
    expect(doc.tax.cgstPaise).toBe(doc.tax.sgstPaise);
    expect(doc.tax.cgstPaise + doc.tax.sgstPaise).toBe(doc.tax.totalTaxPaise);
  });

  it("charges IGST across a state line", () => {
    const doc = computeDocument(grocery, {
      lines: [line(100_000, 1, 1800)],
      charges: [{ label: "Freight", amountPaise: 10_000 as Paise }],
      ctx: { ...intra, placeOfSupplyStateCode: "27" },
    });

    expect(doc.tax.cgstPaise).toBe(0);
    expect(doc.tax.sgstPaise).toBe(0);
    expect(doc.tax.igstPaise).toBe(doc.tax.totalTaxPaise);
  });

  it("rounds the grand total to the rupee when asked", () => {
    const doc = computeDocument(grocery, {
      lines: [line(9_999, 1, 1800)],
      ctx: { ...intra, roundOff: true },
    });

    expect(doc.tax.grandTotalPaise % 100).toBe(0);
    expect(doc.tax.roundOffPaise).not.toBeUndefined();
  });
});
