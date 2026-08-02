import type { StatementTxn } from "./match";

/**
 * Payment-gateway → reconciliation adapter.
 *
 * Vyora is offline-first and end-to-end encrypted: the server stores invoices as
 * ciphertext and cannot match anything. So a gateway webhook is *received* on the
 * server, but reconciliation runs on the client, against its decrypted invoices,
 * with the SAME `buildMatches` engine that powers the statement paste.
 *
 * This module is the neutral seam between the two. A webhook handler verifies the
 * gateway signature, calls the matching `normalize*` function to get a
 * `GatewayPayment`, and persists it for the client. The client pulls those events
 * and runs `gatewayPaymentsToTxns` → `buildMatches`. Because the bank reference
 * (RRN/UTR) rides through as `StatementTxn.reference`, a webhook that is delivered
 * twice — gateways retry — reconciles the invoice exactly once.
 *
 * Pure and gateway-shaped only: no network, no secrets, no provider SDK here.
 */

export interface GatewayPayment {
  /** Provider payment id (pay_xxx / cf_payment_id) — for traceability. */
  gatewayId: string;
  /** Bank RRN/UTR — the idempotency key carried into reconciliation. */
  reference: string | null;
  amountPaise: number;
  /** Invoice number the merchant put in the gateway notes/order tags, if any. */
  invoiceRef: string | null;
  method: string;
  /** Only `success` payments are reconciled; everything else is ignored. */
  status: "success" | "other";
  /** ISO timestamp of capture. */
  capturedAt: string;
}

const firstString = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

const isoFromEpochSeconds = (secs: unknown): string => {
  const n = typeof secs === "number" ? secs : Number(secs);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : "";
};

/**
 * Razorpay `payment.captured` — `payload.payment.entity`.
 * Amounts are already integer paise; the RRN lives in `acquirer_data`.
 */
export function normalizeRazorpayPayment(entity: Record<string, unknown>): GatewayPayment {
  const acquirer = (entity.acquirer_data ?? {}) as Record<string, unknown>;
  const notes = (entity.notes ?? {}) as Record<string, unknown>;
  const amount = typeof entity.amount === "number" ? entity.amount : Number(entity.amount ?? 0);
  return {
    gatewayId: firstString(entity.id) ?? "",
    reference: firstString(acquirer.rrn, acquirer.upi_transaction_id, acquirer.bank_transaction_id),
    amountPaise: Number.isFinite(amount) ? Math.round(amount) : 0,
    invoiceRef: firstString(notes.invoice_number, notes.invoice, notes.inv, entity.description),
    method: firstString(entity.method) ?? "upi",
    status: entity.status === "captured" || entity.status === "authorized" ? "success" : "other",
    capturedAt: isoFromEpochSeconds(entity.created_at),
  };
}

/**
 * Cashfree payment webhook — `data.payment` (+ `data.order`).
 * Amounts are rupees (float); the UTR is `bank_reference`.
 */
export function normalizeCashfreePayment(
  payment: Record<string, unknown>,
  order?: Record<string, unknown>,
): GatewayPayment {
  const tags = (order?.order_tags ?? {}) as Record<string, unknown>;
  const rupees = typeof payment.payment_amount === "number"
    ? payment.payment_amount
    : Number(payment.payment_amount ?? 0);
  return {
    gatewayId: firstString(payment.cf_payment_id) ?? "",
    reference: firstString(payment.bank_reference, payment.payment_group),
    amountPaise: Number.isFinite(rupees) ? Math.round(rupees * 100) : 0,
    invoiceRef: firstString(tags.invoice_number, tags.invoice, order?.order_id),
    method: firstString(payment.payment_method) ?? "upi",
    status: payment.payment_status === "SUCCESS" ? "success" : "other",
    capturedAt: firstString(payment.payment_completion_time) ?? "",
  };
}

/**
 * Fold successful gateway payments into the transaction shape `buildMatches`
 * consumes. The invoice number goes into `note` (so the ref-match tier fires) and
 * the RRN/UTR into `reference` (so idempotency holds across webhook retries).
 */
export function gatewayPaymentsToTxns(payments: readonly GatewayPayment[]): StatementTxn[] {
  return payments
    .filter((p) => p.status === "success" && p.amountPaise > 0)
    .map((p) => ({
      date: p.capturedAt ? p.capturedAt.slice(0, 10) : "",
      note: [p.invoiceRef, p.gatewayId].filter(Boolean).join(" "),
      amountPaise: p.amountPaise,
      raw: p.gatewayId || `${p.reference ?? ""}:${p.amountPaise}`,
      reference: p.reference,
    }));
}
