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
- **Metadata-driven** — choosing *Medical Store* actually reshapes every field, invoice, DC, report, and GST posture. Nobody else does this.
- **AI-first & India-native** — voice billing, scan-and-sell, OCR bill capture, vernacular, UPI & WhatsApp rails.

That combination is the moat: a competitor can't copy it without rebuilding their foundation.

---

## Already shipped (our current edge)

- [x] Metadata engine — config-driven fields / validation / tax / invoice per 18 verticals
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

---


## Next up — competitor parity, specced and ready to build

Three gaps found by walking Vyapar / myBillBook / Zoho Books side by side. Each
is specced enough to start cold.

### 1. Deeper onboarding (myBillBook-style)
After the business type is chosen, ask four things that actually change the app:
who the customers are (retail vs distributor — drives default GST posture and
whether party GSTIN is required), whether they sell on credit (turns Credit
Radar and Reminders on or off), roughly how many parties (chooses list vs search
UI), and preferred language. Store in `sync_state` beside the other preferences;
each answer must switch something on, or leave it out.

### 2. "How would you like to start?" screen
Straight after onboarding, three routes: **Create your first invoice** (deep
link to /sales), **Import your data** (deep link to /import — already built),
**Look around** (dashboard). One screen, no video, no sales call.

### 3. Subscriptions & billing — the money path
Vyora has a /subscriptions page but no plans and no payment. Needed:
- Plan definitions (free tier + paid), monthly and yearly, priced in ₹.
- **UPI AutoPay / e-mandate** via Razorpay or Cashfree — the flow every Indian
  SaaS uses (mandate up to a max amount, small immediate charge, auto-renew).
- A Supabase edge function to create the subscription and, critically, a
  **webhook** to record payment state server-side. Never trust the browser's
  "payment succeeded" callback — that is the classic way to give away paid
  plans.
- Plan state on the org record, read by a `useEntitlement` hook; gate the
  premium surface (multi-user, unlimited e-way bills) in ONE place, not
  scattered `if` statements.
- Requires: a Razorpay/Cashfree account and KYC. Nothing here can be finished
  without it, so wire the sandbox first and switch keys at the end.

### Also outstanding
- Settings toggles stored but not yet honoured: block-sale-on-negative-stock
  (sales flow), batch/expiry (item form), the four print switches (invoice view).
- Trial Balance & Balance Sheet — need double-entry and a chart of accounts.
- GSTR-2 / 3B / 9, TDS/TCS — need purchase reconciliation and filing periods.
- Multi-currency; staff roles with real Sync & Share.

## Integration roadmap (ranked by leverage)

### Tier 1 — leapfrog Zoho entirely
- [ ] **ONDC sell-out** — list Vyora inventory on the Open Network for Digital Commerce; sell beyond the shop walls *(needs network-participant registration)*
- [ ] **Account Aggregator (RBI / Sahamati)** — consented bank feed + auto-reconciliation *(needs registered AA)*
- [ ] **Embedded lending (OCEN)** — working capital against the receivables ledger we already hold (Bharosa score) *(needs lending partner)*

### Tier 2 — money & compliance rails
- [ ] **UPI auto-reconciliation** — statement import → auto-match credits to open invoices → auto-mark paid *(buildable now, no contract)* — **IN PROGRESS**
- [ ] **Payment links / UPI AutoPay / e-mandate** — Razorpay / Cashfree / PhonePe / Paytm with webhook auto-reco
- [ ] **GST e-invoicing (IRP/IRN) + e-Way Bill** — via a GSP (ClearTax / Masters India); mandatory at ₹5 Cr AATO *(needs GSP contract)*
- [ ] **GSTN IMS reconciliation** — purchase-invoice matching flow

### Tier 3 — channels & operations
- [ ] **WhatsApp Commerce / catalog** — order-on-WhatsApp → auto invoice *(needs WhatsApp Cloud API approval)*
- [ ] **Logistics** — Shiprocket / Delhivery / India Post: shipping label + tracking from an invoice or DC
- [ ] **Marketplace sync** — Amazon / Flipkart / Meesho inventory & orders
- [ ] **Tally two-way import/export** — keep the shop's CA happy (removes the #1 reason not to switch)

### Tier 4 — glue
- [ ] Google Business Profile (reviews / catalog)
- [ ] CA collaboration portal
- [ ] Excel / CSV import-export everywhere

---

## Product depth — parity list ("one by one")

- [x] Estimates / Quotations *(v1 shipped)*
- [x] Proforma bills & order booking *(share the sale-document engine; convert to invoice in one tap)*
- [x] Delivery Challan *(v1 shipped — stock movement on challan pending)*
- [x] Credit Notes — Returns Desk: credit note + stock restored + customer credited in one transaction *(debit notes / purchase returns still to do; GSTR-1 credit-note reporting is filing-side)*
- [ ] Balance Sheet
- [x] Automated payment reminders *(v1 shipped — one-tap WhatsApp; scheduled sends need WhatsApp API)*
- [ ] Barcode-in-Sales *(Scan & Sell covers the counter; label printing still to do)*
- [x] Excel import / export — direct .xlsx upload (zero-dependency reader), CSV import with Vyapar/myBillBook/Tally header auto-mapping, duplicate skip/update/add on SKU or phone, skipped-rows CSV report, one-click export of Items / Customers / Sales register, in-context buttons on each module *(parity: Zoho Books / myBillBook — exceeded on offline)*
- [ ] Online store — v1 shipped as a shareable WhatsApp price list; a hosted storefront with order capture still to build
- [ ] Loyalty
- [ ] Staff roles & permissions

---

## Blocked on external approvals (build against sandboxes now, go live on approval)

- ONDC network-participant registration
- GSP contract (GST e-invoicing / e-Way Bill / GSTN)
- WhatsApp Cloud API (bulk send)
- Sahamati Account Aggregator onboarding
- SMS provider (DLT) & Google Ads publishing

---

*Compliance note: e-invoicing is mandatory at ₹5 Cr aggregate annual turnover, with a 30-day IRP reporting window above ₹10 Cr, and 2FA on the e-invoice portal (as of 2026).*
