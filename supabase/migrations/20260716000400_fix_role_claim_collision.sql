-- Fix: the tenant role claim must not be called `role`.
--
-- design/Vyora Authentication.dc.html specifies the claim set as
--   { "sub", "org_id", "role", "device_id", "exp" }
-- but `role` is reserved in Supabase: PostgREST reads it to decide which
-- Postgres role to SET ROLE to (anon / authenticated / service_role). Writing
-- "owner" there makes PostgREST attempt `set role owner`, which fails, breaking
-- every authenticated request.
--
-- Caught by public.user_role() throwing
--   invalid input value for enum vyora_role: "service_role"
-- because it was reading the platform's role claim, not ours.
--
-- The tenant role therefore travels as `org_role`. Same data, same intent, a
-- name the platform has not already taken.

-- ---------------------------------------------------------------------------
-- Read the namespaced claim, and never throw on a bad value
-- ---------------------------------------------------------------------------

-- The previous version cast straight to the enum, so any unexpected string
-- raised 22P02. A claim reader sitting inside every RLS policy must not be able
-- to error — it should just deny. Unknown value -> null -> policies fail closed.
create or replace function public.user_role()
returns vyora_role
language sql
stable
as $$
  select case
    when coalesce(
           current_setting('request.jwt.claims', true)::jsonb ->> 'org_role',
           ''
         ) in ('owner', 'manager', 'cashier', 'accountant', 'inventory', 'viewer')
    then (current_setting('request.jwt.claims', true)::jsonb ->> 'org_role')::vyora_role
    else null
  end;
$$;

comment on function public.user_role() is
  'The caller''s Vyora role from the org_role claim. Null when absent or
   unrecognised, so policies deny rather than error. Deliberately not named
   `role`: that claim belongs to PostgREST.';

-- ---------------------------------------------------------------------------
-- Emit org_role instead of role
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  member_org uuid;
  member_role public.vyora_role;
  device uuid;
begin
  claims := event -> 'claims';

  -- A user with no active membership (invited but not accepted, or mid
  -- onboarding) gets a token with null tenant claims. public.org_id() then
  -- returns null and every tenant policy fails closed — the correct outcome,
  -- not an error.
  --
  -- NOTE: a single org_id per token means one active membership per user. If
  -- multi-org membership becomes a real requirement, this needs an explicit
  -- "active org" choice and token re-issue on switch, not an ordering rule.
  select om.org_id, om.role
    into member_org, member_role
  from public.org_members om
  where om.user_id = (event ->> 'user_id')::uuid
    and om.status = 'active'
  order by om.created_at
  limit 1;

  if member_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(member_org::text));
    -- `org_role`, NOT `role`. Overwriting `role` would break PostgREST's role
    -- switching for every request this token is used on.
    claims := jsonb_set(claims, '{org_role}', to_jsonb(member_role::text));
  else
    claims := jsonb_set(claims, '{org_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{org_role}', 'null'::jsonb);
  end if;

  device := nullif(
    coalesce(event -> 'claims' -> 'app_metadata' ->> 'device_id', ''),
    ''
  )::uuid;

  -- Only honour a device that is still active and belongs to this user;
  -- otherwise a revoked device could keep asserting its own id.
  if device is not null and exists (
    select 1
    from public.devices d
    where d.id = device
      and d.user_id = (event ->> 'user_id')::uuid
      and d.status = 'active'
  ) then
    claims := jsonb_set(claims, '{device_id}', to_jsonb(device::text));
  else
    claims := jsonb_set(claims, '{device_id}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook
  from authenticated, anon, public;
