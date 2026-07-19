# Vyora — Requirements Compliance Check

*Audit of the implementation in `apps/`, `packages/`, `supabase/` against
`design/README.md` (the approved spec). Prepared 18 Jul 2026.*

Legend: ✅ done · 🟡 partial · ⛔ not built · 🔒 blocked on external approval/keys.

## 1. Target stack & monorepo (spec §"Target Stack", "Build Order" 1–2)

| Requirement | Status | Evidence |
|---|---|---|
| Turborepo + pnpm workspaces (apps/web, apps/admin, packages ui/core/db/sync/crypto/ai/config, supabase, e2e) | ✅ | All present in tree; `pnpm-workspace.yaml`, `turbo.json` |
| Next.js + React + TS + Tailwind + PWA | ✅ | `apps/web` Next 15, serwist SW (`sw.ts`), manifest |
| Local data: SQLite WASM (OPFS) + IndexedDB outbox | ✅ | `lib/db/client.ts` worker, `@sqlite.org/sqlite-wasm`, `copy-sqlite-wasm.mjs` |
| Supabase (Postgres + RLS, Auth) | ✅ | 8 migrations incl. RLS, auth hooks |
| Crypto: AES-256-GCM, Argon2id KEK→DEK | 🟡 | `packages/crypto` exists; **only 2 tables carry `body_enc`** — zero-knowledge body-encryption is partially wired, not applied to every record type yet |
| AI provider router (Edge Functions) | ⛔ | `packages/ai` scaffolded; no edge functions / router live |
| Vitest + Playwright, GitHub Actions CI | ✅ | e2e specs for every module; `.github/workflows/ci.yml` |

## 2. Build phases (spec "Build Order" 1–10)

| Phase | Status |
|---|---|
| 1 Monorepo · 2 PWA shell + routing | ✅ |
| 3 Auth (Supabase OTP, device-bound sessions, JWT claims org_id/role/device_id) | ✅ — `lib/auth/actions.ts`, migrations 300/400/500; **login email delivery fixed by disabling gmail-sender custom SMTP** |
| 4 Design system (`packages/ui`) | 🟡 — components exist (Button/Card/Input/Label/Badge/EmptyState); **needs a token audit vs Design System.dc.html: Geist/Geist-Mono fonts + indigo `oklch(0.52 0.2 285)` ramp, radii 6/10/14, dark header band** |
| 5 Metadata engine (`packages/core`) | ✅ — `BusinessTypeConfig`, `parseBusinessTypeConfig`, `business_types` seeded (18 verticals) |
| 6 Offline + sync + crypto | 🟡 — offline + outbox ✅; crypto boundary partial (see §1) |
| 7 Modules | 🟡 — **see §3** |
| 8 Tests | ✅ structure; coverage gates (≥80% / 100% money+crypto) to be verified on a real run |
| 9 CI/CD | ✅ workflow present |
| 10 Deployment | ⛔ not configured (no host wired) |

## 3. Modules (spec Information Architecture — 18 modules, 7 zones)

**Built (real screens):** Sales ✅ · Inventory ✅ · Purchase ✅ · Payments ✅ · GST ✅ · Reports ✅ · CRM ✅ · Marketing ✅ · **Products ✅ (new)** · **Dashboard ✅ (new)** · **Customers ✅ (new)**.

**Still stubbed (ModulePlaceholder):**
| Module | To build | Data layer ready? |
|---|---|---|
| Suppliers | Directory + payables | table exists; **needs `saveSupplier`/`listSupplier` repo fns** |
| Expenses | Entry + categories + receipt OCR | `expenses` table exists; needs repo fns |
| Accounting | Ledgers, journals, day book | needs ledger repo layer |
| Settings | Business profile, GST rules, templates | needs settings read/write |
| Subscriptions | Usage, invoices, plan/cycle (Licensing spec) | needs billing layer |
| AI Assistant | Copilot chat, reviewable actions, OCR capture | 🔒 needs AI provider key + edge router |
| Administration | Permissions, devices, keys, audit, export | devices ✅; rest needs UI over existing tables |

## 4. Non-negotiable coding rules (spec)

| Rule | Status |
|---|---|
| Offline-first: every write to local DB first, background sync | ✅ (repository writes local, `dirty=1`) |
| Metadata-driven (no hardcoded per-vertical logic) | ✅ (config threaded via `loadTenantContext`) |
| Encryption boundary (server sees only ciphertext + id/org_id/updated_at/version) | 🟡 **partial — only 2 tables `body_enc`; the sensitive record bodies are not all encrypted yet. Biggest spec gap.** |
| Tenant isolation: org_id + RLS on every tenant table | ✅ (48 org_id refs; RLS migration) |
| Tests = definition of done | ✅ e2e present; unit coverage to confirm |

## 5. Advanced deliverables (spec files)

| Deliverable | Status | Note |
|---|---|---|
| Dynamic Business Engine (18 verticals metadata) | ✅ core | verify each vertical's fields/GST vs `.dc.html` |
| GST module (HSN summary, 3B position) | ✅ | computed from stored tax |
| **GST Filing (GSTN connect, GSTR-2B recon, submit)** | 🔒 | needs **GSP/GSTN API access** — external approval, not code |
| **Marketing (WhatsApp send)** | 🔒 | needs **WhatsApp Cloud API approval** — external |
| AI Copilot / OCR Engine | ⛔🔒 | needs AI provider key + edge functions |
| Licensing / Subscriptions | ⛔ | pricing spec exists; billing not built |
| Admin Portal (`apps/admin`) | 🟡 | app scaffolded; internal screens to build |
| Onboarding (business-selection → generated workspace) | 🟡 | `/welcome` bootstraps a workspace; the metadata-preview generator is minimal |
| Investor Deck / MCP Setup | ✅ reference | docs only, not app code |

## 6. Honest summary

**The foundation is genuinely strong and largely spec-compliant:** monorepo, PWA, offline SQLite + outbox, Supabase + RLS + auth with device sessions, the metadata engine, and 8 of the transactional modules were already built to the roadmap; this session added Products, Dashboard and Customers, and fixed login (SMTP sender).

**The real remaining gaps, in priority order:**
1. **Finish the stub modules** — Suppliers, Expenses, Accounting, Settings, Administration (each needs a small repo layer + a screen; buildable now).
2. **Complete the encryption boundary** — extend `body_enc` to all sensitive record types so the server is truly zero-knowledge (the spec's headline moat; a focused crypto+sync task).
3. **Design-token audit** — confirm `packages/ui` matches the exact Geist fonts + indigo oklch ramp + radii/elevation from `Vyora Design System.dc.html`.
4. **AI Copilot + OCR** — needs an AI provider API key and edge functions (🔒 your keys).
5. **GST Filing + WhatsApp** — 🔒 blocked on GSTN/GSP and WhatsApp Cloud API approvals (external, not code — start these now, they have lead time).
6. **Deployment** — wire Vercel (web/admin) + Supabase prod.

**What this session cannot do for you:** run `pnpm build`/tests (registry blocked in this sandbox — verify on your machine), obtain the GSTN/WhatsApp/AI approvals and keys, or push to GitHub (network-blocked here — you push). Everything else is incremental build work I can continue module by module.
