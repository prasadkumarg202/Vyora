import type { Bps, CompositionScheme, GstRate } from "../types";

/**
 * The design stores GST rates as display text — "12%", "0–5%", "As per HSN",
 * "5% (no ITC)", "—". This turns each into exactly one `GstRate`.
 *
 * Nothing here falls back. An unrecognised rate string means the seed data and
 * this parser have drifted apart, and the only safe response is to refuse to
 * build the config: a silent default would ship a wrong tax rate to a real till.
 */

/** The design uses EN DASH (U+2013) for spans and EM DASH (U+2014) for "n/a". */
const EN_DASH = "–";
const EM_DASH = "—";

const NO_ITC = /\(no\s+itc\)$/i;
/** Group 1 is the whole percent, group 2 the optional fraction. */
const PERCENT = /^(\d+)(?:\.(\d{1,2}))?%$/;
const RANGE = new RegExp(
  `^(\\d+)(?:\\.(\\d{1,2}))?\\s*[-${EN_DASH}${EM_DASH}]\\s*(\\d+)(?:\\.(\\d{1,2}))?%$`,
);
const COMPOSITION = /^composition\b\s*(.*)$/i;

export interface ParsedRate {
  rate: GstRate;
  /** "5% (no ITC)" — restaurants forfeit input credit on that slab. */
  itcBlocked: boolean;
}

/**
 * A rate string may carry an ITC marker the rate itself cannot express; the
 * caller (compute) records it on the line. `parseRate` drops it.
 */
export function parseRateWithItc(s: string): ParsedRate {
  if (typeof s !== "string") {
    throw new Error(`Unrecognised GST rate: ${String(s)}`);
  }
  const normalised = normalise(s);
  const itcBlocked = NO_ITC.test(normalised);
  const body = itcBlocked ? normalised.replace(NO_ITC, "").trim() : normalised;
  return { rate: parseRateBody(body, s), itcBlocked };
}

export function parseRate(s: string): GstRate {
  return parseRateWithItc(s).rate;
}

function parseRateBody(body: string, original: string): GstRate {
  if (body === EM_DASH || body === EN_DASH || body === "-") {
    return { kind: "none" };
  }
  if (/^igst$/i.test(body)) {
    return { kind: "igst" };
  }
  if (/^as\s+per\s+hsn$/i.test(body)) {
    return { kind: "hsn" };
  }

  const composition = COMPOSITION.exec(body);
  if (composition) {
    return { kind: "fixed", bps: compositionBps(composition[1]!, original) };
  }

  const range = RANGE.exec(body);
  if (range) {
    const minBps = percentToBps(range[1]!, range[2], original);
    const maxBps = percentToBps(range[3]!, range[4], original);
    if (minBps > maxBps) {
      throw new Error(
        `GST rate range runs backwards: ${JSON.stringify(original)}`,
      );
    }
    // A span means "depends on the item's HSN", and the engine has to bill
    // something before anyone supplies that HSN. It bills the ceiling.
    //
    // The two errors are not symmetric. Charging the maximum and being wrong is
    // visible on the invoice, refundable, and the customer complains the same
    // day. Charging the minimum and being wrong is invisible: the dealer under-
    // collects, discovers it at the annual return, and pays the shortfall plus
    // interest out of pocket — the customer is long gone. So the default is
    // maxBps, and `minBps`/`maxBps` are kept so the UI can show the span and
    // demand a per-item override, which is the real fix.
    return { kind: "range", minBps, maxBps, bps: maxBps };
  }

  const percent = PERCENT.exec(body);
  if (percent) {
    return {
      kind: "fixed",
      bps: percentToBps(percent[1]!, percent[2], original),
    };
  }

  throw new Error(`Unrecognised GST rate: ${JSON.stringify(original)}`);
}

/**
 * `gstDefault` is "Composition 1%" for kirana and a plain rate everywhere else;
 * only the former makes the dealer a composition dealer.
 */
export function parseComposition(
  defaultLabel: string,
): CompositionScheme | undefined {
  if (typeof defaultLabel !== "string") {
    throw new Error(`Unrecognised GST default: ${String(defaultLabel)}`);
  }
  const match = COMPOSITION.exec(normalise(defaultLabel));
  if (!match) return undefined;
  return { rateBps: compositionBps(match[1]!, defaultLabel) };
}

function compositionBps(rest: string, original: string): Bps {
  const percent = PERCENT.exec(rest.trim());
  if (!percent) {
    throw new Error(
      `Composition scheme without a readable rate: ${JSON.stringify(original)}`,
    );
  }
  return percentToBps(percent[1]!, percent[2], original);
}

/**
 * "12" + "5" -> 1250, without ever touching a float. Both parts come straight
 * from PERCENT/RANGE capture groups, so they are already known to be digits.
 */
function percentToBps(
  whole: string,
  fraction: string | undefined,
  original: string,
): Bps {
  const bps = Number(whole) * 100 + Number((fraction ?? "").padEnd(2, "0"));
  if (bps > 10_000) {
    throw new Error(`GST rate above 100%: ${JSON.stringify(original)}`);
  }
  return bps;
}

/** Design strings arrive with NBSPs and stray spacing from the HTML; the
 * ECMAScript \s class already covers U+00A0, so this collapses those too. */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
