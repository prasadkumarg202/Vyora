"use client";

import { formatPaise, type Paise } from "@vyora/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vyora/ui";
import { useEffect, useState } from "react";

import type { Party } from "~/components/sales/party-picker";
import { getSetting } from "~/lib/db/repository";
import { DEFAULTS, fillTemplate, loadPreferences } from "~/lib/settings";

/**
 * Preview, and the three ways a bill leaves the shop.
 *
 * Preview reads the draft as it stands, so a shopkeeper can check the bill
 * before committing it — the cheapest moment to catch a wrong rate. The three
 * send actions stay disabled until the invoice is saved, and deliberately so: a
 * bill carries a number from `nextInvoiceNumber`, and a WhatsApp message quoting
 * a number that no saved invoice has is a bill the shop cannot produce when the
 * customer asks for it again.
 *
 * Print opens the existing `/invoice/[id]` sheet rather than printing this
 * dialog. That view is already the shop's branded document — logo, GSTIN, bank
 * block, amount in words — and a second print layout here would drift from it
 * the first time either changed.
 *
 * Mail is a `mailto:` link, which keeps the offline-first promise: it hands the
 * bill to whatever mail app the shopkeeper already uses, with no sending domain
 * to verify and no round-trip that fails at a counter with no signal.
 */

export interface DraftLineView {
  name: string;
  qty: number;
  ratePaise: number;
  amountPaise: number;
}

export interface DraftBill {
  /** Assigned at save; null while the bill is still a draft. */
  number: string | null;
  date: string;
  party: Party | null;
  lines: DraftLineView[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  discountPaise: number;
  chargesPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

const rupee = (p: number) => formatPaise(p as Paise);

/** Whole units by the time they reach here; shown without trailing zeros. */
function qtyText(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, "");
}

export function InvoiceActions({
  bill,
  savedId,
}: {
  bill: DraftBill;
  /** The saved invoice's id, or null while it is still a draft. */
  savedId: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState(
    DEFAULTS.invoiceMessageTemplate,
  );
  /**
   * Read here rather than taken as a prop, the same way the UPI block and the
   * reminders screen read it — the shop name is device-local until a synced
   * business profile lands, and threading it down from the server context would
   * make this component need one.
   */
  const [businessName, setBusinessName] = useState("");

  // The shop's own wording, not ours. Both reads fall back to a usable default,
  // so a database that is not open yet on a cold start leaves the buttons
  // working rather than dead — and `live` keeps a late answer from setting state
  // on a component the shopkeeper has already navigated away from.
  useEffect(() => {
    let live = true;
    loadPreferences()
      .then((p) => {
        if (live) setMessageTemplate(p.invoiceMessageTemplate);
      })
      .catch(() => {
        /* keep the default template */
      });
    getSetting("shop_name")
      .then((n) => {
        if (live) setBusinessName(n ?? "");
      })
      .catch(() => {
        /* the sheet falls back to "Your shop" */
      });
    return () => {
      live = false;
    };
  }, []);

  const sent = savedId !== null;

  function messageBody(): string {
    const body = fillTemplate(messageTemplate, {
      party: bill.party?.name ?? "Customer",
      number: bill.number ?? "",
      date: bill.date,
      total: rupee(bill.totalPaise),
    });
    return businessName && !body.includes(businessName)
      ? `${body}\n— ${businessName}`
      : body;
  }

  function shareWhatsApp() {
    const digits = bill.party?.phone?.replace(/\D/g, "") ?? "";
    const text = encodeURIComponent(messageBody());
    // A 10-digit Indian number needs the country code; anything longer already
    // carries one. With no number at all, wa.me opens the contact chooser.
    const to = digits.length === 10 ? `91${digits}` : digits;
    const url = to ? `https://wa.me/${to}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noreferrer");
  }

  /** Named to stay clear of the global `print`, which this deliberately is not. */
  function openPrintSheet() {
    if (!savedId) return;
    window.open(`/invoice/${savedId}`, "_blank", "noreferrer");
  }

  function mail() {
    const to = bill.party?.email ?? "";
    const subject = businessName
      ? `Invoice ${bill.number ?? ""} from ${businessName}`
      : `Invoice ${bill.number ?? ""}`;
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(messageBody())}`;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
          Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={shareWhatsApp}
          disabled={!sent}
          title={sent ? undefined : "Save the bill first"}
        >
          WhatsApp
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={openPrintSheet}
          disabled={!sent}
          title={sent ? undefined : "Save the bill first"}
        >
          Print
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={mail}
          disabled={!sent}
          title={sent ? undefined : "Save the bill first"}
        >
          Mail
        </Button>
        {!sent ? (
          <span className="text-caption normal-case text-content-muted">
            Save to send — a bill needs its number first.
          </span>
        ) : null}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {bill.number ? `Invoice ${bill.number}` : "Draft bill"}
            </DialogTitle>
          </DialogHeader>
          <BillSheet bill={bill} businessName={businessName} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The bill as the customer will read it — borders, aligned money, no chrome. */
function BillSheet({
  bill,
  businessName,
}: {
  bill: DraftBill;
  businessName: string;
}) {
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
        <div className="flex flex-col">
          <span className="text-body-lg font-semibold text-content">
            {businessName || "Your shop"}
          </span>
          <span className="text-caption normal-case text-content-muted">
            {bill.date}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-caption uppercase text-content-muted">
            Bill to
          </span>
          <span className="text-body font-medium text-content">
            {bill.party?.name ?? "Walk-in customer"}
          </span>
          {bill.party?.gstin ? (
            <span className="text-caption normal-case text-content-muted">
              {bill.party.gstin}
            </span>
          ) : null}
        </div>
      </div>

      {bill.lines.length === 0 ? (
        <p className="py-6 text-center text-body text-content-muted">
          Nothing on this bill yet.
        </p>
      ) : (
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-2 text-caption uppercase text-content-muted">
                Item
              </th>
              <th className="py-2 px-2 text-right text-caption uppercase text-content-muted">
                Qty
              </th>
              <th className="py-2 px-2 text-right text-caption uppercase text-content-muted">
                Rate
              </th>
              <th className="py-2 pl-2 text-right text-caption uppercase text-content-muted">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l, i) => (
              <tr key={`${l.name}-${i}`} className="border-b border-border-subtle">
                <td className="py-2 pr-2 text-body text-content">{l.name}</td>
                <td className="py-2 px-2 text-right font-mono text-body">
                  {qtyText(l.qty)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-body">
                  {rupee(l.ratePaise)}
                </td>
                <td className="py-2 pl-2 text-right font-mono text-body font-medium">
                  {rupee(l.amountPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 flex justify-end">
        <div className="flex w-64 flex-col gap-1">
          {bill.discountPaise > 0 ? (
            <TotalRow label="Discount" value={`- ${rupee(bill.discountPaise)}`} />
          ) : null}
          {bill.chargesPaise > 0 ? (
            <TotalRow label="Charges" value={rupee(bill.chargesPaise)} />
          ) : null}
          <TotalRow label="Taxable" value={rupee(bill.taxablePaise)} />
          {bill.igstPaise > 0 ? (
            <TotalRow label="IGST" value={rupee(bill.igstPaise)} />
          ) : (
            <>
              <TotalRow label="CGST" value={rupee(bill.cgstPaise)} />
              <TotalRow label="SGST" value={rupee(bill.sgstPaise)} />
            </>
          )}
          {bill.roundOffPaise !== 0 ? (
            <TotalRow label="Round off" value={rupee(bill.roundOffPaise)} />
          ) : null}
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
            <span className="text-body font-semibold text-content">Total</span>
            <span className="font-mono text-h3 text-content">
              {rupee(bill.totalPaise)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-body text-content-muted">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
