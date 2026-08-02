import { describe, expect, it } from "vitest";

import { buildMatches, type ReconcileInvoice } from "./match";
import {
  gatewayPaymentsToTxns,
  normalizeCashfreePayment,
  normalizeRazorpayPayment,
} from "./gateway";

describe("normalizeRazorpayPayment", () => {
  const entity = {
    id: "pay_MNo1abcd1234",
    amount: 118000, // paise
    currency: "INR",
    status: "captured",
    method: "upi",
    acquirer_data: { rrn: "227522297540", upi_transaction_id: "4251XYZ" },
    notes: { invoice_number: "INV-0007" },
    created_at: 1_752_800_000,
  };

  it("maps paise, RRN reference, invoice note and success status", () => {
    const p = normalizeRazorpayPayment(entity);
    expect(p.amountPaise).toBe(118000);
    expect(p.reference).toBe("227522297540");
    expect(p.invoiceRef).toBe("INV-0007");
    expect(p.method).toBe("upi");
    expect(p.status).toBe("success");
    expect(p.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("marks non-captured payments as 'other'", () => {
    expect(normalizeRazorpayPayment({ ...entity, status: "failed" }).status).toBe("other");
  });

  it("falls back to description when notes carry no invoice number", () => {
    const p = normalizeRazorpayPayment({ ...entity, notes: {}, description: "INV-0009 Ravi" });
    expect(p.invoiceRef).toBe("INV-0009 Ravi");
  });
});

describe("normalizeCashfreePayment", () => {
  it("converts rupees to paise and reads the bank reference + order tags", () => {
    const p = normalizeCashfreePayment(
      {
        cf_payment_id: "889977",
        payment_amount: 999.0, // rupees
        payment_status: "SUCCESS",
        payment_method: "upi",
        bank_reference: "200411223344",
        payment_completion_time: "2026-07-18T10:15:00+05:30",
      },
      { order_id: "order_INV-0005", order_tags: { invoice_number: "INV-0005" } },
    );
    expect(p.amountPaise).toBe(99900);
    expect(p.reference).toBe("200411223344");
    expect(p.invoiceRef).toBe("INV-0005");
    expect(p.status).toBe("success");
  });
});

describe("gatewayPaymentsToTxns", () => {
  it("keeps only successful, positive-amount payments", () => {
    const txns = gatewayPaymentsToTxns([
      { gatewayId: "a", reference: "1", amountPaise: 1000, invoiceRef: "INV-1", method: "upi", status: "success", capturedAt: "" },
      { gatewayId: "b", reference: "2", amountPaise: 0, invoiceRef: null, method: "upi", status: "success", capturedAt: "" },
      { gatewayId: "c", reference: "3", amountPaise: 500, invoiceRef: null, method: "upi", status: "other", capturedAt: "" },
    ]);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.note).toContain("INV-1");
    expect(txns[0]!.reference).toBe("1");
  });
});

describe("gateway → buildMatches pipeline", () => {
  const invoices: ReconcileInvoice[] = [inv("a", "INV-0007", 118000)];

  it("reconciles a Razorpay capture to its invoice by ref + amount", () => {
    const payment = normalizeRazorpayPayment({
      id: "pay_1",
      amount: 118000,
      status: "captured",
      method: "upi",
      acquirer_data: { rrn: "227522297540" },
      notes: { invoice_number: "INV-0007" },
      created_at: 1_752_800_000,
    });
    const txns = gatewayPaymentsToTxns([payment]);
    const { matched } = buildMatches({ txns, openInvoices: invoices });
    expect(matched).toHaveLength(1);
    expect(matched[0]!.invoiceId).toBe("a");
    expect(matched[0]!.confidence).toBe("exact");
  });

  it("is idempotent across webhook retries (same RRN never applied twice)", () => {
    const payment = normalizeRazorpayPayment({
      id: "pay_1",
      amount: 118000,
      status: "captured",
      acquirer_data: { rrn: "227522297540" },
      notes: { invoice_number: "INV-0007" },
      created_at: 1_752_800_000,
    });
    const txns = gatewayPaymentsToTxns([payment]);
    const second = buildMatches({
      txns,
      openInvoices: invoices,
      reconciledRefs: new Set(["227522297540"]),
    });
    expect(second.matched).toHaveLength(0);
    expect(second.alreadyReconciled).toHaveLength(1);
  });
});

function inv(id: string, number: string | null, total: number, paid = 0): ReconcileInvoice {
  return { id, number, totalPaise: total, amountPaidPaise: paid };
}
