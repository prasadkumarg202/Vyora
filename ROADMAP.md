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

- [ ] Estimates / Quotations
- [ ] Delivery Challan
- [ ] Credit / Debit Notes
- [ ] Balance Sheet
- [ ] Automated payment reminders
- [ ] Barcode-in-Sales
- [ ] Excel import / export
- [ ] Online store
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
