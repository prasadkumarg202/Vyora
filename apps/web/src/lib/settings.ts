"use client";

import { getSetting, setSetting } from "~/lib/db/repository";

/**
 * Shop preferences.
 *
 * Stored in the device's own key–value table, so a setting applies the instant
 * it is saved, with or without a network. Every preference here is one that
 * genuinely changes what the app does — a settings screen full of switches that
 * do nothing is worse than a short one that works.
 *
 * Defaults are chosen for the commonest Indian shop: GST on, HSN shown,
 * round-off on, reminders after a week.
 */

export interface Preferences {
  // --- Documents ---
  invoicePrefix: string;
  quotationPrefix: string;
  proformaPrefix: string;
  orderPrefix: string;
  challanPrefix: string;
  creditNotePrefix: string;
  purchaseOrderPrefix: string;
  roundOffTotal: boolean;
  showTimeOnInvoice: boolean;

  // --- Tax ---
  gstEnabled: boolean;
  hsnEnabled: boolean;
  placeOfSupply: boolean;
  compositeScheme: boolean;

  // --- Stock ---
  lowStockThreshold: number;
  stopSaleOnNegativeStock: boolean;
  trackBatchExpiry: boolean;

  // --- Parties & reminders ---
  reminderAfterDays: number;
  reminderTemplate: string;
  invoiceMessageTemplate: string;

  // --- Print ---
  printLogo: boolean;
  printGstin: boolean;
  printBankDetails: boolean;
  printSignature: boolean;
}

export const DEFAULTS: Preferences = {
  invoicePrefix: "INV",
  quotationPrefix: "QTN",
  proformaPrefix: "PI",
  orderPrefix: "SO",
  challanPrefix: "DN",
  creditNotePrefix: "CN",
  purchaseOrderPrefix: "PO",
  roundOffTotal: true,
  showTimeOnInvoice: false,

  gstEnabled: true,
  hsnEnabled: true,
  placeOfSupply: true,
  compositeScheme: false,

  lowStockThreshold: 5,
  stopSaleOnNegativeStock: false,
  trackBatchExpiry: false,

  reminderAfterDays: 7,
  reminderTemplate:
    "Hello {party},\n\nA gentle reminder: invoice {number} dated {date} has {due} pending.\n\nKindly arrange the payment at your convenience. Thank you!",
  invoiceMessageTemplate:
    "Hello {party},\n\nHere is your invoice {number} for {total} dated {date}.\n\nThank you for your business!",

  printLogo: true,
  printGstin: true,
  printBankDetails: true,
  printSignature: true,
};

const KEY = (name: keyof Preferences) => `pref.${name}`;

/** Read every preference, falling back to the default for anything unset. */
export async function loadPreferences(): Promise<Preferences> {
  const entries = await Promise.all(
    (Object.keys(DEFAULTS) as (keyof Preferences)[]).map(async (name) => {
      const raw = await getSetting(KEY(name));
      const fallback = DEFAULTS[name];
      if (raw === null) return [name, fallback] as const;
      if (typeof fallback === "boolean") return [name, raw === "true"] as const;
      if (typeof fallback === "number") {
        const n = Number(raw);
        return [name, Number.isFinite(n) ? n : fallback] as const;
      }
      return [name, raw] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as Preferences;
}

/** Read one preference — cheap enough to call from anywhere that needs it. */
export async function getPreference<K extends keyof Preferences>(
  name: K,
): Promise<Preferences[K]> {
  const raw = await getSetting(KEY(name));
  const fallback = DEFAULTS[name];
  if (raw === null) return fallback;
  if (typeof fallback === "boolean") return (raw === "true") as Preferences[K];
  if (typeof fallback === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as Preferences[K];
  }
  return raw as Preferences[K];
}

export async function savePreference<K extends keyof Preferences>(
  name: K,
  value: Preferences[K],
): Promise<void> {
  await setSetting(KEY(name), String(value));
}

/**
 * Fill a template's {placeholders}. Anything unrecognised is left alone rather
 * than blanked, so a typo shows itself instead of silently vanishing.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}
