-- Bind a device to a session, not to the user.
--
-- The previous hook read device_id from app_metadata. app_metadata is per-user
-- and global, so a second sign-in overwrites the first: the owner's phone and
-- the counter PC would fight over one slot, and revoking one would mislabel the
-- other. The Authentication spec explicitly shows three concurrent trusted
-- devices, so per-user storage cannot express what is being asked for.
--
-- Supabase issues a distinct session_id per sign-in and puts it in the JWT.
-- That is exactly the grain we want: one session == one device == one refresh
-- token. Revoking a device can then kill precisely that session and no other.

alter table devices
  add column session_id uuid;

-- One device row per auth session.
create unique index devices_session_id_key
  on devices (session_id)
  where session_id is not null;

create index devices_status_idx on devices (org_id, status);

comment on column devices.session_id is
  'The Supabase auth session (JWT session_id claim) this device row represents.
   One session == one device == one refresh token, which is what makes
   per-device revocation possible.';

-- ---------------------------------------------------------------------------
-- Hook: resolve the device from the session, not from app_metadata
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
  session uuid;
  device uuid;
begin
  claims := event -> 'claims';

  -- A user with no active membership (invited but not accepted, or mid
  -- onboarding) gets null tenant claims. public.org_id() then returns null and
  -- every tenant policy fails closed — the correct outcome, not an error.
  --
  -- NOTE: one org_id per token means one active membership per user. If
  -- multi-org membership becomes real, this needs an explicit "active org"
  -- choice and token re-issue on switch, not an ordering rule.
  select om.org_id, om.role
    into member_org, member_role
  from public.org_members om
  where om.user_id = (event ->> 'user_id')::uuid
    and om.status = 'active'
  order by om.created_at
  limit 1;

  if member_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(member_org::text));
    -- `org_role`, NOT `role`: PostgREST owns `role` and uses it to SET ROLE.
    claims := jsonb_set(claims, '{org_role}', to_jsonb(member_role::text));
  else
    claims := jsonb_set(claims, '{org_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{org_role}', 'null'::jsonb);
  end if;

  session := nullif(coalesce(claims ->> 'session_id', ''), '')::uuid;

  -- The device is whatever active row claims this session. A revoked device
  -- stops receiving the claim on its very next token refresh (<= 15 min),
  -- and middleware ends the session sooner than that.
  if session is not null then
    select d.id
      into device
    from public.devices d
    where d.session_id = session
      and d.user_id = (event ->> 'user_id')::uuid
      and d.status = 'active';
  end if;

  if device is not null then
    claims := jsonb_set(claims, '{device_id}', to_jsonb(device::text));
  else
    -- Null on the first token of a session: the device row is registered just
    -- after sign-in, so device_id appears from the next refresh onward.
    claims := jsonb_set(claims, '{device_id}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook
  from authenticated, anon, public;
