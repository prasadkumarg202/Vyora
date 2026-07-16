# supabase/

Migrations, RLS policies, and edge functions.

Scaffolded in Phase 2 as part of the repo layout. Contents land later:

| What                                | Phase | Spec                               |
| ----------------------------------- | ----- | ---------------------------------- |
| Auth (OTP, device-bound sessions)   | 3     | `Vyora Authentication.dc.html`     |
| Tables + RLS (`org_id` on every one)| 3     | `Vyora Database Schema.dc.html`    |
| Sync push/pull endpoints            | 6     | `Vyora API Spec.dc.html`           |
| AI provider router (edge functions) | 5     | `Vyora AI Copilot.dc.html`         |

Two rules apply to everything in here:

- **Tenant isolation** — every tenant table carries `org_id` with the policy
  `using (org_id = auth.jwt()->>'org_id')`.
- **Encryption boundary** — the server only ever sees ciphertext plus routing
  metadata (`id`, `org_id`, `updated_at`, `version`). Never plaintext record
  bodies, and never the keys.
