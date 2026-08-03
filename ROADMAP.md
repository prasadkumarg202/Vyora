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
