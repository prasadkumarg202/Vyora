-- Fix: upserting a device by session_id failed with
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- 20260716000500 created a *partial* unique index:
--   create unique index ... on devices (session_id) where session_id is not null
--
-- ON CONFLICT (session_id) cannot infer a partial index unless the statement
-- repeats the same WHERE predicate, which PostgREST has no way to express.
--
-- The predicate was unnecessary anyway: in Postgres NULLs are distinct under a
-- unique index by default, so a plain unique constraint already allows any
-- number of device rows with no session yet, while still permitting exactly one
-- row per real session. Same guarantee, and inferable.

drop index if exists devices_session_id_key;

alter table devices
  add constraint devices_session_id_key unique (session_id);

comment on constraint devices_session_id_key on devices is
  'One device row per auth session. A plain (non-partial) unique constraint so
   ON CONFLICT (session_id) can infer it; NULLs stay distinct, so rows without a
   session are unconstrained.';
