-- Auth wiring: mirror new sign-ups into public.users, and stamp the tenant
-- claims onto every access token so RLS has something to read.
--
-- The claim set is fixed by design/Vyora Authentication.dc.html:
--   { "sub", "org_id", "role", "device_id", "exp" }

-- ---------------------------------------------------------------------------
-- Profile mirror
-- ---------------------------------------------------------------------------

-- Supabase Auth owns identity; public.users holds Vyora's profile fields and is
-- what the rest of the schema foreign-keys to. Without this trigger, the first
-- insert referencing users(id) after an OTP sign-up fails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path: this runs as definer, so an attacker-controlled
-- search_path could otherwise resolve `users` to a table of their choosing.
set search_path = ''
as $$
begin
  insert into public.users (id, phone, email, name)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Custom access token hook
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
  -- onboarding) gets a token with null tenant claims. auth.org_id() then
  -- returns null and every tenant policy fails closed — which is the correct
  -- outcome, not an error.
  --
  -- NOTE: a single org_id per token means one active membership per user. If
  -- multi-org membership is ever a real requirement, this needs an explicit
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
    claims := jsonb_set(claims, '{role}', to_jsonb(member_role::text));
  else
    claims := jsonb_set(claims, '{org_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{role}', 'null'::jsonb);
  end if;

  -- The client registers a device and records its id in app_metadata; the token
  -- carries it so a revoked device can be rejected and so audit rows can name
  -- the machine an action came from.
  device := nullif(
    coalesce(event -> 'claims' -> 'app_metadata' ->> 'device_id', ''),
    ''
  )::uuid;

  if device is not null then
    -- Only honour a device that is still active and belongs to this user.
    -- Otherwise a revoked device could keep asserting its own id.
    if exists (
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
  else
    claims := jsonb_set(claims, '{device_id}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The hook is executed by the auth server, which is a different role than the
-- request's user. It needs to reach these tables; nobody else needs the hook.
grant usage on schema public to supabase_auth_admin;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook
  from authenticated, anon, public;

grant select on table public.org_members to supabase_auth_admin;
grant select on table public.devices to supabase_auth_admin;

-- Both tables force RLS, so grants alone are not enough — supabase_auth_admin
-- needs a policy of its own or the hook silently sees zero rows and every token
-- comes out with a null org_id.
create policy auth_admin_reads_members on public.org_members
  for select
  to supabase_auth_admin
  using (true);

create policy auth_admin_reads_devices on public.devices
  for select
  to supabase_auth_admin
  using (true);
