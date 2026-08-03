# Vyora — Product Roadmap

> The AI-first, offline-first Business OS for Indian MSMEs.
> Goal: hold three axes at once that no incumbent holds together —
> **offline-first**, **metadata-driven by trade**, and **AI-first & India-native**.

## Why we win

The incumbents each own one axis and lose the rest:

- **Zoho Books** — powerful, but heavy, English-first, cloud-dependent, priced for larger SMBs.
- **Vyapar / myBillBook** — simple and cheap, but shallow: thin integrations, no real AI, generic forms.

Vyora holds all three:

- **Offline-first** — full local SQLite, works with zero internet, syncs to the cloud when it returns.
- **Metadata-driven** — choosing _Medical Store_ actually reshapes every field, invoice, DC, report, and GST posture. Nobody else does this.
- **AI-first & India-native** — voice billing, scan-and-sell, OCR bill capture, vernacular, UPI & WhatsApp rails.

That combination is the moat: a competitor can't copy it without rebuilding their foundation.

---

## Already shipped (our current edge)

- [x] Metadata engine — config-driven fields / validation / tax / invoice per 19 verticals
- [x] Diagnostic Centre vertical — pathology & imaging, keyed to the same `item_name` spine as every other trade. The first seeded vertical whose _output_ is exempt rather than taxed (healthcare by a clinical establishment, Notification 12/2017 entry 74), so `GstConfig` grew an `exempt` flag and `isBillOfSupply` now reads composition **or** exemption — both oblige a Bill of Supply, and modelling a lab as a composition dealer would have filed it as something it is not
- [x] Offline SQLite (OPFS) + IndexedDB outbox; local-first writes
- [x] Cloud sync runner — flush on reconnect, backoff, conflict engine, sync pill
- [x] Sales with trade-aware line editor (batch/expiry for chemists, etc.)
- [x] Printable tax invoice — HSN, CGST/SGST, amount-in-words, print + WhatsApp
- [x] Reports suite — Sales, Purchases, P&L, GST (B2B/B2C, GSTR-1 CSV), Day Book, Party Outstanding aging
- [x] GST module — config-aware slabs & trade reports
- [x] Suppliers, Expenses
- [x] Vyora Edge — Scan & Sell (POS), Voice Billing, Snap Bill (OCR), Credit Radar (Bharosa score), Stock Radar
- [x] UPI on invoice — `upi://` deep link + offline QR
- [x] Promotions studio — channel-aware (WhatsApp / SMS / Google Ads), festival & offer templates, AI copy, opt-in
- [x] Real AI wired via Gemini — assistant, OCR, voice parse, promo writer (key server-side, offline fallbacks)
- [x] Admin portal — 16 pages, broadcasts / push notifications, support ticketing workspace
- [x] 4-tier support model — AI Chatbot → AI Assistant → Virtual Assistant → Physical Assistant
- [x] Admin ticketing dashboard — Pending / In-progress / Completed status + open-source helpdesk integration (Chatwoot, FreeScout, osTicket, Zammad, Freshdesk) via server proxy
- [x] Installable desktop app (Windows / Mac) download from the website
- [x] Report Library — one engine, 13 reports (all transactions, cash flow, party outstanding & statement, stock summary, low stock, item-wise sales & profit, sales by HSN, sales by GST rate, expenses by category, account statement, loan statement) with FY presets, in-report search, CSV export and print
- [x] Cash & Bank — cash-in-hand and bank accounts with live balances, transfers, cheques (uncleared never counted), loans with repayment tracking
- [x] Supply Desk — supply orders that become purchase bills, supplier returns (debit notes), payments out
- [x] Growth Studio — AI business briefing grounded in on-device numbers (offline rule-based fallback), WhatsApp price list, Google-listing helper
- [x] Shared date-range picker — Indian FY (Apr–Mar) presets: today / yesterday / last 7 / this & last month / quarter / this & last FY / custom
- [x] Returns Desk — part-returns priced off the original bill, stock back on the shelf, receivable cleared
- [x] Marketing website (Vyapar-style landing) + Windows .exe via GitHub Actions releases; web app deployed on Cloudflare Workers
- [x] Estimates / Quotations & Delivery Challans — one-tap convert to invoice (`/quotes`)
- [x] Payment reminders — overdue list with one-tap WhatsApp chase (`/reminders`)
- [x] Invoice branding — shop address / GSTIN / phone / footer on every printed invoice
- [x] Bulk import ETL wizard — items & customers from CSV (Vyapar/Tally header auto-mapping), atomic, offline (`/import`)
- [x] Pricing & subscriptions — two paid plans (Pro ₹399 mo · ₹3,499 yr / Business ₹799 mo · ₹6,499 yr, incl. GST), a 90-day full-feature trial and a 30-day Basic wind-down before the workspace closes on day 120, public `/pricing` page with a feature matrix and an incumbent comparison, in-app plan & receipts screen
- [x] Entitlement engine — one catalogue in `@vyora/core` (`plans`, `features`, `entitlement`), a `useEntitlement()` hook, a single `UpgradeGate`, a shell-level `WorkspaceLocked` gate, server re-checks on every gated page and on the AI API routes, and export that outlives the lock
- [x] Billing backend — Supabase migration (typed plan state on the org, subscriptions, GST receipts with a numbered sequence, webhook event log), select-only RLS, and a provider interface with a mock Razorpay that signs and delivers real webhooks
- [x] Billing e2e — Playwright suite over the whole lifecycle: public `/pricing` signed out, day 1 / day 60 / day 91 / day 121, mock purchase → signed webhook → plan active → receipt, plus forged-signature, redelivery and client-priced-order attempts. Chromium snapshots for the pricing page, the upgrade gate, the lock screen and the paid subscription screen (`pnpm --filter @vyora/e2e test:e2e:billing`)
- [x] Catalogue lookup on the billing line — typing an item name searches the shop's own products (name, SKU or HSN, offline, against local SQLite) and fills HSN, GST rate, selling price and MRP; values stay editable, the product is never written back, and `invoice_items.product_id` now links the line to the catalogue. HSN rides through to the printed tax invoice even on the twelve verticals with no HSN box
- [x] Till quick keys — a row of one-press shortcuts above the billing lines, bound to the digits 1–9 (bare keys, suppressed while typing). Derived from the shop's own catalogue (most-billed, then newest) rather than a hardcoded per-trade list, and pinnable into a fixed order the shop controls, because a key that moves under a cashier's fingers bills the wrong item

---

## Next up — competitor parity, specced and ready to build

Three gaps found by walking Vyapar / myBillBook / Zoho Books side by side. Each
is specced enough to start cold.

### 1–2. Onboarding — DONE

Four steps after the OTP: business identity (name, verified phone, email,
GSTIN, PAN, base state, trade) → shop address → the five items you sell most
→ "how would you like to start?" (first invoice / import / look around).

- GSTIN and PAN are **optional**, because most of these shops are below the
  registration threshold. Blank is a real answer with a real consequence: GST
  and HSN are switched off for the workspace, so an unregistered shop bills
  without tax rather than printing a tax invoice it may not issue.
- A GSTIN that _is_ entered is cross-checked against the base state and the
  PAN — both are encoded inside it — and mismatches **warn without blocking**.
- Step 3 writes products to the local ledger, so the till's quick keys have
  something on day one.
- `create_workspace_profile()` writes the org, the owner membership and the
  profile in one definer call: between "create" and "update" the caller holds a
  token whose org_id claim is still null, so the update would be denied by the
  very policy it is meant to satisfy.

Still open from the original spec: retail-vs-distributor posture, sells-on-
credit, party-count and language — each of which must switch something on.

### 3. Subscriptions & billing — the money path _(built; awaiting KYC)_

Shipped in this phase. What remains is paperwork, not code:

- A Razorpay account and completed KYC. Setting `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` switches the provider
  from mock to live; nothing above `lib/billing/provider.ts` changes.
- **UPI AutoPay / e-mandate** for true auto-renew. The current flow charges a
  cycle at a time through orders; mandates need the live account first.
- Dunning: retry schedule and reminder mails on `past_due` (the 7-day grace
  window and the state machine already exist).

### Also outstanding

- Settings toggles stored but not yet honoured: block-sale-on-negative-stock
  (sales flow), batch/expiry (item form), the four print switches (invoice view).
- Trial Balance & Balance Sheet — need double-entry and a chart of accounts.
- GSTR-2 / 3B / 9, TDS/TCS — need purchase reconciliation and filing periods.
- Multi-currency; staff roles with real Sync & Share.

## Pricing — the decision, and why

**Basic (not for sale):** GST invoicing (no monthly cap, no turnover ceiling),
stock, purchases, expenses, parties, cash & bank, quotes/challans/returns,
Excel & CSV import-export, all 13 reports, local backup, UPI on the invoice.
One user, one device, no cloud sync. This is not a free tier — it is the
feature level a workspace runs at for the 30 days between the trial ending and
the workspace closing.

**Pro — ₹399/month or ₹3,499/year, incl. GST.** Cloud sync, unlimited devices,
3 users, automatic backup, and the whole Vyora Edge set: voice billing, Snap
Bill, Scan & Sell, the assistant, Credit Radar, Stock Radar, UPI auto-match,
Growth Studio, promotions, marketing, CRM, invoice branding.

**Business — ₹799/month or ₹6,499/year, incl. GST.** Unlimited users, and the
compliance and scale rails as they land: staff roles, branches & godowns,
e-way bill, e-invoicing, Tally export, loyalty, online store, barcode labels,
API, CA portal.

The reasoning:

- Vyapar and myBillBook both charge for _multi-device_ and _multi-user_ and
  ration e-way bills on entry tiers; Zoho Books gives away a genuinely full
  free plan but stops it at ₹25 lakh annual revenue. Keeping the bookkeeping
  core free with no ceiling is the one thing none of them do.
- Yearly is ~27–32% cheaper than monthly, and monthly exists at all — neither
  Vyapar nor myBillBook sells a monthly plan, which is a real friction point
  for a shop that does not want a year's commitment up front.
- Prices are GST-inclusive because that is the number a shopkeeper expects;
  the receipt shows the split so the input credit is still claimable.

**The lifecycle — 90 + 30, then closed:**

```
day 0 ───────────────── day 90 ──────────── day 120 ─────────▶
│ trialing              │ expired           │ locked
│ everything (Business) │ Basic only        │ pay, or export and leave
```

- Days 0–90: the whole product, no card, no sales call.
- Day 60: the banner appears (30 days left) and can be dismissed for a day.
- Days 90–120: Basic only — billing, stock and reports keep working. The
  banner shows the exact days remaining and **cannot** be dismissed.
- Day 120: the workspace closes. `(app)/layout.tsx` renders `WorkspaceLocked`
  instead of `children`, so there is no screen inside the app that can forget
  to check, because there is no screen inside the app.
- A lapsed _paying_ customer gets the same shape: 7-day retry window, then 30
  days on Basic, then locked.

**What survives the lock:** backup and full export, forever, without paying.
A shop's sales ledger is its statutory GST record; withholding it would be
worse than losing the customer. `LOCKED_FEATURES` is that list, and a test
asserts nothing else gets through.

All four numbers (90 / 30 / 120 / 7) are constants in
`@vyora/core/billing/entitlement`.

## Integration roadmap (ranked by leverage)

### Tier 1 — leapfrog Zoho entirely

- [ ] **ONDC sell-out** — list Vyora inventory on the Open Network for Digital Commerce; sell beyond the shop walls _(needs network-participant registration)_
- [ ] **Account Aggregator (RBI / Sahamati)** — consented bank feed + auto-reconciliation _(needs registered AA)_
- [ ] **Embedded lending (OCEN)** — working capital against the receivables ledger we already hold (Bharosa score) _(needs lending partner)_

### Tier 2 — money & compliance rails

- [ ] **UPI auto-reconciliation** — statement import → auto-match credits to open invoices → auto-mark paid _(buildable now, no contract)_ — **IN PROGRESS**
- [ ] **Payment links / UPI AutoPay / e-mandate** — Razorpay / Cashfree / PhonePe / Paytm with webhook auto-reco
- [ ] **GST e-invoicing (IRP/IRN) + e-Way Bill** — via a GSP (ClearTax / Masters India); mandatory at ₹5 Cr AATO _(needs GSP contract)_
- [ ] **GSTN IMS reconciliation** — purchase-invoice matching flow

### Tier 3 — channels & operations

- [ ] **WhatsApp Commerce / catalog** — order-on-WhatsApp → auto invoice _(needs WhatsApp Cloud API approval)_
- [ ] **Logistics** — Shiprocket / Delhivery / India Post: shipping label + tracking from an invoice or DC
- [ ] **Marketplace sync** — Amazon / Flipkart / Meesho inventory & orders
- [ ] **Tally two-way import/export** — keep the shop's CA happy (removes the #1 reason not to switch)

### Tier 4 — glue

- [ ] Google Business Profile (reviews / catalog)
- [ ] CA collaboration portal
- [ ] Excel / CSV import-export everywhere

---

## Product depth — parity list ("one by one")

- [x] Estimates / Quotations _(v1 shipped)_
- [x] Proforma bills & order booking _(share the sale-document engine; convert to invoice in one tap)_
- [x] Delivery Challan _(v1 shipped — stock movement on challan pending)_
- [x] Credit Notes — Returns Desk: credit note + stock restored + customer credited in one transaction _(debit notes / purchase returns still to do; GSTR-1 credit-note reporting is filing-side)_
- [ ] Balance Sheet
- [x] Automated payment reminders _(v1 shipped — one-tap WhatsApp; scheduled sends need WhatsApp API)_
- [ ] Barcode-in-Sales _(Scan & Sell covers the counter; label printing still to do)_
- [x] Excel import / export — direct .xlsx upload (zero-dependency reader), CSV import with Vyapar/myBillBook/Tally header auto-mapping, duplicate skip/update/add on SKU or phone, skipped-rows CSV report, one-click export of Items / Customers / Sales register, in-context buttons on each module _(parity: Zoho Books / myBillBook — exceeded on offline)_
- [ ] Online store — v1 shipped as a shareable WhatsApp price list; a hosted storefront with order capture still to build
- [ ] Loyalty _(entitlement `loyalty`, Business tier — listed on /pricing as roadmap, not sold)_
- [ ] Staff roles & permissions _(entitlement `staff_roles`, Business tier)_
- [ ] Godowns / multi-branch stock _(entitlement `multi_branch`, Business tier — myBillBook Platinum has this)_
- [ ] Barcode label printing _(entitlement `barcode_labels`, Business tier — myBillBook Platinum, Vyapar Platinum)_
- [ ] Tally two-way export _(entitlement `tally_export`, Business tier — myBillBook Enterprise only)_

---

## Blocked on external approvals (build against sandboxes now, go live on approval)

- ONDC network-participant registration
- GSP contract (GST e-invoicing / e-Way Bill / GSTN)
- WhatsApp Cloud API (bulk send)
- Sahamati Account Aggregator onboarding
- SMS provider (DLT) & Google Ads publishing

---

_Compliance note: e-invoicing is mandatory at ₹5 Cr aggregate annual turnover, with a 30-day IRP reporting window above ₹10 Cr, and 2FA on the e-invoice portal (as of 2026)._
