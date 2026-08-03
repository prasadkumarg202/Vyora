import { allocate, applyBps, sumPaise } from "../money";
import type {
  Bps,
  BusinessTypeConfig,
  LineItem,
  Paise,
  TaxBreakup,
  TaxContext,
} from "../types";
import { computeTax } from "./compute";

/**
 * Invoice-level discount and additional charges, done the way GST requires.
 *
 * The tempting version — total the lines, tax them, then subtract a discount
 * and add a delivery fee at the bottom — produces a wrong tax figure and an
 * invoice that will not reconcile in GSTR-1. Under section 15, a discount
 * given at the time of supply reduces the *taxable value*, so it has to be
 * spread across the lines before tax is computed; and an additional charge is
 * part of the value of supply, so it is taxed, not appended tax-free.
 *
 * So this module does not add a second layer of arithmetic on top of the tax
 * engine. It rewrites the lines and calls the engine once:
 *
 *   - a document discount is allocated across lines in proportion to their
 *     value, using the exact-remainder allocator, and lands in each line's
 *     existing `discountPaise` — which `computeTax` already deducts before tax
 *   - each additional charge becomes a line of its own, with its own rate
 *
 * The result is that a shop can give ₹100 off a mixed 5%/18% bill and the
 * CGST/SGST split is still correct to the paisa.
 */

export interface DocumentCharge {
  /** "Delivery", "Packing", "Installation". Printed on the invoice. */
  readonly label: string;
  readonly amountPaise: Paise;
  /**
   * The charge's own GST rate. Absent means "same as the principal supply",
   * which for a composite supply is the correct default — and in practice is
   * the highest rate on the bill, because that is the rate a mixed supply
   * attracts.
   */
  readonly gstBps?: Bps;
}

export type DocumentDiscount =
  | { readonly kind: "amount"; readonly amountPaise: Paise }
  | { readonly kind: "percent"; readonly bps: Bps };

export interface DocumentInput {
  readonly lines: LineItem[];
  readonly discount?: DocumentDiscount | undefined;
  readonly charges?: readonly DocumentCharge[] | undefined;
  readonly ctx: TaxContext;
}

export interface DocumentTotals {
  /** Line value before any document discount, before tax. */
  readonly grossPaise: Paise;
  /** What the document discount actually came to. */
  readonly discountPaise: Paise;
  /** Sum of the additional charges, before their own tax. */
  readonly chargesPaise: Paise;
  /**
   * The engine's answer for the whole document — lines and charges together,
   * discount already deducted from taxable value.
   */
  readonly tax: TaxBreakup;
  /** Per-line discount actually allocated, in the order lines were given. */
  readonly allocatedDiscounts: readonly Paise[];
  /** How many of `tax.lines` are real items; the rest are charges. */
  readonly itemLineCount: number;
}

/** Line value the discount is shared out against. */
function grossOf(line: LineItem): number {
  const gross = Math.round(line.qty * line.unitPricePaise);
  return Math.max(0, gross - (line.discountPaise ?? 0));
}

export function computeDocument(
  config: BusinessTypeConfig,
  input: DocumentInput,
): DocumentTotals {
  const { lines, ctx } = input;
  const charges = input.charges ?? [];

  const grosses = lines.map(grossOf);
  const grossPaise = sumPaise(...(grosses as Paise[]));

  const discountPaise = resolveDiscount(input.discount, grossPaise);

  /**
   * Allocated by value, not split evenly. A ₹100 discount on a bill of ₹900
   * of 18% goods and ₹100 of 5% goods belongs mostly to the 18% line — an even
   * split would quietly move ₹6.50 of tax between the two rates.
   *
   * `allocate` is the exact-remainder allocator, so the parts always sum back
   * to the discount rather than drifting by a paisa on the last line.
   */
  const allocatedDiscounts =
    discountPaise > 0 && grossPaise > 0
      ? allocate(discountPaise, grosses)
      : lines.map(() => 0 as Paise);

  const discountedLines: LineItem[] = lines.map((line, i) => ({
    ...line,
    discountPaise: ((line.discountPaise ?? 0) +
      (allocatedDiscounts[i] ?? 0)) as Paise,
  }));

  const fallbackRate = highestRate(config, discountedLines, ctx);

  const chargeLines: LineItem[] = charges.map((charge) => ({
    qty: 1,
    unitPricePaise: charge.amountPaise,
    gstBps: charge.gstBps ?? fallbackRate,
    // Named so the printed line reads "Delivery" rather than a blank row.
    fields: { item_name: charge.label },
  }));

  const tax = computeTax(config, [...discountedLines, ...chargeLines], ctx);

  return {
    grossPaise,
    discountPaise,
    chargesPaise: sumPaise(...charges.map((c) => c.amountPaise)),
    tax,
    allocatedDiscounts,
    itemLineCount: lines.length,
  };
}

/**
 * Never more than the bill.
 *
 * A discount larger than the value of supply would drive the taxable value
 * negative and produce a credit the engine has no way to express. Clamping is
 * the honest failure: the shop sees ₹0, not a nonsense refund.
 */
function resolveDiscount(
  discount: DocumentDiscount | undefined,
  grossPaise: Paise,
): Paise {
  if (!discount || grossPaise <= 0) return 0 as Paise;

  const raw =
    discount.kind === "percent"
      ? applyBps(grossPaise, discount.bps)
      : discount.amountPaise;

  return Math.max(0, Math.min(raw, grossPaise)) as Paise;
}

/**
 * The rate an unrated additional charge should carry.
 *
 * A delivery fee on a bill of medicines is not a separate supply — it is part
 * of a composite one, and a composite supply is taxed at the rate of its
 * principal supply. Taking the highest rate present is the conservative read
 * of that: it never under-charges tax, which is the direction that costs the
 * shop a penalty rather than a customer a rupee.
 */
function highestRate(
  config: BusinessTypeConfig,
  lines: LineItem[],
  ctx: TaxContext,
): Bps {
  if (lines.length === 0) return config.gst.default.bps;
  try {
    const breakup = computeTax(config, lines, {
      ...ctx,
      roundOff: false,
    });
    return breakup.lines.reduce<Bps>(
      (max, line) => (line.rateBps > max ? line.rateBps : max),
      0 as Bps,
    );
  } catch {
    // A half-typed line should not stop a charge from being priced at all.
    return config.gst.default.bps;
  }
}
