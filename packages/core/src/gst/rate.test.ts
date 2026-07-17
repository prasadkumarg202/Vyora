import { describe, expect, it } from "vitest";
import { parseComposition, parseRate, parseRateWithItc } from "./rate";

describe("parseRate", () => {
  it("reads every plain percent the design shows", () => {
    expect(parseRate("0%")).toEqual({ kind: "fixed", bps: 0 });
    expect(parseRate("1%")).toEqual({ kind: "fixed", bps: 100 });
    expect(parseRate("3%")).toEqual({ kind: "fixed", bps: 300 });
    expect(parseRate("5%")).toEqual({ kind: "fixed", bps: 500 });
    expect(parseRate("12%")).toEqual({ kind: "fixed", bps: 1200 });
    expect(parseRate("18%")).toEqual({ kind: "fixed", bps: 1800 });
    expect(parseRate("28%")).toEqual({ kind: "fixed", bps: 2800 });
  });

  it("reads every span the design shows, defaulting to the ceiling", () => {
    expect(parseRate("0–5%")).toEqual({
      kind: "range",
      minBps: 0,
      maxBps: 500,
      bps: 500,
    });
    expect(parseRate("5–18%")).toEqual({
      kind: "range",
      minBps: 500,
      maxBps: 1800,
      bps: 1800,
    });
    expect(parseRate("12–18%")).toEqual({
      kind: "range",
      minBps: 1200,
      maxBps: 1800,
      bps: 1800,
    });
    expect(parseRate("18–28%")).toEqual({
      kind: "range",
      minBps: 1800,
      maxBps: 2800,
      bps: 2800,
    });
    expect(parseRate("5–28%")).toEqual({
      kind: "range",
      minBps: 500,
      maxBps: 2800,
      bps: 2800,
    });
    expect(parseRate("0–28%")).toEqual({
      kind: "range",
      minBps: 0,
      maxBps: 2800,
      bps: 2800,
    });
  });

  it("reads the non-rate rows", () => {
    expect(parseRate("As per HSN")).toEqual({ kind: "hsn" });
    expect(parseRate("IGST")).toEqual({ kind: "igst" });
    expect(parseRate("—")).toEqual({ kind: "none" });
  });

  it("reads the composition label as the rate it is", () => {
    expect(parseRate("Composition 1%")).toEqual({ kind: "fixed", bps: 100 });
  });

  it("reads a blocked-ITC rate as its rate", () => {
    expect(parseRate("5% (no ITC)")).toEqual({ kind: "fixed", bps: 500 });
  });

  it("accepts fractional percents", () => {
    expect(parseRate("12.5%")).toEqual({ kind: "fixed", bps: 1250 });
    expect(parseRate("0.25%")).toEqual({ kind: "fixed", bps: 25 });
    expect(parseRate("1.5%")).toEqual({ kind: "fixed", bps: 150 });
  });

  it("tolerates the whitespace and dash variants the HTML carries", () => {
    expect(parseRate("  18%  ")).toEqual({ kind: "fixed", bps: 1800 });
    expect(parseRate("12 – 18%")).toEqual({
      kind: "range",
      minBps: 1200,
      maxBps: 1800,
      bps: 1800,
    });
    expect(parseRate("12-18%")).toEqual({
      kind: "range",
      minBps: 1200,
      maxBps: 1800,
      bps: 1800,
    });
    expect(parseRate("as per hsn")).toEqual({ kind: "hsn" });
    expect(parseRate("igst")).toEqual({ kind: "igst" });
    expect(parseRate("–")).toEqual({ kind: "none" });
    expect(parseRate("-")).toEqual({ kind: "none" });
  });

  it("throws rather than guess", () => {
    expect(() => parseRate("")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("12")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("twelve percent")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("12%%")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("GST 12%")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("12.345%")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("-5%")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate("As per SAC")).toThrow(/Unrecognised GST rate/);
    expect(() => parseRate(null as unknown as string)).toThrow(
      /Unrecognised GST rate/,
    );
    expect(() => parseRate(12 as unknown as string)).toThrow(
      /Unrecognised GST rate/,
    );
  });

  it("throws on a rate that cannot exist", () => {
    expect(() => parseRate("120%")).toThrow(/above 100%/);
    expect(() => parseRate("18–12%")).toThrow(/runs backwards/);
  });
});

describe("parseRateWithItc", () => {
  it("splits the ITC marker off the restaurant rate", () => {
    expect(parseRateWithItc("5% (no ITC)")).toEqual({
      rate: { kind: "fixed", bps: 500 },
      itcBlocked: true,
    });
  });

  it("reports no block for an ordinary rate", () => {
    expect(parseRateWithItc("18%")).toEqual({
      rate: { kind: "fixed", bps: 1800 },
      itcBlocked: false,
    });
    expect(parseRateWithItc("—")).toEqual({
      rate: { kind: "none" },
      itcBlocked: false,
    });
  });

  it("tolerates the marker's spacing and case", () => {
    expect(parseRateWithItc("5%  (No ITC)").itcBlocked).toBe(true);
    expect(parseRateWithItc("12–18% (no itc)")).toEqual({
      rate: { kind: "range", minBps: 1200, maxBps: 1800, bps: 1800 },
      itcBlocked: true,
    });
  });

  it("still throws when the rate under the marker is unreadable", () => {
    expect(() => parseRateWithItc("cheap (no ITC)")).toThrow(
      /Unrecognised GST rate/,
    );
  });
});

describe("parseComposition", () => {
  it("reads the kirana default", () => {
    expect(parseComposition("Composition 1%")).toEqual({ rateBps: 100 });
  });

  it("tolerates case and spacing", () => {
    expect(parseComposition("  composition  1%  ")).toEqual({ rateBps: 100 });
    expect(parseComposition("COMPOSITION 6%")).toEqual({ rateBps: 600 });
  });

  it("returns undefined for every non-composition default", () => {
    expect(parseComposition("12%")).toBeUndefined();
    expect(parseComposition("5%")).toBeUndefined();
    expect(parseComposition("3%")).toBeUndefined();
    expect(parseComposition("18%")).toBeUndefined();
    expect(parseComposition("As per HSN")).toBeUndefined();
    expect(parseComposition("")).toBeUndefined();
  });

  it("throws on a composition label whose rate it cannot read", () => {
    expect(() => parseComposition("Composition")).toThrow(
      /without a readable rate/,
    );
    expect(() => parseComposition("Composition one percent")).toThrow(
      /without a readable rate/,
    );
    expect(() => parseComposition(null as unknown as string)).toThrow(
      /Unrecognised GST default/,
    );
  });
});

describe("the design's rate vocabulary", () => {
  // Every distinct string in design/business_types seed data. If the seed grows
  // a new one, this list and the parser must both learn it — that is the point.
  const vocabulary = [
    "12%",
    "5%",
    "3%",
    "18%",
    "28%",
    "0%",
    "1%",
    "0–5%",
    "12–18%",
    "18–28%",
    "5–28%",
    "5–18%",
    "0–28%",
    "5% (no ITC)",
    "As per HSN",
    "IGST",
    "—",
    "Composition 1%",
  ];

  it.each(vocabulary)("parses %s", (s) => {
    expect(() => parseRateWithItc(s)).not.toThrow();
  });
});
