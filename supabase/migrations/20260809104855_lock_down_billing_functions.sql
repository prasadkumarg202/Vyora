-- Close the hole that `revoke ... from public` did not close.
--
-- Supabase grants EXECUTE on every new function in `public` to `anon` and
-- `authenticated` through default privileges. Those are role grants, and
-- `revoke all ... from public` in 20260803000100_billing.sql does not touch
-- them — it only drops the PUBLIC grant. The comment in that migration said
-- apply_subscription was "callable only by the service role"; it was in fact
-- reachable from any browser at /rest/v1/rpc/apply_subscription by anyone with
-- a session, which is the entire paywall handed over by a default.
--
-- Caught by the Supabase security advisor (lint 0028/0029) rather than by us,
-- which is the argument for running it after every migration that adds a
-- SECURITY DEFINER function.

revoke all on function public.apply_subscription(
  uuid, billing_plan, billing_cycle, billing_status, billing_provider,
  text, bigint, timestamptz, timestamptz
) from anon, authenticated, public;

-- A BEFORE INSERT trigger function has no business being reachable over REST.
revoke all on function public.stamp_trial() from anon, authenticated, public;

-- Onboarding is a signed-in action. `anon` has no auth.uid(), so the call
-- already raised 28000 — but a function should not be reachable by a role that
-- can never legitimately call it.
revoke all on function public.create_workspace_profile(
  text, text, text, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.create_workspace(text, text) from anon;

-- Definer rights plus a caller-controlled search_path is the classic hijack.
-- Both of these are new in 20260803000100 and both schema-qualify everything
-- they touch, so pinning the path costs nothing.
alter function public.indian_fy(timestamptz) set search_path = '';
alter function public.next_billing_invoice_number() set search_path = '';
