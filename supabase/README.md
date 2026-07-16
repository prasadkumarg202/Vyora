# supabase/

Migrations, RLS policies, auth config, and edge functions.

```
migrations/   applied in filename order
templates/    email templates (see the SMTP caveat below)
config.toml   auth/API config — `supabase config push` applies it to the linked project
```

## Cloud settings `config.toml` cannot apply

`config.toml` governs a *local* stack. A cloud project only picks it up via
`supabase config push`, and some of it is refused outright. Every one of these
cost real debugging time, so check them on any new project:

| Setting | Where | Why it matters |
| --- | --- | --- |
| **Custom access token hook** | Authentication → Hooks → Customize Access Token → `public.custom_access_token_hook` | Without it, tokens carry no `org_id`. `public.org_id()` returns null, every RLS policy fails closed, and the app renders **empty with no error** — the worst possible failure mode to diagnose. |
| **Access token expiry = 900** | Authentication → Sessions | The spec mandates 15 min. Cloud default is 3600. |
| **Email templates** | Authentication → Emails | **Blocked on the free tier with the default email provider.** See below. |

## The email OTP blocker

The login flow needs a **code** (`{{ .Token }}`). Supabase's stock templates send
a **magic link** (`{{ .ConfirmationURL }}`), and on the free tier with the
built-in email provider, template modification is rejected:

> Email template modification is not available for free tier projects using the
> default email provider. Please upgrade your plan or configure a custom SMTP
> provider.

So an unconfigured project mails "Confirm your email address" and the login form
waits for a code that was never sent. **Configure a custom SMTP provider** (a
free Resend/Brevo tier is enough), then uncomment the
`[auth.email.template.*]` blocks in `config.toml` and `supabase config push`.
`templates/otp.html` is written and ready.

The built-in sender is unsuitable for production anyway: it is rate-limited to
roughly **2 emails per hour per project** (not per address — a test suite that
sends real mail will rate-limit itself into failure) and delivers from a shared
domain.

## Rules that hold everywhere in here

- **Tenant isolation** — every tenant table carries `org_id` with
  `using (org_id = public.org_id())` *and* a matching `with check`. Without the
  latter a member could read only their own tenant but write rows stamped with
  another `org_id`.
- **Force RLS** — `alter table ... force row level security` on every tenant
  table. Without it, anything connecting as the table owner bypasses all policies.
- **Permissive policies are OR'd.** A broad `for all` policy beside a narrow one
  *defeats* it. `org_members`, `devices` and `audit_logs` are deliberately kept
  out of the generic policy loop for exactly this reason.
- **Encryption boundary** — the server only ever sees ciphertext plus routing
  metadata (`id`, `org_id`, `updated_at`, `version`), never plaintext bodies or
  keys.

## Deviations from the design specs

| Spec says | Reality | Why |
| --- | --- | --- |
| `auth.org_id()` | `public.org_id()` | Supabase revokes CREATE on the `auth` schema. Calling `auth.uid()` still works. |
| JWT claim `role` | claim `org_role` | `role` is reserved: PostgREST reads it to decide which Postgres role to `SET ROLE` to. Emitting `owner` there breaks every authenticated request. |
| Trigger on `auth.users` for profiles | app-side + `create_workspace()` | Same auth-schema lockdown. A trigger is unskippable; app code is not — hence one choke point and a test. |
| "6-digit code" | 6 (SMS) / 8 (email) | Length is a per-project setting and differs per channel. Nothing should hardcode it. |
| 20 tables | 21 | `devices` added: the auth spec needs revocable device-bound sessions and the schema doc omits it. |
| Roles: owner/manager/cashier + ? | union of 6 | Authentication says *accountant*, Security says *viewer*, IA says *inventory + viewer*. Unresolved — adding a role later is one statement, removing one is a rewrite. |
