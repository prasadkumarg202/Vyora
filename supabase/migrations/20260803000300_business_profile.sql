-- The business profile collected at onboarding.
--
-- `organizations` held only a name, a business type, a GSTIN and a state — the
-- minimum to reach the app. A shop cannot print a compliant invoice on that:
-- the header needs an address, and a registered dealer's GSTIN and PAN belong
-- on the document.
--
-- GSTIN is deliberately nullable, and so is PAN. Most of the shops this is for
-- are below the registration threshold, and an onboarding that demands a GSTIN
-- turns them away at the door. What follows from *not* having one is handled in
-- the app: an unregistered shop bills without GST rather than printing a tax
-- invoice it has no right to issue.

alter table organizations
  add column phone text,
  add column email text,
  add column pan text,
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column pincode text,
  -- Two digits, from the GST state list. Stored beside `state` because the
  -- place-of-supply rule compares codes, and re-deriving one from a display
  -- name on every invoice is how a renamed state silently changes the tax.
  add column state_code text,
  add column onboarded_at timestamptz;

comment on column organizations.gstin is
  'Null for an unregistered shop, which is the common case below the
   registration threshold — never treat absence as an error.';

comment on column organizations.state_code is
  'Two-digit GST state code. The supplier side of the place-of-supply
   comparison that decides CGST+SGST versus IGST.';

-- ---------------------------------------------------------------------------
-- Bootstrap, with the profile
-- ---------------------------------------------------------------------------

-- Supersedes create_workspace(). Same deadlock and the same narrow way out —
-- a user with no membership has no org_id claim, so RLS denies the very insert
-- that would give them one — but it writes the whole profile in one statement.
--
-- One call rather than "create, refresh the token, then update": between those
-- steps the caller holds a token whose org_id claim is still null, so the
-- update would be denied by the policy it is supposed to satisfy. Atomic here,
-- or a race there.
create or replace function public.create_workspace_profile(
  workspace_name text,
  business_type_key text default null,
  p_phone text default null,
  p_email text default null,
  p_gstin text default null,
  p_pan text default null,
  p_state text default null,
  p_state_code text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_pincode text default null
)
returns uuid
language plpgsql
security definer
-- Definer rights plus an attacker-controlled search_path is how definer
-- functions get hijacked. Pin it; every reference below is schema-qualified.
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
  if exists (
    select 1 from public.org_members m
    where m.user_id = caller and m.status = 'active'
  ) then
    raise exception 'user already belongs to a workspace' using errcode = '23505';
  end if;

  if coalesce(trim(workspace_name), '') = '' then
    raise exception 'workspace name is required' using errcode = '22023';
  end if;

  insert into public.users (id, email, phone)
  select caller, u.email, u.phone
  from auth.users u
  where u.id = caller
  on conflict (id) do nothing;

  if business_type_key is not null then
    select id into bt
    from public.business_types
    where key = business_type_key;
  end if;

  insert into public.organizations (
    name, business_type_id, gstin, state, state_code,
    phone, email, pan, address_line1, address_line2, city, pincode,
    onboarded_at
  )
  values (
    trim(workspace_name), bt,
    nullif(trim(coalesce(p_gstin, '')), ''),
    nullif(trim(coalesce(p_state, '')), ''),
    nullif(trim(coalesce(p_state_code, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(upper(trim(coalesce(p_pan, ''))), ''),
    nullif(trim(coalesce(p_address_line1, '')), ''),
    nullif(trim(coalesce(p_address_line2, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_pincode, '')), ''),
    now()
  )
  returning id into new_org;

  insert into public.org_members (org_id, user_id, role, status)
  values (new_org, caller, 'owner', 'active');

  return new_org;
end;
$$;

comment on function public.create_workspace_profile is
  'Creates the caller''s one workspace and its owner membership atomically,
   with the onboarding profile. The caller must refresh their access token
   afterwards so the auth hook stamps the new org_id claim.';
