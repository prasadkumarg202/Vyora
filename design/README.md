# Handoff: Vyora — AI-first, Offline-first Business OS for Indian MSMEs

## Overview
Vyora is a multi-tenant SaaS "Business OS" for Indian MSMEs: metadata-driven billing/inventory/GST that adapts per business type (pharmacy, restaurant, jewellery… 18 verticals), works fully offline, syncs in the background, encrypts business data client-side (zero-knowledge), and ships an AI copilot, OCR, and WhatsApp marketing. This package contains the complete, approved design + specification set (Phases 0–17).

## About the Design Files
The `.dc.html` files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, NOT production code to copy. Your task is to **recreate these designs in the target stack** using its patterns and libraries. They open in a browser (keep `support.js` beside them).

## Target Stack (specified by the roadmap doc)
- **Monorepo**: Turborepo + pnpm workspaces (`apps/web`, `apps/admin`, `packages/ui|core|db|sync|crypto|ai|config`, `supabase/`, `e2e/`)
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, PWA (Workbox), React Hook Form
- **Local data**: SQLite WASM persisted in OPFS + IndexedDB (sync outbox, settings)
- **Cloud**: Supabase (Postgres + RLS, Auth, Realtime, Storage, Edge Functions)
- **Crypto**: client-side AES-256-GCM; Argon2id-derived KEK wrapping a random DEK
- **AI**: provider router (Claude / Gemini / OpenRouter) via Edge Functions
- **Tests**: Vitest + Playwright; CI/CD via GitHub Actions

## Fidelity
**High-fidelity.** All screens use final colors, type, spacing, and copy. Recreate pixel-perfectly with the design tokens below, implemented as a Tailwind theme + shadcn/ui in `packages/ui`.

## Build Order (from `Vyora Build Roadmap.dc.html`)
1. Monorepo → 2. Project structure + PWA shell → 3. Auth (Supabase OTP, device-bound sessions) → 4. Design system (`packages/ui`) → 5. Metadata engine (`packages/core`) → 6. Offline storage + sync + crypto → 7. Modules one by one (Sales → Inventory → Purchase → Payments → GST → Reports → CRM → Marketing) → 8. Tests → 9. CI/CD → 10. Deployment.

### Non-negotiable coding rules
- Offline-first: every write commits to the local DB first; sync is background-only.
- Metadata-driven: no hardcoded per-vertical logic; behavior comes from `business_types.config` (see the engine file for the exact JSON shape).
- Encryption boundary: record bodies encrypted client-side; server/edge only ever see ciphertext + routing metadata (`id`, `org_id`, `updated_at`, `version`).
- Tenant isolation: every tenant table has `org_id` + RLS policy `using (org_id = auth.jwt()->>'org_id')`.
- Tests are the definition of done; small module-scoped PRs; secrets in env only.

## Design Tokens
- **Fonts**: Geist (UI), Geist Mono (numbers, codes, GSTIN/IMEI, tabular figures). Google Fonts, weights 400–700.
- **Primary (indigo)**: `oklch(0.52 0.2 285)`; hover `oklch(0.44 0.2 285)`; tonal bg `oklch(0.96 0.025 285)`; full 50–900 ramp in the Design System file.
- **Neutrals (cool, hue 280)**: bg `oklch(0.975 0.004 280)`, surface `#fff`, border `oklch(0.9–0.92 0.006 280)`, text `oklch(0.24 0.02 280)`, muted `oklch(0.55 0.015 280)`.
- **Semantic**: success `oklch(0.6 0.14 155)`, warning `oklch(0.75 0.15 75)`, danger `oklch(0.58 0.2 25)`, info `oklch(0.6 0.14 235)` (each with tonal bg/border variants shown in the files).
- **Spacing**: 4px base grid (4/8/12/16/20/24/32/48/64). **Radius**: 6 controls · 10 inputs · 14–16 cards · 999 pills. **Elevation**: 3 soft cool shadows (rest / card / overlay).
- **Type scale**: Display 34/650, H1 28/650, H2 23/650, H3 18/600, body-lg 15, body 13.5, caption 11/600 caps. Dark header band: `oklch(0.22 0.03 280)`.
- **Status badges**: pill, 11px/600, tonal bg + border (paid/green, pending/amber, overdue/red, info/indigo, neutral/gray).
- **Mobile**: bottom nav (≤5 items) + center FAB; touch targets ≥44px; breakpoints 640/768/1024/1280; sync-status pill persists on every screen.

## Files (spec map)
| File | What it specifies |
|---|---|
| `Vyora Index.dc.html` | Hub linking all deliverables in build order |
| `Vyora Product Vision.dc.html` | Vision, pillars, positioning, success metrics |
| `Vyora System Architecture.dc.html` | 7-layer architecture: client → local data → sync → Supabase → tenant data → AI → channels |
| `Vyora Offline Architecture.dc.html` | SQLite WASM/OPFS/IndexedDB roles, outbox record shape + state machine, sync triggers, retry/backoff, conflict-resolution table (LWW, field-merge, tombstones, CRDT counters, UUID keys). Interactive sim included |
| `Vyora Database Schema.dc.html` | 20 Postgres tables with columns/types/keys, RLS scoping, `custom_fields jsonb`, encrypted `body_enc` |
| `Vyora Security Architecture.dc.html` | AES-256-GCM flow, Argon2id KEK→DEK hierarchy, RLS policy snippet, RBAC matrix, hash-chained audit, JWT claims, device management |
| `Vyora Design System.dc.html` | Full token + component spec (buttons, forms, cards, nav, table, dialog, states, widgets, charts, mobile) |
| `Vyora Information Architecture.dc.html` | 18 modules in 7 nav zones, sub-pages per module, role visibility matrix |
| `Vyora User Flows.dc.html` | 14 journeys with decision branches (login, first invoice, purchase, return, payment, backup/restore, subscription, AI, OCR, stock) |
| `Vyora Onboarding.dc.html` | 3 UX directions for business selection → generated workspace (canvas; ids 1a/1b/1c) |
| `Vyora Dynamic Business Engine.dc.html` | **The core spec**: 18 business types with required/optional fields, validations, GST rules, invoice templates, reports, and the exact metadata JSON record (interactive) |
| `Vyora AI Copilot.dc.html` | 8 AI capabilities with response formats + privacy model (interactive chat) |
| `Vyora OCR Engine.dc.html` | OCR pipeline, per-field confidence tiers (≥92 auto / 85–91 highlight / <85 review), 5 document types (interactive) |
| `Vyora Marketing Module.dc.html` | Campaign builder: 5 channels, 5 campaign types, segments, WhatsApp preview, automation triggers (interactive) |
| `Vyora Licensing.dc.html` | Seat tiers (1/3/5/10/unlimited), monthly/1y/2y/3y pricing (1-user: ₹999 / ₹1,450 / ₹2,100 totals), trial, renewal, transfer, devices (interactive) |
| `Vyora App.dc.html` | **Primary screen reference**: splash → OTP login → company setup → business selection → app shell with all 20 core screens (interactive) |
| `Vyora Admin Portal.dc.html` | Internal SaaS-team portal: tenants, subscriptions, billing, templates, feature flags, form builder, themes, AI analytics, support, audit (interactive) |
| `Vyora GST Filing.dc.html` | Self-serve monthly GST filing: GSTN connect (GSTIN + portal user, API checklist, OTP consent, GSP pipeline), GSTR-2B reconciliation, CA-grade adjustments (reduce-tax + protect-from-notices, each citing its rule), computation traced to source, GSTR-1/3B submit (interactive) |
| `Vyora API Spec.dc.html` | Thin sync API: encrypted record envelope shape, endpoint catalogue (auth, orgs, sync push/pull, OCR, GST, AI, marketing, billing), error model, idempotency, rate limits |
| `Vyora Authentication.dc.html` | Phone/OTP login → key-unwrap flow, JWT claim set (`org_id`/`role`/`device_id`), 15-min access + rotating refresh, RBAC matrix, trusted-device management |
| `Vyora Sync Engine.dc.html` | Outbox state machine (pending→syncing→synced/failed + backoff), 4-step sync cycle, flush triggers, per-record-type conflict-resolution rules (immutable, field-merge, CRDT counters, LWW, tombstones) |
| `Vyora Security Architecture.dc.html` | Zero-knowledge AES-256-GCM flow, Argon2id KEK→DEK key hierarchy, RLS policy, RBAC, hash-chained audit, JWT claims, device management, consent-based support access |
| `Vyora Testing Strategy.dc.html` | Test pyramid (Vitest/Playwright), adversarial coverage for money math / offline sync / encryption boundary, per-type ownership, coverage gates (≥80% overall, 100% money+crypto), 6 CI gates |
| `Vyora MCP Setup.dc.html` | MCP servers to connect, grouped, with install order |
| `Vyora Investor Deck.dc.html` | 12-slide raise deck (deck-stage): problem, ₹6,300 Cr TAM, metadata platform, offline + zero-knowledge moats, AI, PO→invoice→WhatsApp/Instagram flow, self-serve GST (₹10k/yr CA savings), ₹999 vs ₹13k pricing, business model, roadmap & ask — presentation reference, not app code |
| `Vyora Index.dc.html` | Hub linking all 23 deliverables in build order — start here to navigate the package |
| `Vyora Build Roadmap.dc.html` | Monorepo layout, 10 build phases, coding rules |
| `deck-stage.js` | Slide-deck runtime for the Investor Deck — reference only, do not port |
| `support.js` | Runtime for viewing the `.dc.html` prototypes — reference only, do not port |

## Interactions & Behavior (key ones to preserve)
- Sync pill (Synced/Offline) is global and clickable state, present in every app screen; offline never blocks any action.
- Business selection instantly generates the workspace from metadata (fields/GST/reports preview before confirm).
- Copilot returns **reviewable actions** (draft invoice/PO) — user confirms before anything saves.
- OCR flags any field <85% confidence for review before creating a record.
- Feature flags, plan/cycle pickers, channel toggles, and screen navigation behave exactly as in the prototypes.

## State Management
- Local-first: UI reads/writes SQLite WASM; a persistent outbox (IndexedDB) with states `pending → syncing → synced | failed`; flush on `online` event, SW Background Sync, periodic timer, or manual.
- Server truth: Postgres versions (`version int`, `updated_at`) drive deterministic conflict resolution.
- Auth/session: JWT with `org_id`, `role`, `device_id`; 15-min access + rotating refresh.

## Assets
No external imagery. Logo is a rounded square with "V" (primary indigo). All icons in prototypes are placeholder squares/dots — use Lucide (shadcn default) in implementation, matching the sizes shown.
