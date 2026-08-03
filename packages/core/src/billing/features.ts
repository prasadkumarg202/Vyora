import type { PlanId } from "./plans";
import { PLAN_ORDER, isAtLeast } from "./plans";

/**
 * The entitlement catalogue: every gate in the product, named once.
 *
 * The rule the roadmap sets — gate the premium surface in ONE place, not in
 * scattered `if`s — only holds if the list of gates is itself in one place.
 * A screen asks `can(entitlement, "voice_billing")`; it never asks which plan
 * the shop is on. That way re-pricing is an edit to this file and the ladder,
 * not a hunt through components.
 *
 * `status` is honesty control. A feature marked `planned` is on the roadmap
 * and not yet built; the pricing page renders it as such rather than selling
 * something that does not exist. Nothing in the app should ever return true
 * from `can()` for a planned feature — they are listed, not licensed.
 */

export type FeatureKey =
  // --- Free forever: the bookkeeping core, uncapped -------------------------
  | "gst_billing"
  | "inventory"
  | "reports"
  | "report_library"
  | "quotes_challans"
  | "returns_credit_notes"
  | "purchases"
  | "expenses"
  | "parties"
  | "cash_bank"
  | "import_export"
  | "upi_on_invoice"
  | "print_invoice"
  | "payment_reminders"
  | "manual_backup"
  // --- Pro: the cloud, the counter, the AI ---------------------------------
  | "cloud_sync"
  | "multi_device"
  | "team_users"
  | "auto_backup"
  | "ai_assistant"
  | "voice_billing"
  | "snap_bill"
  | "scan_sell"
  | "growth_studio"
  | "promotions"
  | "marketing"
  | "crm"
  | "credit_radar"
  | "stock_radar"
  | "upi_auto_match"
  | "invoice_branding"
  | "priority_support"
  // --- Business: the team, the compliance rails, the channels --------------
  | "unlimited_users"
  | "staff_roles"
  | "multi_branch"
  | "eway_bill"
  | "e_invoicing"
  | "tally_export"
  | "loyalty"
  | "online_store"
  | "barcode_labels"
  | "api_access"
  | "ca_portal"
  | "dedicated_support";

export type FeatureStatus = "shipped" | "planned";

/** Grouping for the pricing table, in display order. */
export type FeatureGroup =
  | "Billing & GST"
  | "Stock & catalogue"
  | "Money & reports"
  | "Cloud & team"
  | "Vyora Edge (AI)"
  | "Growth"
  | "Compliance & scale";

export interface FeatureDef {
  readonly key: FeatureKey;
  readonly label: string;
  /** Plain-language line for the comparison table. */
  readonly blurb: string;
  readonly group: FeatureGroup;
  readonly minPlan: PlanId;
  readonly status: FeatureStatus;
}

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  "Billing & GST",
  "Stock & catalogue",
  "Money & reports",
  "Cloud & team",
  "Vyora Edge (AI)",
  "Growth",
  "Compliance & scale",
];

const defs: readonly FeatureDef[] = [
  // Billing & GST — free
  {
    key: "gst_billing",
    label: "GST invoicing, unlimited",
    blurb:
      "HSN, CGST/SGST/IGST, amount in words, print & WhatsApp. No monthly invoice cap and no turnover ceiling, on any plan.",
    group: "Billing & GST",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "print_invoice",
    label: "Printable tax invoice",
    blurb: "Thermal and A4, with your shop's address, GSTIN and footer.",
    group: "Billing & GST",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "quotes_challans",
    label: "Quotations, proforma & delivery challans",
    blurb: "One tap to convert any of them into an invoice.",
    group: "Billing & GST",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "returns_credit_notes",
    label: "Returns & credit notes",
    blurb:
      "Part-returns priced off the original bill; stock and receivable settled together.",
    group: "Billing & GST",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "upi_on_invoice",
    label: "UPI on the invoice",
    blurb: "A UPI deep link and an offline QR on every bill.",
    group: "Billing & GST",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "invoice_branding",
    label: "Custom invoice branding",
    blurb: "Logo, colour and template choices across every printed document.",
    group: "Billing & GST",
    minPlan: "pro",
    status: "shipped",
  },

  // Stock & catalogue
  {
    key: "inventory",
    label: "Stock & inventory",
    blurb: "Levels, adjustments, low-stock alerts, batch and expiry.",
    group: "Stock & catalogue",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "purchases",
    label: "Purchases & supply desk",
    blurb: "Purchase orders, bills, GRN, supplier returns and payments out.",
    group: "Stock & catalogue",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "import_export",
    label: "Excel / CSV import & export",
    blurb:
      "Bring items and parties over from Vyapar, myBillBook or Tally headers; export anything.",
    group: "Stock & catalogue",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "barcode_labels",
    label: "Barcode label printing",
    blurb: "Generate and print shelf labels on a label printer.",
    group: "Stock & catalogue",
    minPlan: "business",
    status: "planned",
  },

  // Money & reports
  {
    key: "reports",
    label: "Reports",
    blurb: "Sales, purchases, P&L, GST, day book, party outstanding.",
    group: "Money & reports",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "report_library",
    label: "Report Library — 13 reports",
    blurb:
      "FY presets, in-report search, CSV export and print — included from the cheapest plan, where the others reserve reports for higher tiers.",
    group: "Money & reports",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "cash_bank",
    label: "Cash & bank",
    blurb: "Cash in hand, bank accounts, cheques and loans with live balances.",
    group: "Money & reports",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "expenses",
    label: "Expenses",
    blurb: "Entries, categories and recurring spend.",
    group: "Money & reports",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "parties",
    label: "Customers & suppliers",
    blurb: "Directory, statements and outstanding, with ageing.",
    group: "Money & reports",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "payment_reminders",
    label: "Payment reminders",
    blurb: "Overdue list with one-tap WhatsApp chase.",
    group: "Money & reports",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "upi_auto_match",
    label: "UPI auto-match",
    blurb:
      "Paste a UPI or bank statement — credits match to invoices and mark them paid.",
    group: "Money & reports",
    minPlan: "pro",
    status: "shipped",
  },

  // Cloud & team
  {
    key: "manual_backup",
    label: "Local backup & restore",
    blurb:
      "Export the whole ledger to a file you keep — and it keeps working even if the workspace closes. Your records are yours.",
    group: "Cloud & team",
    minPlan: "free",
    status: "shipped",
  },
  {
    key: "cloud_sync",
    label: "Cloud sync",
    blurb: "Work offline; everything syncs the moment the network returns.",
    group: "Cloud & team",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "multi_device",
    label: "Unlimited devices",
    blurb:
      "Phone, tablet, counter PC and laptop — same ledger, no per-device licence.",
    group: "Cloud & team",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "auto_backup",
    label: "Automatic cloud backup",
    blurb: "Nightly, versioned, restorable to any device.",
    group: "Cloud & team",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "team_users",
    label: "Up to 3 users",
    blurb: "Owner plus two helpers, each on their own login.",
    group: "Cloud & team",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "unlimited_users",
    label: "Unlimited users",
    blurb: "Add the whole counter team without counting seats.",
    group: "Cloud & team",
    minPlan: "business",
    status: "shipped",
  },
  {
    key: "staff_roles",
    label: "Staff roles & permissions",
    blurb:
      "Cashier, manager, accountant — each sees only their part of the shop.",
    group: "Cloud & team",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "multi_branch",
    label: "Multiple branches & godowns",
    blurb: "Stock per location, with transfers between them.",
    group: "Cloud & team",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "priority_support",
    label: "Priority support",
    blurb: "Chat and WhatsApp, answered first.",
    group: "Cloud & team",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "dedicated_support",
    label: "Dedicated assistant",
    blurb: "A named virtual assistant, and an on-site visit where we operate.",
    group: "Cloud & team",
    minPlan: "business",
    status: "shipped",
  },

  // Vyora Edge (AI)
  {
    key: "voice_billing",
    label: "Voice billing",
    blurb: "Speak the sale in your language — it becomes an invoice.",
    group: "Vyora Edge (AI)",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "snap_bill",
    label: "Snap Bill (OCR)",
    blurb: "Photograph a supplier bill; the purchase books itself.",
    group: "Vyora Edge (AI)",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "scan_sell",
    label: "Scan & Sell",
    blurb: "Your camera is the barcode scanner and the POS.",
    group: "Vyora Edge (AI)",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "ai_assistant",
    label: "AI assistant",
    blurb: "Ask your own numbers a question and get an answer, not a report.",
    group: "Vyora Edge (AI)",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "credit_radar",
    label: "Credit Radar",
    blurb: "A Bharosa score and a safe udhaar limit for every customer.",
    group: "Vyora Edge (AI)",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "stock_radar",
    label: "Stock Radar",
    blurb: "Dead and slow stock, capital stuck, clearance actions.",
    group: "Vyora Edge (AI)",
    minPlan: "pro",
    status: "shipped",
  },

  // Growth
  {
    key: "growth_studio",
    label: "Growth Studio",
    blurb:
      "AI business briefing from your own numbers, shareable price list, Google listing helper.",
    group: "Growth",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "promotions",
    label: "Promotions studio",
    blurb: "Festival and offer templates with an AI copywriter.",
    group: "Growth",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "marketing",
    label: "Campaigns & broadcasts",
    blurb: "WhatsApp and SMS campaigns, segments and coupons.",
    group: "Growth",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "crm",
    label: "CRM",
    blurb: "Leads, pipeline, activities and follow-ups.",
    group: "Growth",
    minPlan: "pro",
    status: "shipped",
  },
  {
    key: "loyalty",
    label: "Loyalty & rewards",
    blurb: "Points, tiers and redemption at the counter.",
    group: "Growth",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "online_store",
    label: "Online store",
    blurb:
      "A hosted storefront with order capture, beyond the WhatsApp price list.",
    group: "Growth",
    minPlan: "business",
    status: "planned",
  },

  // Compliance & scale
  {
    key: "eway_bill",
    label: "e-Way bills, unlimited",
    blurb:
      "Never rationed. Vyapar caps its entry tier at 10 a month; myBillBook keeps them for its top plan.",
    group: "Compliance & scale",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "e_invoicing",
    label: "GST e-invoicing (IRN)",
    blurb: "IRP registration through a GSP, for the ₹5 Cr turnover mandate.",
    group: "Compliance & scale",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "tally_export",
    label: "Tally two-way export",
    blurb: "Keeps your CA happy without re-keying anything.",
    group: "Compliance & scale",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "ca_portal",
    label: "CA collaboration",
    blurb: "Give your accountant a read-only seat that never costs you one.",
    group: "Compliance & scale",
    minPlan: "business",
    status: "planned",
  },
  {
    key: "api_access",
    label: "API access",
    blurb: "Read and write your own data from your own tools.",
    group: "Compliance & scale",
    minPlan: "business",
    status: "planned",
  },
];

export const FEATURES: Readonly<Record<FeatureKey, FeatureDef>> = Object.freeze(
  Object.fromEntries(defs.map((d) => [d.key, d])) as Record<
    FeatureKey,
    FeatureDef
  >,
);

export const FEATURE_LIST: readonly FeatureDef[] = defs;

/** Everything a plan licenses today — planned features are excluded, because
 *  they cannot be used yet and selling access to them would be a lie. */
export function shippedFeaturesFor(plan: PlanId): readonly FeatureKey[] {
  return defs
    .filter((d) => d.status === "shipped" && isAtLeast(plan, d.minPlan))
    .map((d) => d.key);
}

/** For the pricing card: the handful of lines that describe what this plan
 *  adds over the one below it. */
export function featuresAddedBy(plan: PlanId): readonly FeatureDef[] {
  return defs.filter((d) => d.minPlan === plan);
}

export function featuresInGroup(group: FeatureGroup): readonly FeatureDef[] {
  return defs.filter((d) => d.group === group);
}

/**
 * How the three incumbents package the same ground, for the comparison table.
 *
 * Sourced from each vendor's published pricing in August 2026. Kept as data,
 * with a `note` per row, so a claim can be corrected in one place when a
 * competitor changes their plans — and so nothing here overstates: every row
 * describes packaging, not quality.
 */
export interface ComparisonRow {
  readonly claim: string;
  readonly vyora: string;
  readonly vyapar: string;
  readonly mybillbook: string;
  readonly zoho: string;
}

export const COMPARISON: readonly ComparisonRow[] = [
  {
    claim: "Try before you pay",
    vyora: "90 days of everything, then 30 more on the basics — no card",
    vyapar: "15-day trial, then paid",
    mybillbook: "Limited free mobile app; 14-day desktop trial",
    zoho: "Free plan up to ₹25 lakh annual revenue",
  },
  {
    claim: "Monthly invoice limit",
    vyora: "None, on any plan",
    vyapar: "None on paid plans",
    mybillbook: "Capped on the free app",
    zoho: "None, but revenue-capped on free",
  },
  {
    claim: "Cheapest paid plan",
    vyora: "₹291/month billed yearly, or ₹399 month-to-month",
    vyapar: "≈₹283/month, annual licence only",
    mybillbook: "₹291/month, annual billing only",
    zoho: "₹749/month billed yearly, plus GST",
  },
  {
    claim: "Works fully offline",
    vyora: "Yes — the whole ledger is on your device",
    vyapar: "Desktop only",
    mybillbook: "Partial",
    zoho: "No — cloud only",
  },
  {
    claim: "Pay monthly",
    vyora: "Yes",
    vyapar: "Annual licence only",
    mybillbook: "Annual billing only",
    zoho: "Yes",
  },
  {
    claim: "Multi-device sync",
    vyora: "Pro, unlimited devices",
    vyapar: "Higher tiers, per-device licences",
    mybillbook: "Paid plans",
    zoho: "Included (cloud)",
  },
  {
    claim: "Voice billing & bill-photo capture",
    vyora: "Pro",
    vyapar: "Not offered in the shop app",
    mybillbook: "Not offered",
    zoho: "Assistant features, partly early-access",
  },
  {
    claim: "Reports paywalled",
    vyora: "No — all 13 on every plan",
    vyapar: "Some on higher tiers",
    mybillbook: "Some on higher tiers",
    zoho: "Advanced analytics on top tier",
  },
  {
    claim: "Your data if you stop paying",
    vyora: "Full export, always — even after the workspace closes",
    vyapar: "Export from the app while licensed",
    mybillbook: "Export from the app while subscribed",
    zoho: "Export while the account is open",
  },
];

/** Guard for values arriving from the database or a URL. */
export function parseFeatureKey(value: unknown): FeatureKey | null {
  return typeof value === "string" && value in FEATURES
    ? (value as FeatureKey)
    : null;
}

/** Exported for tests that assert the catalogue stays consistent with the
 *  ladder. */
export const KNOWN_PLANS = PLAN_ORDER;
