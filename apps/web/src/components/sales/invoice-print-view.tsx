"use client";

import {
  fieldsByKey,
  formatPaise,
  type BusinessTypeConfig,
  type JsonValue,
  type Paise,
} from "@vyora/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UpiPay } from "~/components/sales/upi-pay";
import {
  getInvoicePrintData,
  type InvoiceItemRow,
  type InvoicePrintData,
} from "~/lib/db/repository";

/**
 * Printable tax invoice (route: /invoice/[id]).
 *
 * Prints straight from the browser (Ctrl/Cmd-P → Save as PDF), so it needs no
 * PDF library and works offline. It is metadata-driven: the line-item columns
 * come from the fields the invoice actually captured, so a chemist's invoice
 * prints Batch and Expiry columns while a jeweller's prints purity and HUID —
 * from one component. WhatsApp share sends the customer a link-free summary via
 * wa.me, the channel Indian shops use.
 */

const CORE_EXCLUDE = new Set(["item_name", "description", "qty", "rate", "gst", "hsn"]);

const rupee = (p: number) => formatPaise(p as Paise);

function milliToQty(milli: number): string {
  const n = milli / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

/** Indian-system amount in words for whole rupees (+ paise). */
function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const words = numToWords(rupees);
  const main = `${words} rupee${rupees === 1 ? "" : "s"}`;
  const paisePart = p > 0 ? ` and ${numToWords(p)} paise` : "";
  return `${main}${paisePart} only`.replace(/\b\w/, (c) => c.toUpperCase());
}
function numToWords(n: number): string {
  if (n === 0) return "zero";
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (x: number): string => (x < 20 ? ones[x]! : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`);
  const three = (x: number): string => (x >= 100 ? `${ones[Math.floor(x / 100)]} hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x));
  let out = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) out += `${three(crore)} crore `;
  if (lakh) out += `${two(lakh)} lakh `;
  if (thousand) out += `${two(thousand)} thousand `;
  if (n) out += three(n);
  return out.trim();
}

export function InvoicePrintView({
  orgId,
  invoiceId,
  config,
  businessName,
  stateCode,
}: {
  orgId: string;
  invoiceId: string;
  config: BusinessTypeConfig | null;
  businessName: string;
  stateCode: string;
}) {
  const [data, setData] = useState<InvoicePrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getInvoicePrintData(orgId, invoiceId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byKey = useMemo(() => (config ? fieldsByKey(config) : {}), [config]);

  // Vertical columns: meta keys present on any line, minus the core ones.
  const verticalKeys = useMemo(() => {
    if (!data) return [];
    const seen: string[] = [];
    for (const it of data.items) {
      for (const k of Object.keys(it.meta)) {
        if (!CORE_EXCLUDE.has(k) && !seen.includes(k) && it.meta[k] != null && it.meta[k] !== "") {
          seen.push(k);
        }
      }
    }
    return seen;
  }, [data]);

  function fmtMeta(key: string, value: JsonValue): string {
    if (value == null || value === "") return "—";
    const t = byKey[key]?.type;
    if (t === "currency" && typeof value === "number") return rupee(value);
    if (t === "percent" && typeof value === "number") return `${value / 100}%`;
    return String(value);
  }
  const label = (key: string) => byKey[key]?.label ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  function shareWhatsApp() {
    if (!data?.invoice) return;
    const phone = data.customer?.phone?.replace(/\D/g, "");
    const text = `Hello ${data.customer?.name ?? "Customer"},\n\nHere is your invoice ${data.invoice.number ?? ""} for ${rupee(data.invoice.total_paise)} dated ${data.invoice.date}.\n\nThank you for your business — ${businessName}.`;
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noreferrer");
  }

  if (error) {
    return <p role="alert" className="m-6 rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>;
  }
  if (!data) return <p className="m-6 text-body text-content-muted">Loading invoice…</p>;
  if (!data.invoice) return <p className="m-6 text-body text-content-muted">Invoice not found.</p>;

  const inv = data.invoice;
  const cgst = Math.round(inv.tax_paise / 2);
  const sgst = inv.tax_paise - cgst;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 print:p-0">
      {/* Toolbar — hidden when printing */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/sales" className="text-body font-medium text-primary hover:underline">← Back to Sales</Link>
        <div className="flex gap-2">
          <button onClick={shareWhatsApp} className="rounded-control border border-border bg-surface px-4 py-2 text-body font-medium hover:bg-canvas">Share on WhatsApp</button>
          <button onClick={() => window.print()} className="rounded-control bg-primary px-4 py-2 text-body font-medium text-white">Print / Save PDF</button>
        </div>
      </div>

      {/* The invoice sheet */}
      <div className="rounded-card border border-border bg-white p-8 text-[13px] text-black shadow-card print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: "oklch(0.52 0.2 285)" }}>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-bold" style={{ color: "oklch(0.42 0.2 285)" }}>{businessName}</h1>
            {config ? <span className="text-[12px] text-gray-600">{config.label} · State code {stateCode}</span> : null}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xl font-bold tracking-wide">{config?.invoice.template ?? "TAX INVOICE"}</span>
            <span>Invoice: <b>{inv.number ?? "—"}</b></span>
            <span>Date: {inv.date}</span>
            {config?.invoice.extras.length ? <span className="text-[11px] text-gray-500">{config.invoice.extras.join(" · ")}</span> : null}
          </div>
        </div>

        {/* Bill to */}
        <div className="flex justify-between py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold uppercase text-gray-500">Bill to</span>
            <span className="font-semibold">{data.customer?.name ?? "Walk-in customer"}</span>
            {data.customer?.phone ? <span>Phone: {data.customer.phone}</span> : null}
            <span>GSTIN: {data.customer?.gstin ?? "URD (unregistered)"}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span
              className="rounded-pill px-2 py-0.5 text-[11px] font-semibold"
              style={
                inv.status === "paid"
                  ? { backgroundColor: "oklch(0.93 0.08 150)", color: "oklch(0.4 0.15 150)" }
                  : { backgroundColor: "oklch(0.93 0.08 75)", color: "oklch(0.42 0.14 75)" }
              }
            >
              {inv.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-white" style={{ backgroundColor: "oklch(0.42 0.2 285)" }}>
              <th className="p-2">#</th>
              <th className="p-2">Item</th>
              {verticalKeys.map((k) => <th key={k} className="p-2">{label(k)}</th>)}
              <th className="p-2">HSN</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Taxable</th>
              <th className="p-2 text-right">CGST</th>
              <th className="p-2 text-right">SGST</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => {
              const line = lineFigures(it);
              return (
                <tr key={it.id} className="border-b border-gray-200">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2 font-medium">{it.description || (typeof it.meta.item_name === "string" ? it.meta.item_name : "Item")}</td>
                  {verticalKeys.map((k) => <td key={k} className="p-2">{fmtMeta(k, it.meta[k] ?? null)}</td>)}
                  <td className="p-2">{typeof it.meta.hsn === "string" && it.meta.hsn ? it.meta.hsn : "—"}</td>
                  <td className="p-2 text-right font-mono">{milliToQty(it.qty_milli)}</td>
                  <td className="p-2 text-right font-mono">{rupee(it.rate_paise)}</td>
                  <td className="p-2 text-right font-mono">{rupee(line.taxable)}</td>
                  <td className="p-2 text-right font-mono">{rupee(line.cgst)}</td>
                  <td className="p-2 text-right font-mono">{rupee(line.sgst)}</td>
                  <td className="p-2 text-right font-mono font-medium">{rupee(line.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end pt-4">
          <div className="flex w-72 flex-col gap-1">
            <Row label="Taxable value" value={rupee(inv.subtotal_paise)} />
            <Row label="CGST" value={rupee(cgst)} />
            <Row label="SGST" value={rupee(sgst)} />
            <div className="mt-1 flex items-center justify-between border-t-2 pt-2 text-base font-bold" style={{ borderColor: "oklch(0.42 0.2 285)" }}>
              <span>Grand Total</span>
              <span className="font-mono">{rupee(inv.total_paise)}</span>
            </div>
          </div>
        </div>

        <p className="pt-3 text-[12px] italic text-gray-600">Amount in words: {amountInWords(inv.total_paise)}</p>

        {/* UPI collection */}
        {inv.total_paise > 0 && inv.status !== "paid" ? (
          <div className="pt-3">
            <UpiPay amountPaise={inv.total_paise} note={inv.number ?? "Invoice"} />
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-6 flex items-end justify-between border-t pt-4 text-[12px] text-gray-600">
          <span>Thank you for your business.</span>
          <div className="flex flex-col items-end gap-6">
            <span className="font-semibold text-black">For {businessName}</span>
            <span>Authorised signatory</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function lineFigures(it: InvoiceItemRow): { taxable: number; cgst: number; sgst: number; total: number } {
  const taxable = Math.round((it.rate_paise * it.qty_milli) / 1000);
  const tax = Math.round((taxable * it.tax_bps) / 10000);
  const cgst = Math.round(tax / 2);
  return { taxable, cgst, sgst: tax - cgst, total: taxable + tax };
}
