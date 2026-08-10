# Configuration & Setup

Everything in Vyora that is tied to a specific domain, account or hosting
provider — and what to change when any of them changes.

The short version: **four files in the repo, three dashboards.** Everything
else resolves relatively and needs no attention. If you are moving Vyora to a
new domain, work through this document top to bottom and you will not miss
anything.

Current values as of this writing:

| Thing | Current value |
| --- | --- |
| Web app origin | `https://vyora.prasadkumar-g202.workers.dev` |
| Cloudflare Worker name | `vyora` |
| GitHub owner / repo | `prasadkumarg202` / `Vyora` |
| Desktop app id | `in.vyora.desktop` |
| Supabase project | `hvvsmtiytihlbzlkkbjl.supabase.co` |

---

## 1. Files in the repo

These are the only places a domain, account or repo name is written into the
source. A find-and-replace across these four files covers the code side
completely.

### `apps/desktop/electron/main.js`

```js
const PROD_URL = "https://vyora.prasadkumar-g202.workers.dev";
```

The URL the installed Windows app loads. Change it and rebuild the installer
(see §5) — an existing `.exe` keeps pointing at the old origin forever, because
the URL is compiled into it.

The same file derives `APP_ORIGIN` and `START_URL` (`/dashboard`) from this
constant, so there is one line to change, not three. `VYORA_APP_URL` overrides
it at runtime, which is how you point a local build at staging without
rebuilding.

### `apps/desktop/electron-builder.yml`

```yaml
appId: in.vyora.desktop      # reverse-DNS id; change if the domain changes
publish:
  owner: prasadkumarg202     # GitHub account that owns the releases
  repo: Vyora
```

Changing `appId` makes Windows treat it as a different application — the new
version installs alongside the old one instead of upgrading it. Only change it
if you genuinely want a clean break.

### `apps/web/src/lib/downloads.ts`

```ts
export const WINDOWS_INSTALLER_URL =
  "https://github.com/prasadkumarg202/Vyora/releases/latest/download/Vyora-Setup.exe";
```

Where every "Download for Windows" button on the marketing site points. Must
match the `owner`/`repo` above, or the site offers a 404. The `latest` path is
deliberate — it never needs updating per release, only per repo.

### `apps/web/wrangler.jsonc`

```jsonc
"name": "vyora",
```

The Worker name, which produces the default `<name>.<account>.workers.dev`
hostname. To serve a custom domain instead, add a routes block:

```jsonc
"routes": [
  { "pattern": "app.yourdomain.in", "custom_domain": true }
]
```

The domain must already be in the same Cloudflare account as a zone. Leave
`run_worker_first: true` alone whatever you do — it is what makes Next's
COOP/COEP headers apply to every response, and without those headers
`SharedArrayBuffer` is unavailable and the on-device SQLite silently falls back
to memory. Invoices then disappear on reload. That flag is not a performance
tuning knob.

---

## 2. What does *not* need changing

Worth knowing so you do not go hunting:

`apps/web/src/app/manifest.ts` uses relative paths (`start_url: "/"`,
`/icons/...`), so the PWA follows whatever origin serves it. Every internal
link uses Next's router with relative hrefs. The service worker scope is `/`.
Supabase client URLs come from environment variables, not source.

**One real gap:** `apps/web/src/app/layout.tsx` sets no `metadataBase`. Open
Graph and Twitter card images therefore resolve against whatever origin Next
guesses, which can produce broken preview images when the site is shared. If
you are moving to a real domain, add it:

```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://app.yourdomain.in"),
  // ...
};
```

---

## 3. Cloudflare

### 3.1 Account and API access

You only need an API token if you deploy from your own machine or from CI.
Cloudflare's git integration (the usual path here) needs none — it authenticates
through the GitHub app.

| Value | Where to find it | Used for |
| --- | --- | --- |
| Account ID | Workers & Pages → right sidebar | `wrangler` CLI, CI |
| API token | My Profile → API Tokens → Create Token | `wrangler deploy` outside the dashboard |

For a deploy token, start from the **Edit Cloudflare Workers** template rather
than granting global scopes. It needs `Account → Workers Scripts → Edit` and
`Account → Workers KV Storage → Edit`; add `Zone → Workers Routes → Edit` only
if you attach a custom domain. Store it as `CLOUDFLARE_API_TOKEN` — as a GitHub
Actions secret if CI deploys, or in your shell if you run
`pnpm --filter @vyora/web run deploy` by hand. It is a full write credential
for your Workers: treat it like the service-role key.

### 3.2 Build settings

Workers & Pages → your project → Settings → Build.

| Setting | Value | Why |
| --- | --- | --- |
| Root directory | `apps/web` | Omitting it fails with `npm error could not determine executable to run` — Cloudflare runs the build from the repo root and finds no Next app |
| Build command | `npx opennextjs-cloudflare build` | OpenNext adapter; plain `next build` produces no Worker |
| Deploy command | `npx wrangler deploy` | Usually inferred |
| Node version | 22+ | Set `NODE_VERSION` if the default is older |
| Package manager | pnpm (detected from `packageManager` in the root `package.json`) | Must stay in step with the lockfile version, or `--frozen-lockfile` fails |

Builds run `pnpm install --frozen-lockfile`. A lockfile that is out of date
with `package.json` fails the build outright — run `pnpm install` locally and
commit `pnpm-lock.yaml` whenever you change a dependency.

### 3.3 Variables and secrets

Settings → Variables and Secrets. The distinction is not cosmetic: **Next
inlines anything prefixed `NEXT_PUBLIC_` into the browser bundle at build
time**, so those must exist as *build* variables. Adding them as runtime
secrets does nothing at all — the bundle was already compiled without them, and
the app fails with a zod validation error on `/login`.

| Name | Kind | Needed at | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Build variable, plaintext | Build | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build variable, plaintext | Build | Public; RLS is what protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Runtime | Bypasses RLS. Write-only in the UI once saved |
| `GEMINI_API_KEY` | Secret | Runtime | Snap Bill OCR, voice billing, the assistant |
| `GEMINI_MODEL` | Variable, plaintext | Runtime | Optional; overrides the default for every route |
| `GEMINI_MODEL_TEXT` | Variable, plaintext | Runtime | Optional; the assistant and the promo writer. Safe to point at a cheap Lite model |
| `GEMINI_MODEL_VISION` | Variable, plaintext | Runtime | Optional; Snap Bill OCR and voice billing. Leave on a capable model — see below |
| `NEXTJS_ENV` | Already in `wrangler.jsonc` | Build | Do not duplicate here |

Razorpay keys (§6) join this list when you go live.

Rule of thumb: changing a `NEXT_PUBLIC_*` value needs a **rebuild**; changing a
secret takes effect on the next request.

**On the two model variables.** Resolution is most-specific-first:
`GEMINI_MODEL_TEXT` / `GEMINI_MODEL_VISION` → `GEMINI_MODEL` → the built-in
default. An environment that sets only `GEMINI_MODEL` keeps working exactly as
before, and one that sets nothing gets a full Flash rather than a Lite — an
unconfigured shop should get the safe answer, not the cheap one.

Point `GEMINI_MODEL_TEXT` at whatever is cheapest: the assistant answers from a
short context in about 120 words, and it is the route that runs on every
question anyone asks. Leave `GEMINI_MODEL_VISION` on a capable model. Reading a
crumpled supplier bill under a tube light, and transcribing accented speech over
counter noise, are the two hardest things this product does — and a wrong number
out of either does not stay put. It flows into stock, into GST and into the
margin report, with nothing downstream to reveal that a photograph caused it.

### 3.4 Custom domain

Add it under the Worker's Settings → Domains & Routes, or via the `routes`
block in §1. The zone must already be in the same Cloudflare account. Then
update Supabase (§4) and the desktop app (§1) to match, in that order — §7 has
the full sequence.

---

## 4. Supabase

Four screens matter. Getting one right and not the others produces a login that
looks like it works and then silently fails.

### 4.1 Project Settings → API — where the values come from

This screen is the source for all three Supabase environment variables. Nothing
here is edited; you copy from it.

| Field on screen | Goes into | Sensitivity |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Public |
| Publishable / anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public — ships in the browser bundle |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses row-level security entirely |

The anon key being public is by design — row-level security is what protects
data, not key secrecy. The `service_role` key is the opposite: anyone holding
it can read and write every tenant's records. It belongs only in a secrets
store, typed straight from this screen into Cloudflare. Never in the repo,
never in a chat window, never as a build variable.

If you rotate keys here, update Cloudflare (§3) and rebuild.

### 4.2 Authentication → Providers

Vyora signs in **mobile-first, with email as the fallback**. `lib/auth/actions.ts`
calls `signInWithOtp` with `shouldCreateUser: true` on whichever channel is
asked for, so the same flow both registers and signs in — there is no separate
sign-up form. The login screen picks the channel from what was typed: an entry
containing `@` goes by email, anything else is normalised to E.164 (`+91` plus
ten digits starting 6–9) and goes by SMS. **Both providers must be enabled**,
or half your users cannot get in.

- **Phone** — enabled, and the primary path.
  - *SMS provider* — Twilio. Needs the **Account SID** (starts `AC…`), its
    **Auth Token**, and a **Messaging Service SID** (`MG…`) belonging to the
    same account. An API Key SID (`SK…`) in the Account SID field, or a
    messaging service living in a different subaccount, both fail with Twilio
    error **20003 — Permission Denied**, which appears in the Supabase auth log
    as `422 sms_send_failed`. Verify a pair before trusting it:
    `curl -X GET "https://api.twilio.com/2010-04-01/Accounts/ACxxxx.json" -u ACxxxx:auth_token`
  - *Enable phone confirmations* — on.
  - *SMS OTP expiry* — must agree with `SMS_OTP_MINUTES` in
    `components/auth/login-form.tsx` (currently **3**) and with the wording of
    the SMS template. Three places, one promise.
  - *Test Phone Numbers and OTPs* — **empty in production.** Any number listed
    here never receives a real message; Supabase accepts the fixed code you
    registered instead. It is the usual reason for "SMS is configured but
    nothing arrives".
  - India: delivery to Indian numbers also requires **DLT registration** of the
    sender ID and template on the Twilio account. A DLT problem is a delivery
    error, not a 20003 — fix authentication first, then look at delivery.
- **Email** — enabled, as the fallback behind "No SMS? Use your email instead".
  - *Confirm email* — on. First-time users get the Confirm-signup template.
  - *Email OTP Expiration* — default 3600s; above 86400 Supabase rejects it as a
    brute-force risk. Must agree with `EMAIL_OTP_MINUTES` in `login-form.tsx`
    (currently **5**), so set 300 unless you change the constant.
  - *Secure email change* — leave on.
- **Google / GitHub / any OAuth** — off. Nothing in the app calls
  `signInWithOAuth`. If you enable one later you must also add its callback to
  the redirect allow list in §4.3, and add a button — the provider being
  enabled in Supabase does nothing on its own.

Anonymous sign-ins: off. Tenancy is keyed to a real user.

### 4.3 Authentication → URL Configuration

- **Site URL**: the origin, no trailing slash, no wildcard —
  `https://app.yourdomain.in`
- **Redirect URLs**: add `https://app.yourdomain.in/**`, and keep
  `http://localhost:3000/**` so local development still works

Site URL is what Supabase builds confirmation links from. If it still says
`localhost:3000`, every email sends users to a dead tab on their own machine.

The app also passes `emailRedirectTo: ${origin}/auth/callback` on every sign-in
request, so `/auth/callback` must fall inside one of the allowed patterns. The
`/**` suffix covers it.

### 4.4 Authentication → Email Templates

Vyora signs in with a six-digit code, not a magic link. Supabase decides which
to send purely from the template contents: `{{ .Token }}` present means a code,
`{{ .ConfirmationURL }}` present means a link. Both **Confirm signup** (first
sign-in) and **Magic Link** (every sign-in after) must carry the token, or new
users work and returning users break.

Subject:

```
{{ .Token }} is your Vyora code
```

Body:

```html
<h2>Your Vyora sign-in code</h2>
<p>Enter this code in Vyora to finish signing in:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>It expires in a few minutes. If you didn't ask for this, ignore this email.</p>
```

Putting the code in the subject lets a shopkeeper read it from the phone
notification without opening the mail.

Supabase's built-in mailer is rate-limited and not for production volume. Once
you have real users, configure a custom SMTP sender under Project Settings →
Authentication → SMTP, or codes will start silently not arriving.

### 4.4b Authentication → Phone → SMS message

The SMS template is separate from the email ones and uses a different
placeholder: `{{ .Code }}`, not `{{ .Token }}`. Keep it short — one segment —
and keep the stated validity in step with the OTP expiry and with
`SMS_OTP_MINUTES`:

```
{{ .Code }} is your Vyora code. Valid 3 minutes.
```

### 4.5 Database

Migrations live in `supabase/migrations/`. A new project needs them applied
before the app will work, along with the row-level security policies — without
RLS the anon key really would be a hole.

**Apply them with the CLI, not by pasting into the SQL editor.** Pasting works
once and then leaves `supabase_migrations.schema_migrations` empty, so the
project has a schema nobody is tracking: the next migration is silently never
applied, and the first symptom is a runtime error like *"Could not find the
function public.create_workspace_profile … in the schema cache"* — the function
exists in the repo and not in the database.

```bash
supabase link --project-ref <ref>
supabase db push
```

If a project has drifted this way, tell the history what is already applied
rather than re-running it:

```bash
supabase migration repair --status applied <version>   # one per applied file
```

**Run the security advisor after any migration that adds a function.** Supabase
grants `EXECUTE` on every new function in `public` to `anon` and `authenticated`
through default privileges, and `REVOKE ... FROM public` does *not* remove those
role grants. That is how `apply_subscription` — the function that moves a
workspace onto a paid plan — ended up callable from any signed-in browser at
`/rest/v1/rpc/apply_subscription`. Migrations `20260809104855` and
`20260809105218` close it; the pattern to copy is
`revoke all on function ... from anon, authenticated, public`, plus
`set search_path = ''` on anything `security definer`.

**If you move to a different Supabase project**, update the three variables in
§3, re-run the migrations, and redo §4.2 through §4.4b on the new project. None
of it carries over.

---

## 5. GitHub, releases and the installer

**`apps/desktop/package.json` → `version` is what names the release**, not the
git tag. electron-builder publishes to `v{version}`. Tagging `v0.1.5` while
package.json still says `0.1.4` uploads into the *old* release, succeeds, and
changes nothing — a green tick for a no-op. Keep them in step:

```
# 1. bump "version" in apps/desktop/package.json to 0.1.5
git add -A && git commit -m "release: desktop 0.1.5" && git push origin main
# 2. then tag
git tag v0.1.5 && git push origin v0.1.5
```

Verify at `https://github.com/<owner>/<repo>/releases` that the new tag is
marked **Latest** and carries `Vyora-Setup.exe` dated today. A green workflow
alone is not proof.

**Shortcuts.** `electron-builder.yml` states `createDesktopShortcut: always`,
`createStartMenuShortcut: true` and `menuCategory: Vyora`, rather than relying
on the one-click defaults. A shop that cannot find the app after installing it
has, as far as they are concerned, not installed it.

**The installer is not code-signed.** Windows and Chrome treat an unsigned
`.exe` from a publisher with no reputation as suspect: the download parks itself
as `Unconfirmed NNNNNN.crdownload` until the user clicks *Keep*, and running it
raises SmartScreen's "Windows protected your PC". Nothing is wrong with the
build — this is the absence of a certificate. The fix is an **OV or EV
code-signing certificate** (EV gets clean SmartScreen treatment immediately; OV
has to earn reputation first), added as `win.certificateFile` /
`certificateSubjectName`, or via Azure Trusted Signing, with the credentials in
GitHub Actions secrets. Until then, expect to lose customers at the download
step, and say so on the download page.

`releaseType: release` in `electron-builder.yml` publishes immediately.
Without it electron-builder leaves a draft, and drafts are invisible to
`/releases/latest/download/` — which returns 404 to every visitor while looking
fine to you as the repo owner.

The installer is `oneClick`, so a new version installs over the old one. No
uninstall needed. Cached web content lives in `%APPDATA%\Vyora` and survives
both install and uninstall (`deleteAppDataOnUninstall: false`) — that is where
the offline database and session live, so do not clear it casually.

---

## 6. Billing (when Razorpay goes live)

Absent keys means the mock provider, which exercises the full money path
including a signed webhook. To go live, set in Cloudflare:

```
RAZORPAY_KEY_ID           secret
RAZORPAY_KEY_SECRET       secret
RAZORPAY_WEBHOOK_SECRET   secret
NEXT_PUBLIC_RAZORPAY_KEY_ID   build variable (publishable)
```

Then point the Razorpay dashboard's webhook at
`https://<your-domain>/api/billing/webhook`. Nothing above
`apps/web/src/lib/billing/provider.ts` changes.

---

## 7. Order of operations for a domain move

The sequence matters — each step depends on the one before it.

1. Cloudflare: add the custom domain to the Worker (or change `name` in
   `wrangler.jsonc` and redeploy)
2. Confirm the new origin serves the app
3. Supabase: update Site URL and add the redirect URL
4. `layout.tsx`: add or update `metadataBase`
5. `main.js`: update `PROD_URL`
6. `downloads.ts`: update only if the GitHub repo also moved
7. Commit, push, wait for the web deploy
8. Bump `apps/desktop/package.json`, tag, and publish a new installer
9. Sign in on the new domain end to end, then install the new `.exe` and
   confirm it opens the dashboard rather than the marketing page

Steps 1–3 without 5 leaves every existing desktop install pointing at the old
origin. If you are retiring the old domain, keep it redirecting until enough
users have upgraded — the app has no auto-update.

---

## 8. Verification

After any of the above:

- `https://<domain>/` — marketing page renders
- `https://<domain>/login` — sign-in form, not a 500 (a 500 means a missing
  `NEXT_PUBLIC_*` build variable)
- Request a code — the email arrives with six digits, not a link
- Enter it — you land on the dashboard
- Install the `.exe` — it opens on the dashboard or sign-in, never the
  marketing page with its "Download for Windows" button
- Bill something offline, reload — the invoice is still there (this is the
  COOP/COEP check from §1)

---

## 9. Environment variable reference

Every variable the app reads, in one table. `apps/web/src/env.ts` validates
these with zod at startup and fails loudly rather than letting a missing value
surface as a confusing runtime error later.

All of them are **optional** in the schema — the app degrades rather than
refusing to boot. Absent Supabase keys means sign-in is unavailable; absent
Gemini key means the AI screens say so; absent Razorpay keys means the mock
billing provider runs.

| Variable | Scope | Local (`.env.local`) | Cloudflare | Purpose |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client | Yes | Build variable | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | Yes | Build variable | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Yes | Secret | Server routes; bypasses RLS |
| `GEMINI_API_KEY` | Server | Optional | Secret | `/api/ai`, `/api/ocr`, `/api/voice-bill`, `/api/promo` |
| `GEMINI_MODEL` | Server | Optional | Variable | Model override for every route |
| `GEMINI_MODEL_TEXT` | Server | Optional | Variable | `/api/ai`, `/api/promo` — safe to run cheap |
| `GEMINI_MODEL_VISION` | Server | Optional | Variable | `/api/ocr`, `/api/voice-bill` — keep capable |
| `RAZORPAY_KEY_ID` | Server | Optional | Secret | Live billing |
| `RAZORPAY_KEY_SECRET` | Server | Optional | Secret | Live billing |
| `RAZORPAY_WEBHOOK_SECRET` | Server | Optional | Secret | Verifies webhook signatures; deliberately separate from the API secret so a leaked webhook secret grants no API access |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Client | Optional | Build variable | Identifies the merchant to the checkout widget; authorises nothing |
| `VYORA_APP_URL` | Desktop | Optional | n/a | Overrides `PROD_URL` in the Electron shell at runtime |

### Local development

```
cp .env.example .env.local
```

Then fill in the three Supabase values. `.env*` is gitignored — real values
never get committed. `.env.example` is the template and is committed, so keep
it in step when you add a variable: it is the only discoverable list of what a
new machine needs.

Client variables are read through the `clientEnv` object in `env.ts`, never
`process.env` directly, because Next only substitutes literal
`process.env.NEXT_PUBLIC_*` expressions at build time — a dynamic lookup comes
back undefined in the browser.

### Secrets discipline

The service-role and Razorpay secrets are the only truly dangerous values.
Type them straight from their source dashboard into Cloudflare's secret field.
Do not route them through a file, a chat window, a screenshot, or a commit. If
one is ever exposed, rotate it at the source — changing it in Cloudflare alone
leaves the exposed key valid.

---

## 10. Sync — what it does, and what it does not

Sync is not configured anywhere: there are no settings, no toggles and no
"sync now" menu item. It is driven entirely by `apps/web/src/lib/sync/runner.ts`
and starts when the sync pill mounts in the app header. Knowing its shape saves
a lot of misdiagnosis.

**How it runs.** Push first, then pull, on four triggers: coming back online,
the tab regaining focus, a 30-second heartbeat, and on demand — the pill when it
shows pending or failed, and immediately after a bill is saved. A pass is
wrapped in a 60-second watchdog and its cleanup sits in a `finally`, so a hung
request degrades to "try again in 30 seconds" rather than wedging the runner.

**What the pill means.** *Synced*, *Syncing…*, *N pending*, *N failed · retry*,
*Offline · N to sync*. It is a button whenever there is something to do, and its
tooltip carries the last pass's error. A row that fails `MAX_ATTEMPTS` times is
given up on and counted as failed until someone taps retry — it is not retried
on every heartbeat.

**Scoped to the signed-in workspace.** The push reads the `org_id` claim out of
the access token and only sends rows matching it. One browser profile keeps one
local database, so a device that has been signed into a previous workspace still
holds that workspace's rows; those are not ours to push, RLS would refuse them,
and without the scope the pill sits on "1 pending" for ever.

**Pull.** Each table keeps a cursor in the local `sync_state` table under
`pull:<table>`, so the first pass fetches the workspace and later passes fetch
only what changed. Tables come down parents-first because the local database
runs with `PRAGMA foreign_keys = ON`. `invoice_items` and `purchase_items` have
no timestamp column on the server, so they ride down with their parent. A
locally dirty row is never overwritten — every upsert ends
`ON CONFLICT(id) DO UPDATE ... WHERE <table>.dirty = 0`.

**Limits, all deliberate and all worth knowing:**

- **Deletes do not propagate**, in either direction. The server tables have no
  tombstone column, and the push filters on `deleted_at IS NULL`. Delete a bill
  on one device and every other device keeps it. Fixing this means a migration
  adding `deleted_at` to the synced tables.
- **Ten of nineteen tables sync.** Quotations, delivery challans, returns
  documents and the whole Cash & Bank module do not — and `sale_documents`,
  `purchase_documents`, `accounts` and `account_entries` have no Supabase table
  at all, so they could not sync even if they were mapped.
- **Invoice extras do not travel.** Notes, terms, document discount, additional
  charges and round-off are stored locally in `custom_fields` but are not in the
  push mapper, so the cloud copy of a bill has `custom_fields: {}`.
- **Product categories are dropped on pull** (`category_id` set to null),
  because `categories` is not in the synced set and the local foreign key would
  reject the page.
- **`ROADMAP.md` overstates this.** It lists cloud sync as shipped "with an
  IndexedDB outbox and conflict engine". `packages/sync/` does contain both,
  tested — and the runner does not use them. It keeps its own retry map in
  memory, which resets on reload.

---

## 11. Building and deploying

```powershell
pnpm turbo run check-types lint build --force
```

`--force` matters. Turborepo caches aggressively, and a run that reports a
**full cache hit** after you have edited source files has not compiled your
changes — it replayed old logs, and deploying afterwards ships the previous
bundle. If a hit still appears, clear the caches:

```powershell
Remove-Item -Recurse -Force .turbo, apps\web\.next -ErrorAction SilentlyContinue
```

Cloudflare builds on push, so `git push` is the deploy. The desktop app is an
Electron window onto the hosted site, which means **a web deploy updates the
installed app too** — reinstalling is only needed when the shell itself changes
(shortcuts, icons, the start URL).
