import {
  allocate,
  applyBps,
  multiplyPaise,
  roundToNearestRupee,
  sumPaise,
} from "../money";
import { evaluatePredicate } from "../predicate";
import type {
  BusinessTypeConfig,
  Bps,
  GstRate,
  JsonValue,
  LineItem,
  LineTax,
  Paise,
  TaxBreakup,
  TaxContext,
} from "../types";

/**
 * The tax engine. It reads `config.gst` and nothing else — no module may learn
 * that a restaurant is a restaurant.
 *
 * Every arithmetic step goes through ../money, so nothing here rounds by hand.
 */

const STATE_CODE = /^\d{2}$/;

export function computeTax(
  config: BusinessTypeConfig,
  lines: LineItem[],
  ctx: TaxContext,
): TaxBreakup {
  assertStateCode(ctx.supplierStateCode, "supplierStateCode");
  assertStateCode(ctx.placeOfSupplyStateCode, "placeOfSupplyStateCode");

  const taxableValues = lines.map((line, index) => taxableValueOf(line, index));

  const lineTaxes = config.gst.composition
    ? taxableValues.map((taxableValuePaise) =>
        compositionLine(taxableValuePaise),
      )
    : lines.map((line, index) =>
        taxLine(config, line, index, taxableValues[index] ?? 0, ctx),
      );

  const taxableValuePaise = sumPaise(...taxableValues);
  const cgstPaise = sumPaise(...lineTaxes.map((l) => l.cgstPaise));
  const sgstPaise = sumPaise(...lineTaxes.map((l) => l.sgstPaise));
  const igstPaise = sumPaise(...lineTaxes.map((l) => l.igstPaise));

  // A composition dealer pays 1% of turnover out of its own margin and may not
  // collect it from the customer — the design's "Composition dealers omit tax
  // breakup" is that rule. So the liability is reported in `totalTaxPaise`
  // where an accountant can see it, but it is deliberately NOT part of
  // `grandTotalPaise`: the customer's bill of supply is the taxable value.
  const composition = config.gst.composition;
  const totalTaxPaise = composition
    ? applyBps(taxableValuePaise, composition.rateBps)
    : sumPaise(...lineTaxes.map((l) => l.totalTaxPaise));

  const chargedPaise = composition
    ? taxableValuePaise
    : sumPaise(...lineTaxes.map((l) => l.totalPaise));

  // Round-off is a single adjustment on the grand total. Doing it per line
  // would compound: ten lines each rounded up is ₹5 the customer never owed.
  const { rounded, delta } = ctx.roundOff
    ? roundToNearestRupee(chargedPaise)
    : { rounded: chargedPaise, delta: 0 };

  const breakup: TaxBreakup = {
    lines: lineTaxes,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    roundOffPaise: delta,
    grandTotalPaise: rounded,
    composition: composition !== undefined,
  };
  reconcile(breakup, chargedPaise);
  return breakup;
}

function assertStateCode(code: string, what: string): void {
  if (typeof code !== "string" || !STATE_CODE.test(code)) {
    throw new Error(
      `${what} must be a two-digit GST state code, got ${JSON.stringify(code)}`,
    );
  }
}

/**
 * The design is explicit and consistent across verticals: "Exchange value
 * deducted before GST", "Old-gold exchange deducted before tax", "Scheme
 * discount pre-tax". Discount comes off first, then tax applies to what's left.
 */
function taxableValueOf(line: LineItem, index: number): Paise {
  if (typeof line.qty !== "number" || !Number.isFinite(line.qty)) {
    throw new Error(`Line ${index}: qty must be a finite number`);
  }
  if (line.qty < 0) {
    throw new Error(`Line ${index}: qty must not be negative, got ${line.qty}`);
  }
  if (line.unitPricePaise < 0) {
    throw new Error(
      `Line ${index}: unitPricePaise must not be negative, got ${line.unitPricePaise}`,
    );
  }
  const discountPaise = line.discountPaise ?? 0;
  if (discountPaise < 0) {
    throw new Error(
      `Line ${index}: discountPaise must not be negative, got ${discountPaise}`,
    );
  }
  const gross = multiplyPaise(line.unitPricePaise, line.qty);
  const taxable = gross - discountPaise;
  if (taxable < 0) {
    throw new Error(
      `Line ${index}: discount exceeds line value (${discountPaise} > ${gross})`,
    );
  }
  return taxable;
}

/** No rate, no tax fields: a bill of supply may not print a breakup at all. */
function compositionLine(taxableValuePaise: Paise): LineTax {
  return {
    taxableValuePaise,
    rateBps: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    totalTaxPaise: 0,
    totalPaise: taxableValuePaise,
  };
}

function taxLine(
  config: BusinessTypeConfig,
  line: LineItem,
  index: number,
  taxableValuePaise: Paise,
  ctx: TaxContext,
): LineTax {
  const resolved = resolveRate(config, line, index, taxableValuePaise);
  const totalTaxPaise = applyBps(taxableValuePaise, resolved.bps);

  // Place of supply decides the split, never the supplier's own state alone.
  const intraState = ctx.supplierStateCode === ctx.placeOfSupplyStateCode;
  // allocate, not a halving: a 3-paise tax is CGST 2 + SGST 1. `/2` would
  // either lose the odd paisa or invent one.
  const [cgstPaise = 0, sgstPaise = 0] = intraState
    ? allocate(totalTaxPaise, [1, 1])
    : [0, 0];

  return {
    taxableValuePaise,
    rateBps: resolved.bps,
    cgstPaise,
    sgstPaise,
    igstPaise: intraState ? 0 : totalTaxPaise,
    totalTaxPaise,
    totalPaise: taxableValuePaise + totalTaxPaise,
    ...(resolved.appliedSlab !== undefined
      ? { appliedSlab: resolved.appliedSlab }
      : {}),
    ...(resolved.itcBlocked !== undefined
      ? { itcBlocked: resolved.itcBlocked }
      : {}),
  };
}

interface ResolvedRate {
  bps: Bps;
  appliedSlab?: string;
  itcBlocked?: boolean;
}

/**
 * Rate resolution: an item override wins, else the first matching slab, else
 * the vertical's default.
 *
 * The slab match runs even when an override supplies the rate, because the slab
 * carries two things the override cannot: the verbatim `applies` string the
 * "traced to source" GST view prints, and `itcBlocked`. A jewellery line whose
 * HSN rate arrives as an override still belongs to a slab.
 */
function resolveRate(
  config: BusinessTypeConfig,
  line: LineItem,
  index: number,
  taxableValuePaise: Paise,
): ResolvedRate {
  const values = predicateValues(line, taxableValuePaise);
  const slab = config.gst.slabs.find(
    (candidate) =>
      candidate.when !== undefined && evaluatePredicate(candidate.when, values),
  );

  const trace: ResolvedRate = {
    bps: 0,
    ...(slab !== undefined ? { appliedSlab: slab.applies } : {}),
    ...(slab?.itcBlocked !== undefined ? { itcBlocked: slab.itcBlocked } : {}),
  };

  if (line.gstBps !== undefined) {
    if (
      !Number.isInteger(line.gstBps) ||
      line.gstBps < 0 ||
      line.gstBps > 10_000
    ) {
      throw new Error(
        `Line ${index}: gstBps must be a whole number of basis points between 0 and 10000, got ${line.gstBps}`,
      );
    }
    return { ...trace, bps: line.gstBps };
  }

  const rate = slab?.rate ?? config.gst.default;
  return { ...trace, bps: bpsOf(rate, index, slab?.applies) };
}

/**
 * `hsn`, `igst` and `none` are not rates — they are instructions to look
 * elsewhere. Reaching here with one and no override means the caller never
 * supplied the item's rate, and guessing is not an option.
 */
function bpsOf(rate: GstRate, index: number, applies: string | undefined): Bps {
  const source =
    applies !== undefined ? ` (slab ${JSON.stringify(applies)})` : "";
  switch (rate.kind) {
    case "fixed":
      return rate.bps;
    case "range":
      return rate.bps;
    case "hsn":
      throw new Error(
        `Line ${index}${source}: rate comes from the item's HSN; supply gstBps on the line`,
      );
    case "igst":
      throw new Error(
        `Line ${index}${source}: this row is an inter-state split, not a rate; supply gstBps on the line`,
      );
    case "none":
      throw new Error(
        `Line ${index}${source}: this row is informational and carries no rate; supply gstBps on the line`,
      );
  }
}

/**
 * The design writes thresholds against amounts ("Tariff ≥ ₹7,500", "Sale value
 * ≥ ₹1,000"), which are not fields anyone types. The engine injects them.
 */
function predicateValues(
  line: LineItem,
  taxableValuePaise: Paise,
): Record<string, JsonValue> {
  return {
    ...(line.fields ?? {}),
    $unit_price_paise: line.unitPricePaise,
    $line_total_paise: taxableValuePaise,
    $qty: line.qty,
  };
}

/** The totals are the lines; if they ever disagree, the invoice is a lie. */
function reconcile(breakup: TaxBreakup, chargedPaise: Paise): void {
  const lineSum = sumPaise(...breakup.lines.map((l) => l.taxableValuePaise));
  if (lineSum !== breakup.taxableValuePaise) {
    throw new Error("Tax reconcile failed: taxable value does not match lines");
  }
  if (!breakup.composition) {
    const parts = sumPaise(
      breakup.cgstPaise,
      breakup.sgstPaise,
      breakup.igstPaise,
    );
    if (parts !== breakup.totalTaxPaise) {
      throw new Error(
        "Tax reconcile failed: CGST+SGST+IGST does not match tax",
      );
    }
    if (
      sumPaise(breakup.taxableValuePaise, breakup.totalTaxPaise) !==
      chargedPaise
    ) {
      throw new Error("Tax reconcile failed: line totals do not match");
    }
  }
  if (
    sumPaise(chargedPaise, breakup.roundOffPaise) !== breakup.grandTotalPaise
  ) {
    throw new Error("Tax reconcile failed: round-off does not match");
  }
}
