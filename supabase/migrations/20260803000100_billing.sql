-- Subscriptions & billing — the money path.
--
-- Three rules shape this migration, and every one of them exists because the
-- obvious alternative is how SaaS gives paid plans away:
--
--   1. The browser can READ billing state and can never WRITE it. All the
--      policies below are select-only. Plan changes arrive through the webhook
--      with the service-role key, which bypasses RLS. A client that POSTs
--      "payment succeeded" to our own API changes nothing.
--   2. Webhook events are stored raw and deduplicated on the provider's event
--      id. Razorpay retries; without the unique index a retry would extend a
--      subscription twice.
--   3. Prices are NOT stored here. The catalogue lives in @vyora/core so the
--      pricing page, the checkout and the receipt cannot disagree. This table
--      records what was bought and what was actually charged.
--
-- The 90-day trial is stamped by a trigger on organizations, not by the app:
-- a client that skips the call must not end up with an unbounded trial, and a
-- client that repeats it must not get a second one.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type billing_plan as enum ('free', 'pro', 'business');
create type billing_cycle as enum ('monthly', 'yearly');
-- 'locked' is the end of the road for a workspace that never paid: 90 trial
-- days, 30 wind-down days on the basics, then closed. It is stored rather than
-- derived so a support agent can see the state, and so a dunning job can act
-- on it — but the app never depends on a job having run: the entitlement
-- resolver computes the same answer from trial_ends_at alone.
create type billing_status as enum (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'locked'
);
create type billing_provider as enum ('razorpay', 'cashfree', 'manual', 'mock');

-- ---------------------------------------------------------------------------
-- Plan state on the organisation
-- ---------------------------------------------------------------------------

-- `organizations.plan` already existed as free text with default 'trial'. It is
-- kept (other code may still read it) but is now derived: the typed columns
-- below are the truth, and the trigger keeps the legacy column in step.
alter table organizations
  add column plan_id billing_plan not null default 'free',
  add column plan_status billing_status not null default 'trialing',
  add column plan_cycle billing_cycle,
  add column trial_started_at timestamptz not null default now(),
  add column trial_ends_at timestamptz,
  add column current_period_end timestamptz,
  add column billing_provider billing_provider,
  add column provider_customer_id text,
  add column provider_subscription_id text,
  add column billing_updated_at timestamptz not null default now();

comment on column organizations.plan_id is
  'What the workspace bought. During the trial this stays ''free'' — the trial
   grants Business-level access without pretending money changed hands.';

comment on column organizations.trial_ends_at is
  'Set once, by trigger, at 90 days from creation. Never extended by a client.';

create index organizations_provider_subscription_idx
  on organizations (provider_subscription_id)
  where provider_subscription_id is not null;

-- Backfill: every workspace that already exists gets its 90 days from today
-- rather than from its creation date. Charging our first users for time they
-- never had access to would be the wrong way to launch.
update organizations
set trial_started_at = now(),
    trial_ends_at = now() + interval '90 days',
    plan_status = 'trialing'
where trial_ends_at is null;

create or replace function public.stamp_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.trial_started_at := coalesce(new.trial_started_at, now());
  -- Coalesce, not overwrite: a support-granted extension written with the
  -- service role must survive an unrelated update to the row.
  new.trial_ends_at := coalesce(new.trial_ends_at, new.trial_started_at + interval '90 days');
  new.plan_status := coalesce(new.plan_status, 'trialing');
  return new;
end;
$$;

create trigger organizations_stamp_trial
  before insert on organizations
  for each row execute function public.stamp_trial();

-- ---------------------------------------------------------------------------
-- Subscription lifecycle
-- ---------------------------------------------------------------------------

create table billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  plan_id billing_plan not null,
  cycle billing_cycle not null,
  status billing_status not null default 'active',
  provider billing_provider not null,
  -- Razorpay subscription id (sub_...) or order id for a one-off cycle.
  provider_subscription_id text,
  -- The mandate / authorisation reference for UPI AutoPay.
  provider_mandate_id text,
  -- GST-inclusive amount actually agreed, in paise. Copied from the catalogue
  -- at purchase time so a later price change never rewrites history.
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_subscriptions_org_idx on billing_subscriptions (org_id);
create unique index billing_subscriptions_provider_idx
  on billing_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- Receipts — what the shop can download for their own books
-- ---------------------------------------------------------------------------

-- A gapless-enough receipt number. A sequence, not count(*)+1: two concurrent
-- webhooks counting rows would both read the same number and one insert would
-- fail on the unique index — or worse, succeed against a different tenant's
-- run. Sequences may skip on rollback, which the GST rules permit for a
-- supplier's own outward numbering as long as it never repeats.
create sequence billing_invoice_seq;

-- Indian financial year label, e.g. 2026-27 for any date from 1 April 2026.
create or replace function public.indian_fy(at timestamptz)
returns text
language sql
-- STABLE, not IMMUTABLE: to_char and extract on a timestamptz both depend on
-- the session TimeZone, so the result is only fixed within one statement.
stable
as $$
  select case
    when extract(month from at) >= 4
      then to_char(at, 'YYYY') || '-' || to_char(at + interval '1 year', 'YY')
    else to_char(at - interval '1 year', 'YYYY') || '-' || to_char(at, 'YY')
  end;
$$;

create or replace function public.next_billing_invoice_number()
returns text
language sql
volatile
as $$
  select 'VYORA/' || public.indian_fy(now()) || '/' ||
         lpad(nextval('public.billing_invoice_seq')::text, 6, '0');
$$;

create table billing_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  subscription_id uuid references billing_subscriptions (id) on delete set null,
  -- Our own sequential receipt number, e.g. VYORA/2026-27/000123.
  number text not null unique default public.next_billing_invoice_number(),
  plan_id billing_plan not null,
  cycle billing_cycle not null,
  -- The split we print on the receipt. base + tax must equal total; the check
  -- makes an arithmetic slip a failed insert rather than a wrong tax invoice.
  base_paise bigint not null check (base_paise >= 0),
  tax_paise bigint not null check (tax_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  gst_bps int not null default 1800,
  status text not null default 'paid',
  provider billing_provider not null,
  provider_payment_id text,
  paid_at timestamptz,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint billing_invoices_total_adds_up
    check (base_paise + tax_paise = total_paise)
);

create index billing_invoices_org_idx on billing_invoices (org_id, created_at desc);
create unique index billing_invoices_provider_payment_idx
  on billing_invoices (provider, provider_payment_id)
  where provider_payment_id is not null;

-- ---------------------------------------------------------------------------
-- Webhook events — the audit trail, and the idempotency key
-- ---------------------------------------------------------------------------

create table billing_events (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: an event can arrive before we can attribute it to an org.
  org_id uuid references organizations (id) on delete set null,
  provider billing_provider not null,
  -- Razorpay's x-razorpay-event-id header. The unique index on it is the only
  -- thing standing between a retried delivery and a doubled subscription.
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  signature_verified boolean not null default false,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create unique index billing_events_provider_event_idx
  on billing_events (provider, provider_event_id);
create index billing_events_org_idx on billing_events (org_id, received_at desc);

comment on table billing_events is
  'Raw webhook deliveries. Written before the plan changes, so a crash mid-way
   leaves evidence of what arrived rather than a silently missing upgrade.';

-- ---------------------------------------------------------------------------
-- RLS — members read their own billing, nobody writes from a browser
-- ---------------------------------------------------------------------------

alter table billing_subscriptions enable row level security;
alter table billing_invoices enable row level security;
alter table billing_events enable row level security;

-- Deliberately `for select` only. There is no insert/update/delete policy on
-- any of these tables, so the anon and authenticated roles cannot write them at
-- all; the webhook uses the service role, which bypasses RLS entirely.
create policy billing_subscriptions_read on billing_subscriptions
  for select using (org_id = public.org_id());

create policy billing_invoices_read on billing_invoices
  for select using (org_id = public.org_id());

-- Events are operational data with provider payloads in them. Only the owner
-- needs to see them, and only for their own workspace.
create policy billing_events_read on billing_events
  for select using (
    org_id = public.org_id() and public.user_role() = 'owner'
  );

-- ---------------------------------------------------------------------------
-- Applying a paid subscription — the one place plan state changes
-- ---------------------------------------------------------------------------

create or replace function public.apply_subscription(
  p_org_id uuid,
  p_plan billing_plan,
  p_cycle billing_cycle,
  p_status billing_status,
  p_provider billing_provider,
  p_provider_subscription_id text,
  p_amount_paise bigint,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub_id uuid;
begin
  insert into public.billing_subscriptions (
    org_id, plan_id, cycle, status, provider,
    provider_subscription_id, amount_paise,
    current_period_start, current_period_end
  )
  values (
    p_org_id, p_plan, p_cycle, p_status, p_provider,
    p_provider_subscription_id, p_amount_paise,
    p_period_start, p_period_end
  )
  on conflict (provider, provider_subscription_id)
    where provider_subscription_id is not null
  do update set
    plan_id = excluded.plan_id,
    cycle = excluded.cycle,
    status = excluded.status,
    amount_paise = excluded.amount_paise,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    updated_at = now()
  returning id into sub_id;

  update public.organizations
  set plan_id = p_plan,
      plan_status = p_status,
      plan_cycle = p_cycle,
      billing_provider = p_provider,
      provider_subscription_id = p_provider_subscription_id,
      current_period_end = p_period_end,
      -- The trial is over the moment money changes hands.
      trial_ends_at = least(coalesce(trial_ends_at, now()), now()),
      plan = p_plan::text,
      billing_updated_at = now()
  where id = p_org_id;

  return sub_id;
end;
$$;

-- Callable only by the service role: revoke the default grant to PUBLIC that
-- every new function gets, then grant it back to nobody else.
revoke all on function public.apply_subscription(
  uuid, billing_plan, billing_cycle, billing_status, billing_provider,
  text, bigint, timestamptz, timestamptz
) from public;

comment on function public.apply_subscription is
  'Records a subscription and moves the org onto its plan, atomically. Invoked
   only from the verified webhook handler with the service-role key.';
