-- Staff, attendance and advances — the cloud half of local migration 8.
--
-- Mirrors packages/db/src/schema.ts MIGRATION_8 column for column, because the
-- sync mappers push and pull by name. A column that exists on one side and not
-- the other does not fail loudly; it silently drops the value.
--
-- One deliberate difference from every tenant table that came before it: these
-- three carry `deleted_at` from birth.
--
-- Be clear about what that does and does not buy today. The column means the
-- PULL can carry a tombstone down, so a staff row deleted elsewhere can
-- disappear here. It does NOT yet make deletes travel upward: the push still
-- selects `WHERE dirty = 1 AND deleted_at IS NULL`, so a locally tombstoned row
-- is invisible to it and stays on this device. Fixing that is the tombstone
-- work already queued in HANDOFF.md, and it is a change to the runner rather
-- than to this file. Having the column here is one fewer table to backfill when
-- that lands.
--
-- Money is bigint paise. Never numeric, never a float: a wage divided across
-- 26 working days and multiplied back must land on the rupee it started on.

-- ---------------------------------------------------------------------------
-- staff — who the shop pays
-- ---------------------------------------------------------------------------

-- Deliberately not org_members. A member is someone who signs into Vyora; a
-- staff member is someone who gets paid. The helper who never touches the till
-- still needs a wage, and inventing a login for them to exist would be absurd.
create table if not exists public.staff (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  phone          text,
  role           text,
  -- The agreed wage for a full month. A day's wage is derived from this and the
  -- month's working days, never stored, so correcting attendance corrects pay.
  salary_paise   bigint not null default 0 check (salary_paise >= 0),
  -- Paid per day rather than per month — common for helpers and casual labour.
  is_daily_wage  boolean not null default false,
  -- Per hour. Null means overtime is unpaid, which is a different statement
  -- from a rate of zero and is stored as one.
  ot_rate_paise  bigint check (ot_rate_paise is null or ot_rate_paise >= 0),
  joined_on      date,
  -- Set when someone leaves. The row stays: last month's payslip and this
  -- year's totals must remain readable after they have gone.
  left_on        date,
  note           text,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on column public.staff.salary_paise is
  'Agreed monthly wage in paise. Integer, never numeric — a wage split across
   working days and summed back must return to the rupee it started on.';

-- ---------------------------------------------------------------------------
-- staff_attendance — who came in
-- ---------------------------------------------------------------------------

create table if not exists public.staff_attendance (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  date         date not null,
  status       text not null default 'present'
                 check (status in ('present', 'absent', 'half_day', 'leave', 'holiday')),
  -- Minutes, so half an hour of overtime is an integer here too.
  ot_minutes   integer not null default 0 check (ot_minutes >= 0),
  note         text,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- One mark per person per day.
--
-- Marking someone present twice is the likeliest mistake at a counter: two
-- people with the app open, or one person unsure whether they already did it.
-- The constraint turns the second mark into an update instead of a duplicate
-- day that quietly doubles a wage.
--
-- Partial, so a tombstoned row does not block re-marking a day deleted by
-- mistake.
create unique index if not exists staff_attendance_person_day_idx
  on public.staff_attendance (staff_id, date)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- staff_advances — money taken against the wage
-- ---------------------------------------------------------------------------

create table if not exists public.staff_advances (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  kind         text not null default 'advance'
                 check (kind in ('advance', 'loan', 'deduction', 'bonus')),
  -- Always positive. Which way it moves the payslip is `kind`'s job — a signed
  -- amount plus a kind gives two ways to say the same thing and eventually they
  -- disagree.
  amount_paise bigint not null check (amount_paise >= 0),
  date         date not null default current_date,
  note         text,
  -- The salary month this settles against, as YYYY-MM. Null means the month it
  -- was taken, which is what a shopkeeper means by an advance.
  settle_month text check (settle_month is null or settle_month ~ '^\d{4}-\d{2}$'),
  created_by   uuid references public.users(id),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes — every read is org-scoped and month-shaped
-- ---------------------------------------------------------------------------

create index if not exists staff_org_idx
  on public.staff (org_id) where deleted_at is null;

create index if not exists staff_attendance_month_idx
  on public.staff_attendance (org_id, date) where deleted_at is null;

create index if not exists staff_advances_person_idx
  on public.staff_advances (org_id, staff_id, date) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- version / updated_at must come from the database, not the client
-- ---------------------------------------------------------------------------

-- The initial schema states the rule: "Sync resolves conflicts on
-- (version, updated_at), so these must be set by the database. A client that
-- lies about its version cannot win a merge it should have lost."
--
-- Without these triggers `version` would sit at 1 for ever while the runner
-- marks all three tables hasVersion, and the pull cursor — which filters on
-- updated_at — would be driven by device clocks. A device running slow would
-- write rows with timestamps other devices' cursors had already passed, and
-- those edits would never be pulled. Silently, and permanently.
do $$
declare
  t text;
begin
  foreach t in array array['staff', 'staff_attendance', 'staff_advances']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function touch_row()',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------

-- Same shape as every other tenant table, written as a loop for the same reason
-- the original policy migration did: so a new table cannot arrive with a subtly
-- different predicate.
--
-- `using` alone would let a member read only their own tenant but write a row
-- stamped with someone else's org_id. `with check` closes that.
--
-- The drop-first is not decoration. Postgres has no `create policy if not
-- exists`, so without it a second application of this file aborts the whole
-- block — and every table above uses `if not exists`, which sets the
-- expectation that re-running is safe.
do $$
declare
  t text;
begin
  foreach t in array array['staff', 'staff_attendance', 'staff_advances']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Applies to table owners too. Without this, anything connecting as the
    -- owning role silently bypasses every policy.
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I
         for all
         to authenticated
         using (org_id = public.org_id())
         with check (org_id = public.org_id())',
      t
    );
  end loop;
end;
$$;

-- No functions are created here, so the default-EXECUTE-grant trap that caught
-- apply_subscription does not apply. If one is ever added to this file, run the
-- security advisor immediately afterwards.
