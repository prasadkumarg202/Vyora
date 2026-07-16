-- Bootstrapping the first workspace.
--
-- A newly signed-in user has no membership, so no org_id claim, so RLS denies
-- everything — including creating the very org that would give them a claim:
--   * organizations has no insert policy at all
--   * org_members insert requires org_role = 'owner', which requires the
--     membership that does not exist yet
--
-- That deadlock is by design; the way out is one narrow, audited function that
-- runs with definer rights and does exactly one thing.
--
-- Deliberately NOT an insert policy on organizations. A policy would let a
-- client create orgs freely and stamp them however it liked. This function
-- makes the org and its owner membership atomically, or neither.

create or replace function public.create_workspace(
  workspace_name text,
  business_type_key text default null
)
returns uuid
language plpgsql
security definer
-- Definer rights + attacker-controlled search_path is how definer functions get
-- hijacked. Pin it; every reference below is schema-qualified.
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_org uuid;
  bt uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The whole point of definer rights here is bounded: one workspace per user.
  -- Without this check, an authenticated caller could mint orgs in a loop.
  if exists (
    select 1 from public.org_members m
    where m.user_id = caller and m.status = 'active'
  ) then
    raise exception 'user already belongs to a workspace'
      using errcode = '23505';
  end if;

  if coalesce(trim(workspace_name), '') = '' then
    raise exception 'workspace name is required' using errcode = '22023';
  end if;

  -- The profile row would normally come from a trigger on auth.users, which
  -- Supabase forbids. Guarantee it here so the FK below cannot fail.
  insert into public.users (id, email, phone)
  select caller, u.email, u.phone
  from auth.users u
  where u.id = caller
  on conflict (id) do nothing;

  if business_type_key is not null then
    select id into bt
    from public.business_types
    where key = business_type_key and is_system = true;
  end if;

  insert into public.organizations (name, business_type_id)
  values (trim(workspace_name), bt)
  returning id into new_org;

  -- The creator is always the owner. Not a parameter: a caller must not get to
  -- choose the role it bootstraps itself with.
  insert into public.org_members (org_id, user_id, role, status)
  values (new_org, caller, 'owner', 'active');

  return new_org;
end;
$$;

comment on function public.create_workspace(text, text) is
  'Bootstraps an org plus its owner membership for the calling user, escaping
   the RLS deadlock that a user with no membership cannot create one. Capped at
   one active workspace per user. The caller''s JWT must be refreshed afterwards
   to pick up the new org_id / org_role claims.';

-- authenticated only: anon has no auth.uid() and would fail anyway, but do not
-- rely on that as the gate.
revoke execute on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed the system business types
-- ---------------------------------------------------------------------------

-- The 18 verticals from design/Vyora Dynamic Business Engine.dc.html. Their
-- `config` (fields, validations, GST rules, invoice templates, reports) is what
-- the metadata engine reads in Phase 5; the rows exist now so onboarding has
-- something to select and so create_workspace can resolve a key.
insert into public.business_types (key, label, is_system, config)
values
  ('pharmacy',    'Pharmacy',              true, '{}'::jsonb),
  ('restaurant',  'Restaurant',            true, '{}'::jsonb),
  ('jewellery',   'Jewellery',             true, '{}'::jsonb),
  ('grocery',     'Grocery / Kirana',      true, '{}'::jsonb),
  ('electronics', 'Electronics',           true, '{}'::jsonb),
  ('apparel',     'Apparel',               true, '{}'::jsonb),
  ('hardware',    'Hardware',              true, '{}'::jsonb),
  ('automobile',  'Automobile',            true, '{}'::jsonb),
  ('stationery',  'Stationery',            true, '{}'::jsonb),
  ('furniture',   'Furniture',             true, '{}'::jsonb),
  ('footwear',    'Footwear',              true, '{}'::jsonb),
  ('bakery',      'Bakery',                true, '{}'::jsonb),
  ('salon',       'Salon & Spa',           true, '{}'::jsonb),
  ('clinic',      'Clinic',                true, '{}'::jsonb),
  ('services',    'Professional Services', true, '{}'::jsonb),
  ('wholesale',   'Wholesale / Distribution', true, '{}'::jsonb),
  ('agriculture', 'Agriculture',           true, '{}'::jsonb),
  ('general',     'General Retail',        true, '{}'::jsonb)
on conflict (key) do nothing;
