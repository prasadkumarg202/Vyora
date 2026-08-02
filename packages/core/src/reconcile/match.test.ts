import { describe, expect, it } from "vitest";

import {
  buildMatches,
  cellToPaise,
  extractReference,
  parseStatement,
  type ReconcileInvoice,
} from "./match";

describe("cellToPaise", () => {
  it("parses rupee-ish cells to paise", () => {
    expect(cellToPaise("1,200.00")).toBe(120000);
    expect(cellToPaise("₹1180")).toBe(118000);
    expect(cellToPaise("2500.00 Cr")).toBe(250000);
    expect(cellToPaise("")).toBe(0);
    expect(cellToPaise("abc")).toBe(0);
  });
});

describe("extractReference", () => {
  it("pulls a 12-digit UTR out of a note", () => {
    expect(extractReference("UPI/425011234567/GPay Ravi")).toBe("425011234567");
    expect(extractReference("NEFT 200411223344 Sharma")).toBe("200411223344");
  });
  it("ignores short numbers (invoice no, amount, date)", () => {
    expect(extractReference("UPI/INV-0007/Ravi 1180.00")).toBeNull();
    expect(extractReference("to INV-0005 on 18/07/2026")).toBeNull();
  });
  it("takes the longest run on ties/multiples", () => {
    expect(extractReference("ref 123456789 utr 1234567890123")).toBe("1234567890123");
  });
});

describe("parseStatement", () => {
  it("parses a headered CSV keeping only credits", () => {
    const txns = parseStatement(
      [
        "Date,Narration,Credit,Type",
        "18/07/2026,UPI/INV-0007/Ravi,1180.00,CR",
        "18/07/2026,ATM Withdrawal,,DR", // empty Credit cell -> skipped
      ].join("\n"),
    );
    expect(txns).toHaveLength(1);
    expect(txns[0]!.amountPaise).toBe(118000);
    expect(txns[0]!.note).toContain("INV-0007");
  });

  it("respects a Dr/Cr type column when there is a single Amount column", () => {
    const txns = parseStatement(
      ["Date,Description,Amount,Dr/Cr", "17/07,Sale,999.00,Cr", "17/07,Rent,5000.00,Dr"].join("\n"),
    );
    expect(txns.map((t) => t.amountPaise)).toEqual([99900]);
  });

  it("falls back to 'note, amount' with no header", () => {
    const txns = parseStatement("Ravi Kumar UPI, 1180\nGPay 2500");
    expect(txns).toHaveLength(2);
    expect(txns[0]!.amountPaise).toBe(118000);
    expect(txns[1]!.amountPaise).toBe(250000);
  });

  it("returns [] for empty input", () => {
    expect(parseStatement("")).toEqual([]);
    expect(parseStatement("   \n  ")).toEqual([]);
  });
});

const inv = (id: string, number: string | null, total: number, paid = 0): ReconcileInvoice => ({
  id,
  number,
  totalPaise: total,
  amountPaidPaise: paid,
});

describe("buildMatches", () => {
  const openInvoices = [
    inv("a", "INV-0007", 118000), // balance 1180.00
    inv("b", "INV-0005", 250000, 100000), // balance 1500.00
    inv("c", "INV-0009", 99900), // balance 999.00
  ];

  it("matches by invoice ref + exact amount as 'exact'", () => {
    const { matched } = buildMatches({
      txns: parseStatement("Note,Credit\nUPI/INV-0007/Ravi,1180.00"),
      openInvoices,
    });
    expect(matched).toHaveLength(1);
    expect(matched[0]!.invoiceId).toBe("a");
    expect(matched[0]!.confidence).toBe("exact");
    expect(matched[0]!.applyPaise).toBe(118000);
  });

  it("matches by ref with a differing amount as 'ref' (part payment), capped at balance", () => {
    const { matched } = buildMatches({
      txns: parseStatement("Note,Credit\nUPI/INV-0005/Sharma,1000.00"),
      openInvoices,
    });
    expect(matched[0]!.invoiceId).toBe("b");
    expect(matched[0]!.confidence).toBe("ref");
    expect(matched[0]!.applyPaise).toBe(100000); // 1000, below the 1500 balance
  });

  it("matches a unique balance with no ref as 'amount'", () => {
    const { matched } = buildMatches({
      txns: parseStatement("Note,Credit\nGPay payment,999.00"),
      openInvoices,
    });
    expect(matched[0]!.invoiceId).toBe("c");
    expect(matched[0]!.confidence).toBe("amount");
  });

  it("does NOT amount-match when two invoices share the same balance (ambiguous)", () => {
    const two = [inv("x", null, 50000), inv("y", null, 50000)];
    const { matched, unmatched } = buildMatches({
      txns: parseStatement("Note,Credit\nsomeone,500.00"),
      openInvoices: two,
    });
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it("claims each invoice at most once", () => {
    const { matched } = buildMatches({
      txns: parseStatement("Note,Credit\nUPI/INV-0007,1180.00\nUPI/INV-0007 again,1180.00"),
      openInvoices,
    });
    expect(matched).toHaveLength(1); // second credit finds the invoice already used
  });

  it("skips a credit whose reference was already reconciled (idempotency)", () => {
    const text = "Note,Credit\nUPI/INV-0007/Ravi 425011234567,1180.00";
    const txns = parseStatement(text);
    expect(txns[0]!.reference).toBe("425011234567");

    // First run applies it; caller records the reference.
    const first = buildMatches({ txns, openInvoices });
    expect(first.matched).toHaveLength(1);

    // Re-importing the same statement line — now the reference is known.
    const second = buildMatches({
      txns,
      openInvoices,
      reconciledRefs: new Set(["425011234567"]),
    });
    expect(second.matched).toHaveLength(0);
    expect(second.alreadyReconciled).toHaveLength(1);
  });

  it("still matches ref-less credits (no idempotency key to dedupe on)", () => {
    const txns = parseStatement("Note,Credit\nGPay payment,999.00");
    expect(txns[0]!.reference).toBeNull();
    const { matched } = buildMatches({ txns, openInvoices, reconciledRefs: new Set(["x"]) });
    expect(matched).toHaveLength(1);
  });
});
