import type { Route } from "next";

/**
 * The 18 modules across 7 nav zones, transcribed from
 * `design/Vyora Information Architecture.dc.html`.
 *
 * This is the *full* map. The sidebar is adaptive: which modules a given
 * workspace actually shows is driven by `business_types.config` (the metadata
 * engine, Phase 5) and by the role-visibility matrix (Phase 3). Nothing here
 * encodes per-vertical behaviour — it is only the route catalogue.
 *
 * Module sub-pages render as in-page tabs and arrive with each module in
 * Phase 7.
 */

export interface NavModule {
  /** Display name as written in the IA spec. */
  readonly label: string;
  readonly href: Route;
  /** One-line purpose, from the IA module map. */
  readonly summary: string;
  /** Roadmap phase that implements this module. */
  readonly phase: string;
}

export interface NavZone {
  readonly id: string;
  /** Zone number from the IA spec (01–07). */
  readonly ordinal: string;
  readonly label: string;
  readonly tagline: string;
  readonly modules: readonly NavModule[];
}

export const NAV_ZONES: readonly NavZone[] = [
  {
    id: "overview",
    ordinal: "01",
    label: "Overview",
    tagline: "Where the day starts",
    modules: [
      {
        label: "Dashboard",
        href: "/dashboard",
        summary: "At-a-glance KPIs, alerts, and AI suggestions.",
        phase: "Phase 7",
      },
      {
        label: "AI Assistant",
        href: "/assistant",
        summary: "Copilot chat, suggestions, OCR capture, ask reports.",
        phase: "Phase 5",
      },
    ],
  },
  {
    id: "sell",
    ordinal: "02",
    label: "Sell",
    tagline: "Everything revenue-facing",
    modules: [
      {
        label: "Sales",
        href: "/sales",
        summary: "Invoices, POS, quotations, orders, challans, credit notes.",
        phase: "Phase 7",
      },
      {
        label: "CRM",
        href: "/crm",
        summary: "Leads, pipeline, activities, follow-ups.",
        phase: "Phase 7",
      },
      {
        label: "Marketing",
        href: "/marketing",
        summary: "Campaigns, broadcasts, templates, coupons, segments.",
        phase: "Phase 7",
      },
      {
        label: "Promotions",
        href: "/promotions",
        summary: "Festival & offer templates, AI writer, WhatsApp send.",
        phase: "Phase 7",
      },
    ],
  },
  {
    id: "buy",
    ordinal: "03",
    label: "Buy",
    tagline: "Sourcing and spend",
    modules: [
      {
        label: "Purchase",
        href: "/purchase",
        summary: "Purchase orders, bills, GRN, debit notes.",
        phase: "Phase 7",
      },
      {
        label: "Expenses",
        href: "/expenses",
        summary: "Entries, categories, recurring, receipt OCR.",
        phase: "Phase 7",
      },
    ],
  },
  {
    id: "catalog",
    ordinal: "04",
    label: "Catalog",
    tagline: "What you stock and sell",
    modules: [
      {
        label: "Products",
        href: "/products",
        summary: "Catalog, categories, price lists, import.",
        phase: "Phase 7",
      },
      {
        label: "Inventory",
        href: "/inventory",
        summary: "Stock levels, adjustments, transfers.",
        phase: "Phase 7",
      },
    ],
  },
  {
    id: "contacts",
    ordinal: "05",
    label: "Contacts",
    tagline: "People you do business with",
    modules: [
      {
        label: "Customers",
        href: "/customers",
        summary: "Directory, statements, outstanding, loyalty.",
        phase: "Phase 7",
      },
      {
        label: "Suppliers",
        href: "/suppliers",
        summary: "Directory, payables, statements.",
        phase: "Phase 7",
      },
    ],
  },
  {
    id: "finance",
    ordinal: "06",
    label: "Finance",
    tagline: "Money, tax & insight",
    modules: [
      {
        label: "Payments",
        href: "/payments",
        summary: "Received, made, reminders, payment links, reconcile.",
        phase: "Phase 7",
      },
      {
        label: "Accounting",
        href: "/accounting",
        summary: "Ledgers, journals, chart of accounts, day book.",
        phase: "Phase 7",
      },
      {
        label: "GST",
        href: "/gst",
        summary: "HSN summary, reconciliation, filing status.",
        phase: "Phase 7",
      },
      {
        label: "Reports",
        href: "/reports",
        summary: "Inventory, custom builder.",
        phase: "Phase 7",
      },
    ],
  },
  {
    id: "workspace",
    ordinal: "07",
    label: "Workspace",
    tagline: "Set up and run the business",
    modules: [
      {
        label: "Subscriptions",
        href: "/subscriptions",
        summary: "Usage, invoices.",
        phase: "Phase 7",
      },
      {
        label: "Settings",
        href: "/settings",
        summary: "Business profile, GST rules, invoice templates.",
        phase: "Phase 7",
      },
      {
        label: "Administration",
        href: "/administration",
        summary: "Permissions, devices, encryption keys, audit log, export.",
        phase: "Phase 7",
      },
      {
        label: "Help & Support",
        href: "/support",
        summary: "Chat, WhatsApp & Instagram support, FAQs, raise a ticket.",
        phase: "Phase 7",
      },
    ],
  },
  {
    id: "edge",
    ordinal: "08",
    label: "Vyora Edge",
    tagline: "What the others don't have",
    modules: [
      {
        label: "Scan & Sell",
        href: "/scan-sell",
        summary: "Your camera is the barcode scanner + POS. Scan, charge, collect by UPI.",
        phase: "Phase 7",
      },
      {
        label: "Voice Billing",
        href: "/voice-bill",
        summary: "Speak the sale in your language — it becomes an invoice.",
        phase: "Phase 7",
      },
      {
        label: "Snap Bill",
        href: "/snap-bill",
        summary: "Photograph a supplier bill — AI reads it & books the purchase.",
        phase: "Phase 7",
      },
      {
        label: "Credit Radar",
        href: "/credit-radar",
        summary: "Bharosa score & safe udhaar limit for every customer.",
        phase: "Phase 7",
      },
      {
        label: "Stock Radar",
        href: "/stock-radar",
        summary: "Dead & slow stock, capital stuck, clearance actions.",
        phase: "Phase 7",
      },
      {
        label: "UPI Auto-Match",
        href: "/reconcile",
        summary: "Paste a UPI/bank statement — credits auto-match to invoices & mark paid.",
        phase: "Phase 7",
      },
    ],
  },
] as const;

/** Flat module list — useful for route generation and tests. */
export const NAV_MODULES: readonly NavModule[] = NAV_ZONES.flatMap(
  (zone) => zone.modules,
);

/**
 * Mobile bottom nav: at most 5 items, per the design spec. The centre slot is
 * a FAB for the primary create action, added with Sales in Phase 7.
 */
export const MOBILE_NAV: readonly NavModule[] = [
  NAV_ZONES[0]!.modules[0]!, // Dashboard
  NAV_ZONES[1]!.modules[0]!, // Sales
  NAV_ZONES[3]!.modules[0]!, // Products
  NAV_ZONES[0]!.modules[1]!, // AI Assistant
];
