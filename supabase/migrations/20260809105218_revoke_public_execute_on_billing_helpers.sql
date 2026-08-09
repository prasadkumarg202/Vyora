-- The follow-up to 20260809104855, which named `anon` but left the grant to
-- PUBLIC in place — and PUBLIC covers anon. Revoking a role is not the same as
-- revoking PUBLIC; both have to go.
--
-- `authenticated` keeps create_workspace_profile deliberately: it is the only
-- role that has an auth.uid() for the function to act on, and bootstrapping a
-- workspace is exactly what it is for.

revoke all on function public.create_workspace_profile(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public;

-- next_billing_invoice_number() advances a sequence on every call. Exposed to
-- the browser it is a free receipt-number burner. Gaps are permitted in a
-- supplier's own outward numbering, so this is not a correctness hole — but
-- there is no reason for a client to reach it at all.
revoke all on function public.next_billing_invoice_number()
  from public, anon, authenticated;
revoke all on function public.indian_fy(timestamptz) from public, anon;

-- Hand back the number spent proving the function worked, so the first real
-- receipt is VYORA/2026-27/000001 rather than 000002.
select setval('public.billing_invoice_seq', 1, false);
