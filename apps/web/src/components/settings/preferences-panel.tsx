"use client";

import { Badge, Button, Card, Input, Label } from "@vyora/ui";
import { useEffect, useState } from "react";

import {
  DEFAULTS,
  loadPreferences,
  savePreference,
  type Preferences,
} from "~/lib/settings";

/**
 * Preferences — the switches that actually do something.
 *
 * Grouped the way a shopkeeper thinks (documents, tax, stock, reminders,
 * print), saved the moment they are changed, and honoured immediately by the
 * modules that read them: number prefixes by every document, the low-stock
 * threshold by Reports, reminder wording by the Reminders screen.
 */

type Group = "documents" | "tax" | "stock" | "reminders" | "print";

const GROUPS: { key: Group; label: string; blurb: string }[] = [
  { key: "documents", label: "Documents", blurb: "How your bills and quotations are numbered and totalled." },
  { key: "tax", label: "Tax & GST", blurb: "What appears on the bill and how tax is worked out." },
  { key: "stock", label: "Stock", blurb: "When to warn you, and what to track per item." },
  { key: "reminders", label: "Messages", blurb: "What Vyora writes when you chase a payment or send a bill." },
  { key: "print", label: "Print", blurb: "What goes on the printed invoice." },
];

export function PreferencesPanel() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [group, setGroup] = useState<Group>("documents");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void loadPreferences().then(setPrefs);
  }, []);

  async function update<K extends keyof Preferences>(name: K, value: Preferences[K]) {
    setPrefs((p) => (p ? { ...p, [name]: value } : p));
    await savePreference(name, value);
    setSaved(String(name));
    window.setTimeout(() => setSaved((s) => (s === String(name) ? null : s)), 1800);
  }

  if (!prefs) {
    return (
      <Card className="p-5">
        <p className="text-body text-content-muted">Loading your preferences…</p>
      </Card>
    );
  }

  const toggle = (name: keyof Preferences, label: string, hint: string) => (
    <label
      key={String(name)}
      className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-canvas p-3"
    >
      <input
        type="checkbox"
        checked={prefs[name] as boolean}
        onChange={(e) => void update(name, e.target.checked as Preferences[typeof name])}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <span className="flex flex-col">
        <span className="text-body font-medium">
          {label}
          {saved === String(name) ? <span className="ml-2 text-caption text-success">saved</span> : null}
        </span>
        <span className="text-caption normal-case text-content-muted">{hint}</span>
      </span>
    </label>
  );

  const text = (
    name: keyof Preferences,
    label: string,
    opts?: { numeric?: boolean; placeholder?: string },
  ) => (
    <div key={String(name)} className="flex flex-col gap-1">
      <Label htmlFor={`p-${String(name)}`}>
        {label}
        {saved === String(name) ? <span className="ml-2 text-caption text-success">saved</span> : null}
      </Label>
      <Input
        id={`p-${String(name)}`}
        value={String(prefs[name])}
        inputMode={opts?.numeric ? "numeric" : undefined}
        placeholder={opts?.placeholder}
        className={opts?.numeric ? "text-right font-mono" : "font-mono"}
        onChange={(e) => {
          const raw = opts?.numeric ? e.target.value.replace(/\D/g, "") : e.target.value;
          void update(name, (opts?.numeric ? Number(raw || 0) : raw) as Preferences[typeof name]);
        }}
      />
    </div>
  );

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Preferences</h2>
        <p className="text-body text-content-muted">
          Saved on this device the moment you change them, and applied straight
          away.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            className={
              "rounded-control border px-3 py-1.5 text-body font-medium transition-colors " +
              (group === g.key
                ? "border-primary bg-primary text-white"
                : "border-border bg-canvas text-content-muted hover:border-primary hover:text-primary")
            }
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="text-caption normal-case text-content-muted">
        {GROUPS.find((g) => g.key === group)!.blurb}
      </p>

      {group === "documents" ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {text("invoicePrefix", "Invoice prefix")}
            {text("quotationPrefix", "Quotation prefix")}
            {text("proformaPrefix", "Proforma prefix")}
            {text("orderPrefix", "Order prefix")}
            {text("challanPrefix", "Delivery note prefix")}
            {text("creditNotePrefix", "Credit note prefix")}
            {text("purchaseOrderPrefix", "Purchase order prefix")}
          </div>
          <p className="text-caption normal-case text-content-muted">
            Numbers continue from where they are — changing a prefix affects the
            next document, never one already issued.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {toggle("roundOffTotal", "Round off the total", "Bill totals come out to the nearest rupee.")}
            {toggle("showTimeOnInvoice", "Show time on the bill", "Useful for a busy counter; noise for most shops.")}
          </div>
        </div>
      ) : null}

      {group === "tax" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {toggle("gstEnabled", "Charge GST", "Turn off only if you are not registered.")}
          {toggle("hsnEnabled", "Show HSN / SAC codes", "Required on B2B invoices above the turnover limit.")}
          {toggle("placeOfSupply", "Ask for place of supply", "Decides CGST+SGST against IGST on every bill.")}
          {toggle("compositeScheme", "Composition scheme", "Bills say “composition taxable person”, tax is not collected separately.")}
        </div>
      ) : null}

      {group === "stock" ? (
        <div className="flex flex-col gap-4">
          <div className="sm:max-w-xs">
            {text("lowStockThreshold", "Warn me at or below", { numeric: true })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {toggle("stopSaleOnNegativeStock", "Block sales below zero stock", "Stops a bill that would take stock negative.")}
            {toggle("trackBatchExpiry", "Track batch & expiry", "Adds batch and expiry to every item — chemists and food shops need this.")}
          </div>
        </div>
      ) : null}

      {group === "reminders" ? (
        <div className="flex flex-col gap-4">
          <div className="sm:max-w-xs">
            {text("reminderAfterDays", "Treat a bill as overdue after (days)", { numeric: true })}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-reminderTemplate">
              Payment reminder wording
              {saved === "reminderTemplate" ? <span className="ml-2 text-caption text-success">saved</span> : null}
            </Label>
            <textarea
              id="p-reminderTemplate"
              rows={4}
              value={prefs.reminderTemplate}
              onChange={(e) => void update("reminderTemplate", e.target.value)}
              className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-invoiceMessageTemplate">
              Invoice message wording
              {saved === "invoiceMessageTemplate" ? <span className="ml-2 text-caption text-success">saved</span> : null}
            </Label>
            <textarea
              id="p-invoiceMessageTemplate"
              rows={4}
              value={prefs.invoiceMessageTemplate}
              onChange={(e) => void update("invoiceMessageTemplate", e.target.value)}
              className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption normal-case text-content-muted">You can use:</span>
            {["{party}", "{number}", "{date}", "{total}", "{due}"].map((t) => (
              <Badge key={t} tone="primary">{t}</Badge>
            ))}
          </div>
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              void update("reminderTemplate", DEFAULTS.reminderTemplate);
              void update("invoiceMessageTemplate", DEFAULTS.invoiceMessageTemplate);
            }}
          >
            Reset wording to Vyora&apos;s
          </Button>
        </div>
      ) : null}

      {group === "print" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {toggle("printLogo", "Shop name & logo", "The header block at the top of the bill.")}
          {toggle("printGstin", "Your GSTIN", "Taken from Invoice branding above.")}
          {toggle("printBankDetails", "Bank details", "For customers paying by NEFT, RTGS or IMPS.")}
          {toggle("printSignature", "Signature line", "“For <shop name>”, with room to sign.")}
        </div>
      ) : null}
    </Card>
  );
}
