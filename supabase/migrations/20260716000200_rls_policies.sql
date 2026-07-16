-- Tenant isolation. Every tenant table carries org_id and is gated by RLS, so
-- isolation is enforced by the database rather than by application code that
-- might forget a where clause.
--
-- The specs write the predicate two ways:
--   Database Schema       -> using (org_id = auth.org_id())
--   Security Architecture -> using (org_id = auth.jwt()->>'org_id')
-- The second is literally wrong in Postgres: org_id is uuid and ->> yields
-- text, so it fails with "operator does not exist: uuid = text". auth.org_id()
-- below is the first form, doing the cast in one audited place.
--
-- IMPORTANT: permissive policies are OR'd together. A broad `for all` policy on
-- a table therefore *defeats* any narrower policy added beside it. Tables that
-- need role gating (org_members, devices, audit_logs) are deliberately kept out
-- of the generic loop below and given per-command policies instead.

-- ---------------------------------------------------------------------------
-- Claim helpers
-- ---------------------------------------------------------------------------

-- STABLE (not VOLATILE) so the planner hoists it out of the row loop and can
-- still use the org_id indexes. Without this, RLS costs a function call per row.
create or replace function auth.org_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'org_id',
      ''
    ),
    ''
  )::uuid;
$$;

create or replace function auth.user_role()
returns vyora_role
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'role',
      ''
    ),
    ''
  )::vyora_role;
$$;

create or replace function auth.device_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'device_id',
      ''
    ),
    ''
  )::uuid;
$$;

comment on function auth.org_id() is
  'The tenant key from the access token. Null when the claim is absent, which
   makes every tenant policy fail closed rather than matching a null org_id.';

-- ---------------------------------------------------------------------------
-- Tenant-scoped data tables
-- ---------------------------------------------------------------------------

-- One policy shape for every ordinary tenant table. Written as a loop so a new
-- table cannot be added with a subtly different predicate.
--
-- `using` alone would let a member read only their own tenant but *write* a row
-- stamped with someone else's org_id. `with check` closes that.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'products', 'inventory', 'stock_movements',
    'customers', 'suppliers',
    'invoices', 'invoice_items', 'payments',
    'purchases', 'purchase_items', 'expenses',
    'notifications', 'ai_history', 'marketing_campaigns'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    -- Applies to table owners too. Without this, anything connecting as the
    -- owning role silently bypasses every policy.
    execute format('alter table %I force row level security', t);

    execute format(
      'create policy tenant_isolation on %I
         for all
         to authenticated
         using (org_id = auth.org_id())
         with check (org_id = auth.org_id())',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- org_members — readable by the tenant, writable only by the owner
-- ---------------------------------------------------------------------------

alter table org_members enable row level security;
alter table org_members force row level security;

-- Colleagues must be visible (an invoice's created_by should render a name),
-- so select is tenant-wide.
create policy members_read on org_members
  for select
  to authenticated
  using (org_id = auth.org_id());

-- "Manage users & devices" is owner-only in the Authentication RBAC matrix.
-- Split per command; a `for all` policy here would re-open select to everyone
-- via OR and, worse, hand writes to every role.
create policy members_insert on org_members
  for insert
  to authenticated
  with check (org_id = auth.org_id() and auth.user_role() = 'owner');

create policy members_update on org_members
  for update
  to authenticated
  using (org_id = auth.org_id() and auth.user_role() = 'owner')
  with check (org_id = auth.org_id() and auth.user_role() = 'owner');

create policy members_delete on org_members
  for delete
  to authenticated
  using (org_id = auth.org_id() and auth.user_role() = 'owner');

-- ---------------------------------------------------------------------------
-- devices — you see your own; the owner sees and revokes all
-- ---------------------------------------------------------------------------

alter table devices enable row level security;
alter table devices force row level security;

create policy devices_read on devices
  for select
  to authenticated
  using (
    org_id = auth.org_id()
    and (user_id = (select auth.uid()) or auth.user_role() = 'owner')
  );

-- Registering the device you are currently signing in on.
create policy devices_insert on devices
  for insert
  to authenticated
  with check (org_id = auth.org_id() and user_id = (select auth.uid()));

-- Revocation. A member may revoke their own device; the owner may revoke any.
create policy devices_update on devices
  for update
  to authenticated
  using (
    org_id = auth.org_id()
    and (user_id = (select auth.uid()) or auth.user_role() = 'owner')
  )
  with check (
    org_id = auth.org_id()
    and (user_id = (select auth.uid()) or auth.user_role() = 'owner')
  );

-- No delete policy: revoking sets status, it does not erase history.

-- ---------------------------------------------------------------------------
-- audit_logs — append-only
-- ---------------------------------------------------------------------------

alter table audit_logs enable row level security;
alter table audit_logs force row level security;

create policy audit_read on audit_logs
  for select
  to authenticated
  using (org_id = auth.org_id() and auth.user_role() in ('owner', 'accountant'));

create policy audit_insert on audit_logs
  for insert
  to authenticated
  with check (org_id = auth.org_id());

-- Deliberately no update or delete policy. RLS denies by default, so the log is
-- append-only for every client. A tamper-evident log you can edit is not a log.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table organizations force row level security;

-- Reads the JWT claim rather than joining org_members: a join would recurse
-- into org_members' own policy on every row.
create policy own_organization on organizations
  for select
  to authenticated
  using (id = auth.org_id());

create policy owner_updates_organization on organizations
  for update
  to authenticated
  using (id = auth.org_id() and auth.user_role() = 'owner')
  with check (id = auth.org_id() and auth.user_role() = 'owner');

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table users force row level security;

-- Wrapped in a scalar subquery so auth.uid() is evaluated once per statement
-- rather than once per row.
create policy own_profile on users
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy update_own_profile on users
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Members of the same org can see each other.
create policy org_colleagues on users
  for select
  to authenticated
  using (
    exists (
      select 1
      from org_members m
      where m.user_id = users.id
        and m.org_id = auth.org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- business_types
-- ---------------------------------------------------------------------------

alter table business_types enable row level security;

-- System verticals are product metadata (pharmacy, restaurant, …), not tenant
-- data, so every authenticated user may read them. Custom per-tenant types
-- arrive with the metadata engine in Phase 5.
create policy read_system_business_types on business_types
  for select
  to authenticated
  using (is_system = true);
