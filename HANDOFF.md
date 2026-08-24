# Vyora — handoff brief

Paste this as the first message of a new Cowork task, with `D:\websites\Vyora`
granted at the start.

---

I'm continuing work on **Vyora**, an offline-first GST billing / Business OS for
Indian MSMEs. Code is at `D:\websites\Vyora` (Windows), repo
`prasadkumarg202/Vyora`, live at `https://vyora.prasadkumar-g202.workers.dev`
(Cloudflare Workers, deploys on push). Supabase project `vxxfmgigfsgxzbxldqyk`.
Read `CONFIGURATION-SETUP.md` at the repo root first — it is current as of
9 Aug 2026 and covers auth, migrations, sync, signing and the build.

## How I work

- Check Vyapar, Zoho Books and myBillBook as competitors and tell me what we're
  missing. Take the best ideas but **do not copy them** — never reuse their
  wording, always find Vyora's own phrasing.
- Keep borders, easy date entry with preset options, a modern report look.
- Never ask me to paste secrets into chat. The Supabase service-role key goes
  from its dashboard straight into Cloudflare's secret field, nowhere else.

## Where things stand

**Auth** is SMS-first with an email fallback. Twilio is live and working. The
login screen picks the channel from what's typed: an `@` sends email, anything
else is normalised to `+91` E.164 and sent by SMS. Supabase test phone numbers
must stay empty or no real SMS is sent.

**Sync is two-way** as of today. `apps/web/src/lib/sync/runner.ts` pushes dirty
rows then pulls changes, on four triggers: reconnect, tab focus, a 30s
heartbeat, and on demand. Ten of nineteen tables sync. Known gaps, all
documented in `CONFIGURATION-SETUP.md` §10:

1. **Deletes do not propagate** — the server tables have no `deleted_at`, and
   the push filters on `deleted_at IS NULL`. This is the next thing to fix and
   needs a migration.
2. Quotations, delivery challans, returns documents and Cash & Bank don't sync;
   four of those have no Supabase table at all.
3. Invoice notes, terms, discount and charges stay local — they're not in the
   push mapper, so the cloud copy has `custom_fields: {}`.

**Supabase** migration history was repaired today; `supabase db push` works
normally now. Apply migrations with the CLI, never by pasting into the SQL
editor. Run the security advisor after any migration that adds a function —
Supabase's default grants gave `anon` and `authenticated` EXECUTE on
`apply_subscription`, which was the whole paywall, closed by migrations
`20260809104855` and `20260809105218`.

**Build:** always `pnpm turbo run check-types lint build --force`. A reported
full cache hit after editing source means it did not compile your changes, and
deploying then ships the old bundle.

## Queue, in the order I'd take it

1. Deletes / tombstones — migration adding `deleted_at` to the eight synced
   tables, then let tombstones travel.
2. The nine unsynced tables — schema work before sync work.
3. Code-sign the Windows installer. Unsigned today, so downloads park as
   `Unconfirmed …crdownload` and SmartScreen warns. Costs real customers.
4. Smaller debts: `metadataBase` missing in `apps/web/src/app/layout.tsx`; the
   `URL.createObjectURL` leak in `snap-bill/ocr-capture-module.tsx`; the last
   dead settings toggles (`stopSaleOnNegativeStock`, `trackBatchExpiry`,
   `placeOfSupply`, `showTimeOnInvoice`, `gstEnabled`, `compositeScheme`);
   two `react-hooks/exhaustive-deps` warnings in `cash-module.tsx`.
5. `ROADMAP.md` claims cloud sync ships with an IndexedDB outbox and conflict
   engine. `packages/sync/` has both, tested — and the runner doesn't use them.
   Correct the roadmap or wire them up.
6. ROADMAP parity gaps: Balance Sheet / Trial Balance, barcode labels,
   storefront, loyalty, staff roles, godowns, Tally export, GSTR-2/3B/9,
   multi-currency.

## Please start by

Running `git status` and `pnpm turbo run check-types lint build --force` to
confirm the tree is clean and compiles, then tell me what you find.
