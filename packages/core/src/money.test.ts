import { describe, expect, it } from "vitest";
import {
  allocate,
  applyBps,
  formatPaise,
  multiplyPaise,
  paiseToRupees,
  parseRupees,
  roundToNearestRupee,
  rupeesToPaise,
  sumPaise,
} from "./money";

describe("rupeesToPaise", () => {
  it("converts whole and fractional rupees exactly", () => {
    expect(rupeesToPaise(7500)).toBe(750000);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(1000.5)).toBe(100050);
    expect(rupeesToPaise(0.01)).toBe(1);
    expect(rupeesToPaise(-250.75)).toBe(-25075);
  });

  it("does not inherit float error", () => {
    // 1.15 * 100 is 114.99999999999999 in IEEE-754, so a naive truncation
    // yields 114 paise. The string path never sees the error.
    expect(rupeesToPaise(1.15)).toBe(115);
    expect(rupeesToPaise(8.29)).toBe(829);
  });

  it("rejects sub-paise precision rather than rounding it away", () => {
    expect(() => rupeesToPaise(1000.505)).toThrow(/decimal places/);
    // Float noise from upstream arithmetic is a bug, not an amount.
    expect(() => rupeesToPaise(0.1 + 0.2)).toThrow(/decimal places/);
  });

  it("rejects NaN, Infinity and non-numbers", () => {
    expect(() => rupeesToPaise(NaN)).toThrow(/finite number/);
    expect(() => rupeesToPaise(Infinity)).toThrow(/finite number/);
    expect(() => rupeesToPaise(-Infinity)).toThrow(/finite number/);
    expect(() => rupeesToPaise("7500" as unknown as number)).toThrow(
      /finite number/,
    );
  });

  it("rejects magnitudes outside the exactly representable range", () => {
    expect(() => rupeesToPaise(1e21)).toThrow(/representable range/);
  });

  it("rejects a result beyond the safe integer range", () => {
    expect(() => rupeesToPaise(1e18)).toThrow(/safe integer range/);
  });
});

describe("paiseToRupees", () => {
  it("returns rupees for display", () => {
    expect(paiseToRupees(750000)).toBe(7500);
    expect(paiseToRupees(100050)).toBe(1000.5);
    expect(paiseToRupees(-1)).toBe(-0.01);
  });

  it("rejects fractional paise", () => {
    expect(() => paiseToRupees(10.5)).toThrow(/whole number/);
  });
});

describe("parseRupees", () => {
  it("accepts what the design and operators actually type", () => {
    expect(parseRupees("₹7,500")).toBe(750000);
    expect(parseRupees("1,000.50")).toBe(100050);
    expect(parseRupees("7500")).toBe(750000);
    expect(parseRupees("  ₹ 1,00,000.00  ")).toBe(10000000);
    expect(parseRupees("Rs. 250")).toBe(25000);
    expect(parseRupees("Rs250")).toBe(25000);
    expect(parseRupees("INR 99.9")).toBe(9990);
    expect(parseRupees("₹0")).toBe(0);
  });

  it("handles signs", () => {
    expect(parseRupees("-₹500")).toBe(-50000);
    expect(parseRupees("+₹500")).toBe(50000);
    expect(parseRupees("-1,000.50")).toBe(-100050);
  });

  it("handles non-breaking spaces from the design HTML", () => {
    expect(parseRupees("₹ 7,500")).toBe(750000);
  });

  it("throws on anything it cannot read exactly", () => {
    expect(() => parseRupees("")).toThrow(/Not a rupee amount/);
    expect(() => parseRupees("₹")).toThrow(/Not a rupee amount/);
    expect(() => parseRupees("abc")).toThrow(/Not a rupee amount/);
    expect(() => parseRupees("7,500 only")).toThrow(/Not a rupee amount/);
    expect(() => parseRupees("1000.505")).toThrow(/Not a rupee amount/);
    expect(() => parseRupees("₹1.2.3")).toThrow(/Not a rupee amount/);
    expect(() => parseRupees(7500 as unknown as string)).toThrow(
      /Not a rupee amount/,
    );
  });

  it("throws rather than losing precision on absurd amounts", () => {
    expect(() => parseRupees("999999999999999999999")).toThrow(
      /safe integer range/,
    );
  });
});

describe("formatPaise", () => {
  it("groups the Indian way", () => {
    expect(formatPaise(10000000)).toBe("₹1,00,000.00");
    expect(formatPaise(750000)).toBe("₹7,500.00");
    expect(formatPaise(100050)).toBe("₹1,000.50");
    expect(formatPaise(99900)).toBe("₹999.00");
    expect(formatPaise(0)).toBe("₹0.00");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(1234567890)).toBe("₹1,23,45,678.90");
  });

  it("formats a crore exactly", () => {
    expect(formatPaise(rupeesToPaise(10000000))).toBe("₹1,00,00,000.00");
  });

  it("signs negatives outside the symbol", () => {
    expect(formatPaise(-100050)).toBe("-₹1,000.50");
    expect(formatPaise(-5)).toBe("-₹0.05");
  });

  it("rejects fractional paise", () => {
    expect(() => formatPaise(1.5)).toThrow(/whole number/);
  });
});

describe("applyBps", () => {
  it("computes the GST rates the verticals actually use", () => {
    expect(applyBps(750000, 1800)).toBe(135000); // 18% of ₹7,500
    expect(applyBps(750000, 1200)).toBe(90000);
    expect(applyBps(5000000, 300)).toBe(150000); // 3% jewellery on ₹50,000
    expect(applyBps(120000, 500)).toBe(6000); // 5% restaurant on ₹1,200
    expect(applyBps(100000, 2800)).toBe(28000);
    expect(applyBps(123456, 0)).toBe(0);
    expect(applyBps(0, 1800)).toBe(0);
  });

  it("rounds half up at exactly .5 paise", () => {
    // 5% of 10 paise is 0.5 paise exactly.
    expect(applyBps(10, 500)).toBe(1);
    // 1% of 50 paise is 0.5 paise exactly.
    expect(applyBps(50, 100)).toBe(1);
    // 2.5 paise exactly.
    expect(applyBps(50, 500)).toBe(3);
    // Just below and just above the half.
    expect(applyBps(9, 500)).toBe(0);
    expect(applyBps(11, 500)).toBe(1);
  });

  it("rounds negatives symmetrically, away from zero", () => {
    expect(applyBps(-10, 500)).toBe(-1);
    expect(applyBps(-50, 500)).toBe(-3);
    expect(applyBps(-9, 500)).toBe(0);
  });

  it("stays exact at crore scale", () => {
    // ₹1,00,00,000 at 28%.
    expect(applyBps(1000000000, 2800)).toBe(280000000);
    // ₹99,99,999.99 at 18% is 179999999.82 paise, which rounds up.
    expect(applyBps(999999999, 1800)).toBe(180000000);
  });

  it("rejects an integer too large to be exact", () => {
    // 2^53: a whole number, but the next integer up does not exist in a double.
    expect(() => applyBps(9007199254740992, 100)).toThrow(/safe integer range/);
  });

  it("rejects a fractional or negative rate", () => {
    expect(() => applyBps(1000, 18.5)).toThrow(/whole number/);
    expect(() => applyBps(1000, -100)).toThrow(/must not be negative/);
    expect(() => applyBps(1000.5, 1800)).toThrow(/whole number/);
    expect(() => applyBps(NaN, 1800)).toThrow(/finite number/);
  });
});

describe("multiplyPaise", () => {
  it("multiplies by whole and fractional quantities exactly", () => {
    expect(multiplyPaise(750000, 3)).toBe(2250000);
    expect(multiplyPaise(750000, 1)).toBe(750000);
    expect(multiplyPaise(750000, 0)).toBe(0);
    // ₹5,200/g of gold over 8.25 g.
    expect(multiplyPaise(520000, 8.25)).toBe(4290000);
    // 1.5 kg at ₹49.90/kg.
    expect(multiplyPaise(4990, 1.5)).toBe(7485);
  });

  it("rounds half up on a fractional paisa", () => {
    expect(multiplyPaise(1, 0.5)).toBe(1);
    expect(multiplyPaise(3, 0.5)).toBe(2);
    expect(multiplyPaise(1, 0.4)).toBe(0);
    expect(multiplyPaise(-1, 0.5)).toBe(-1);
  });

  it("rejects float noise masquerading as a quantity", () => {
    expect(() => multiplyPaise(1000, 0.1 + 0.2)).toThrow(/decimal places/);
    expect(() => multiplyPaise(1000, NaN)).toThrow(/finite number/);
    expect(() => multiplyPaise(1000.5, 2)).toThrow(/whole number/);
  });

  it("throws rather than overflow", () => {
    expect(() => multiplyPaise(1000000000000, 100000)).toThrow(
      /safe integer range/,
    );
  });
});

describe("sumPaise", () => {
  it("sums", () => {
    expect(sumPaise()).toBe(0);
    expect(sumPaise(100, 250, -50)).toBe(300);
    expect(sumPaise(...[1, 2, 3])).toBe(6);
  });

  it("stays exact across a crore-scale invoice", () => {
    const lines = Array.from({ length: 1000 }, () => 999999);
    expect(sumPaise(...lines)).toBe(999999000);
  });

  it("names the offending part", () => {
    expect(() => sumPaise(100, 1.5)).toThrow(/parts\[1\]/);
  });
});

describe("roundToNearestRupee", () => {
  it("rounds down below the half", () => {
    expect(roundToNearestRupee(12349)).toEqual({ rounded: 12300, delta: -49 });
  });

  it("rounds up above the half", () => {
    expect(roundToNearestRupee(12351)).toEqual({ rounded: 12400, delta: 49 });
  });

  it("rounds up at exactly fifty paise", () => {
    expect(roundToNearestRupee(12350)).toEqual({ rounded: 12400, delta: 50 });
  });

  it("leaves an exact rupee alone", () => {
    expect(roundToNearestRupee(12300)).toEqual({ rounded: 12300, delta: 0 });
    expect(roundToNearestRupee(0)).toEqual({ rounded: 0, delta: 0 });
  });

  it("is symmetric for negatives", () => {
    expect(roundToNearestRupee(-12350)).toEqual({
      rounded: -12400,
      delta: -50,
    });
    expect(roundToNearestRupee(-12349)).toEqual({ rounded: -12300, delta: 49 });
  });

  it("never moves more than fifty paise", () => {
    for (let paise = 0; paise <= 400; paise += 1) {
      const { rounded, delta } = roundToNearestRupee(paise);
      expect(Math.abs(delta)).toBeLessThanOrEqual(50);
      expect(rounded - paise).toBe(delta);
      expect(rounded % 100).toBe(0);
    }
  });

  it("rejects fractional paise", () => {
    expect(() => roundToNearestRupee(0.5)).toThrow(/whole number/);
  });
});

describe("allocate", () => {
  it("splits an odd tax without losing a paisa", () => {
    expect(allocate(3, [1, 1])).toEqual([2, 1]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(4, [1, 1])).toEqual([2, 2]);
    expect(allocate(0, [1, 1])).toEqual([0, 0]);
  });

  it("always sums to the total, for every odd tax up to a rupee", () => {
    for (let tax = 0; tax <= 100; tax += 1) {
      const parts = allocate(tax, [1, 1]);
      expect(sumPaise(...parts)).toBe(tax);
      expect(Math.abs((parts[0] ?? 0) - (parts[1] ?? 0))).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it("honours uneven weights by largest remainder", () => {
    expect(allocate(100, [1, 2, 3])).toEqual([17, 33, 50]);
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(sumPaise(...allocate(10, [1, 1, 1]))).toBe(10);
  });

  it("gives everything to the only weight", () => {
    expect(allocate(999, [7])).toEqual([999]);
  });

  it("ignores zero weights", () => {
    expect(allocate(10, [1, 0, 1])).toEqual([5, 0, 5]);
  });

  it("keeps the sum exact for a negative total", () => {
    expect(sumPaise(...allocate(-3, [1, 1]))).toBe(-3);
  });

  it("stays exact at crore scale", () => {
    const total = 280000001; // 28% of ₹1,00,00,000.0035, an odd paisa
    const parts = allocate(total, [1, 1]);
    expect(sumPaise(...parts)).toBe(total);
    expect(parts).toEqual([140000001, 140000000]);
  });

  it("rejects weights it cannot split by", () => {
    expect(() => allocate(100, [])).toThrow(/at least one weight/);
    expect(() => allocate(100, [0, 0])).toThrow(/sum to more than zero/);
    expect(() => allocate(100, [1, -1])).toThrow(/weights\[1\]/);
    expect(() => allocate(100, [1, NaN])).toThrow(/weights\[1\]/);
    expect(() => allocate(100, [1, Infinity])).toThrow(/weights\[1\]/);
    expect(() => allocate(100, ["1" as unknown as number])).toThrow(
      /weights\[0\]/,
    );
    expect(() => allocate(100, null as unknown as number[])).toThrow(
      /at least one weight/,
    );
    expect(() => allocate(1.5, [1, 1])).toThrow(/whole number/);
  });

  it("throws rather than allocate an unrepresentable share", () => {
    expect(() => allocate(9007199254740991, [1e300, 1])).toThrow(/overflows/);
  });
});
