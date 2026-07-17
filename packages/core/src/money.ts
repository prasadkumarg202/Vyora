import type { Bps, Paise } from "./types";

/**
 * Integer-paise arithmetic. Every rupee amount in the system lives here as a
 * safe integer; no other module may multiply money.
 *
 * The rules that shape this file:
 *  - IEEE-754 cannot represent 0.1, so a rupee float is already wrong before we
 *    round it. Values enter as strings or integers and never leave as floats.
 *  - Products go through BigInt. A crore-scale invoice times 2800 bps overflows
 *    nothing, but the same expression a year from now on a lakh-crore turnover
 *    report would, and a silently wrong total is worse than a thrown error.
 *  - Rounding is half away from zero (2.5 -> 3, -2.5 -> -3), the Indian tax
 *    convention. Banker's rounding would under-collect on a .50 paise line.
 */

const BPS_DENOMINATOR = 10_000n;
const PAISE_PER_RUPEE = 100n;

/**
 * A multiplier with more fractional digits than this is float noise from
 * upstream (0.1 * 3 -> 0.30000000000000004), not a quantity anyone typed.
 * Six covers per-gram jewellery and loose-weight grocery with room to spare.
 */
const MAX_FACTOR_DECIMALS = 6;

const RUPEE_PREFIX = /^(?:₹|rs\.?|inr)/i;
const RUPEE_BODY = /^(\d+)(?:\.(\d{1,2}))?$/;

function assertPaise(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${what} must be a finite number, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be a whole number, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${what} is outside the safe integer range: ${value}`);
  }
}

function toSafeNumber(value: bigint, what: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${what} overflows the safe integer range: ${value}`);
  }
  return n;
}

/** Half away from zero. `denominator` must be positive. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Splits a number into an exact integer mantissa and a decimal scale via its
 * shortest round-trip string, so 7500.5 is 75005e-1 and not 7500.499999….
 */
function decomposeDecimal(
  value: number,
  what: string,
  maxDecimals: number,
): { mantissa: bigint; scale: number } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${what} must be a finite number, got ${String(value)}`);
  }
  const text = String(value);
  // Exponential notation only appears outside the range money represents
  // exactly — either too large to be a real amount or below a micro-unit.
  if (text.includes("e") || text.includes("E")) {
    throw new Error(
      `${what} is outside the exactly representable range: ${text}`,
    );
  }
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  const dot = digits.indexOf(".");
  const whole = dot === -1 ? digits : digits.slice(0, dot);
  const frac = dot === -1 ? "" : digits.slice(dot + 1);
  if (frac.length > maxDecimals) {
    throw new Error(
      `${what} carries more than ${maxDecimals} decimal places (${text})`,
    );
  }
  const mantissa = BigInt(whole + frac);
  return { mantissa: negative ? -mantissa : mantissa, scale: frac.length };
}

/** ₹7,500 -> 750000. Rejects sub-paise precision rather than rounding it away. */
export function rupeesToPaise(rupees: number): Paise {
  const { mantissa, scale } = decomposeDecimal(rupees, "rupees", 2);
  return toSafeNumber(mantissa * 10n ** BigInt(2 - scale), "paise");
}

/** For display and JSON interop only — the result is a float again. */
export function paiseToRupees(paise: Paise): number {
  assertPaise(paise, "paise");
  return paise / 100;
}

/** Tolerates what an operator or a pasted design string actually contains. */
export function parseRupees(input: string): Paise {
  if (typeof input !== "string") {
    throw new Error(`Not a rupee amount: ${String(input)}`);
  }
  const compact = input.trim().replace(/[\s\u00a0,]/g, "");
  let rest = compact;
  let negative = false;
  if (rest.startsWith("-") || rest.startsWith("+")) {
    negative = rest.startsWith("-");
    rest = rest.slice(1);
  }
  rest = rest.replace(RUPEE_PREFIX, "");
  const match = RUPEE_BODY.exec(rest);
  if (!match) {
    throw new Error(`Not a rupee amount: ${JSON.stringify(input)}`);
  }
  const whole = match[1]!;
  const frac = (match[2] ?? "").padEnd(2, "0");
  const paise = BigInt(whole + frac);
  return toSafeNumber(negative ? -paise : paise, "paise");
}

/** Indian grouping: ₹1,00,000.00, not ₹100,000.00. The invoice shows this. */
export function formatPaise(paise: Paise): string {
  assertPaise(paise, "paise");
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const fraction = abs % 100;
  const sign = negative ? "-" : "";
  return `${sign}₹${groupIndian(String(rupees))}.${String(fraction).padStart(2, "0")}`;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const lead = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${lead},${last3}`;
}

/**
 * The only multiplication path for tax. 18% of ₹7,500 is applyBps(750000, 1800).
 */
export function applyBps(amount: Paise, bps: Bps): Paise {
  assertPaise(amount, "amount");
  assertPaise(bps, "bps");
  if (bps < 0) {
    throw new Error(`bps must not be negative, got ${bps}`);
  }
  return toSafeNumber(
    divideRoundHalfUp(BigInt(amount) * BigInt(bps), BPS_DENOMINATOR),
    "tax",
  );
}

/** Exact qty × price. `factor` may be fractional (1.5 kg, 8.25 g of gold). */
export function multiplyPaise(amount: Paise, factor: number): Paise {
  assertPaise(amount, "amount");
  const { mantissa, scale } = decomposeDecimal(
    factor,
    "factor",
    MAX_FACTOR_DECIMALS,
  );
  return toSafeNumber(
    divideRoundHalfUp(BigInt(amount) * mantissa, 10n ** BigInt(scale)),
    "product",
  );
}

export function sumPaise(...parts: Paise[]): Paise {
  let total = 0n;
  parts.forEach((part, index) => {
    assertPaise(part, `parts[${index}]`);
    total += BigInt(part);
  });
  return toSafeNumber(total, "sum");
}

/** `delta` is signed and never exceeds ±50 paise: what the invoice prints. */
export function roundToNearestRupee(paise: Paise): {
  rounded: Paise;
  delta: Paise;
} {
  assertPaise(paise, "paise");
  const rounded = toSafeNumber(
    divideRoundHalfUp(BigInt(paise), PAISE_PER_RUPEE) * PAISE_PER_RUPEE,
    "rounded",
  );
  return { rounded, delta: rounded - paise };
}

/**
 * Largest-remainder split: the parts always sum to exactly `total`, so halving
 * an odd tax into CGST/SGST loses nothing. 3 paise -> [2, 1], never [1, 1] or
 * [2, 2]. Ties go to the earlier weight, which puts the spare paisa on CGST.
 */
export function allocate(total: Paise, weights: number[]): Paise[] {
  assertPaise(total, "total");
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error("allocate needs at least one weight");
  }
  let weightSum = 0;
  weights.forEach((weight, index) => {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new Error(
        `weights[${index}] must be a non-negative finite number, got ${String(weight)}`,
      );
    }
    weightSum += weight;
  });
  if (weightSum <= 0) {
    throw new Error("allocate needs weights that sum to more than zero");
  }

  const entries = weights.map((weight, index) => {
    const raw = (total * weight) / weightSum;
    if (!Number.isSafeInteger(Math.trunc(raw))) {
      throw new Error(`allocate overflows on weights[${index}]`);
    }
    const base = Math.floor(raw);
    return { index, base, remainder: raw - base };
  });

  // Every base is floored, so the shortfall is a whole number of paise smaller
  // than the number of parts; hand one paisa to each largest remainder.
  const shortfall = total - entries.reduce((acc, e) => acc + e.base, 0);
  [...entries]
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach((entry, rank) => {
      if (rank < shortfall) entry.base += 1;
    });

  return entries.map((entry) => entry.base);
}
