-- Vyora initial schema — the 20 tables from design/Vyora Database Schema.dc.html,
-- plus `devices`, which the Authentication spec requires but the schema doc omits.
--
-- Conventions from the spec:
--   * Every tenant-scoped table carries org_id uuid -> organizations, with an
--     RLS policy (applied in the next migration).
--   * Business-specific fields live in custom_fields jsonb, so a new vertical
--     needs no migration.
--   * Mutable tables carry version int + updated_at for deterministic sync.
--   * Invoice bodies are stored encrypted (body_enc bytea); the server never
--     sees plaintext.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- NOTE: the three specs disagree on the role list.
--   Authentication.dc.html      -> owner, manager, cashier, accountant
--   Security Architecture       -> owner, manager, cashier, viewer
--   Information Architecture    -> owner, manager, cashier, inventory, viewer
-- This is their union. Owner/manager/cashier are agreed by all three; the rest
-- are included because adding a role later is `alter type ... add value`, while
-- removing one means rewriting every row and policy that references it.
create type vyora_role as enum (
  'owner',
  'manager',
  'cashier',
  'accountant',
  'inventory',
  'viewer'
);

create type member_status as enum ('active', 'invited', 'suspended');

create type invoice_status as enum (
  'draft',
  'issued',
  'paid',
  'partial',
  'overdue',
  'cancelled'
);

create type purchase_status as enum ('draft', 'ordered', 'received', 'cancelled');
create type payment_direction as enum ('in', 'out');
create type party_type as enum ('customer', 'supplier');
create type payment_method as enum ('cash', 'upi', 'card', 'bank', 'cheque', 'credit');
create type stock_movement_type as enum (
  'sale',
  'purchase',
  'adjustment',
  'transfer',
  'return',
  'damage'
);
create type campaign_channel as enum ('whatsapp', 'sms', 'email', 'push', 'instagram');
create type campaign_status as enum ('draft', 'scheduled', 'sent', 'failed');
create type device_status as enum ('active', 'revoked');

-- ---------------------------------------------------------------------------
-- 01 · Identity & tenancy
-- ---------------------------------------------------------------------------

create table business_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  -- Drives forms, invoices, validations, GST rules and reports. The metadata
  -- engine (Phase 5) is the only thing that interprets this.
  config jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type_id uuid references business_types (id),
  gstin text unique,
  state text,
  plan text not null default 'trial',
  seats int not null default 1,
  -- Reference/locator only. The wrapped key material and the DEK itself never
  -- exist here in plaintext — see the crypto package (Phase 6).
  encryption_key_ref text,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users. Supabase owns identity; this holds Vyora's profile data.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique,
  email text unique,
  name text,
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

comment on table users is
  'Profile mirror of auth.users. Credentials live in auth.users — the spec''s
   password_hash column is deliberately omitted, because login is phone+OTP and
   Supabase Auth owns any secret material.';

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role vyora_role not null default 'cashier',
  status member_status not null default 'invited',
  created_at timestamptz not null default now(),
  -- One membership per user per org; the JWT carries a single org_id + role.
  unique (org_id, user_id)
);

create index org_members_org_id_idx on org_members (org_id);
create index org_members_user_id_idx on org_members (user_id);

-- Not in the Database Schema spec, but the Authentication spec requires
-- device-bound sessions: "the owner can revoke any device instantly; its
-- refresh token dies and its local key cache is wiped on next launch".
create table devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  name text,
  platform text,
  status device_status not null default 'active',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index devices_org_id_idx on devices (org_id);
create index devices_user_id_idx on devices (user_id);

-- ---------------------------------------------------------------------------
-- 02 · Catalog & stock
-- ---------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  parent_id uuid references categories (id) on delete set null,
  created_at timestamptz not null default now()
);

create index categories_org_id_idx on categories (org_id);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  sku text,
  category_id uuid references categories (id) on delete set null,
  unit text,
  mrp numeric(14, 2),
  sale_price numeric(14, 2),
  tax_rate numeric(5, 2),
  hsn text,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Spec marks sku UQ; scoped per tenant, since two orgs may reuse an SKU.
  unique (org_id, sku)
);

create index products_org_id_idx on products (org_id);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  batch text,
  expiry date,
  quantity numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3),
  location text,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (org_id, product_id, batch)
);

create index inventory_org_id_idx on inventory (org_id);
create index inventory_expiry_idx on inventory (expiry);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  type stock_movement_type not null,
  qty_delta numeric(14, 3) not null,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index stock_movements_org_id_idx on stock_movements (org_id);

-- ---------------------------------------------------------------------------
-- 03 · Contacts
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  phone text,
  gstin text,
  address jsonb not null default '{}'::jsonb,
  balance numeric(14, 2) not null default 0,
  loyalty_points int not null default 0,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_org_id_idx on customers (org_id);
create index customers_phone_idx on customers (org_id, phone);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  phone text,
  gstin text,
  address jsonb not null default '{}'::jsonb,
  balance numeric(14, 2) not null default 0,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_org_id_idx on suppliers (org_id);

-- ---------------------------------------------------------------------------
-- 04 · Sales & money-in
-- ---------------------------------------------------------------------------

create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  number text not null,
  customer_id uuid references customers (id) on delete set null,
  date date not null default current_date,
  status invoice_status not null default 'draft',
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  -- Client-side AES-256-GCM ciphertext. The server stores and routes it; it
  -- never decrypts it and holds no key capable of doing so.
  body_enc bytea,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null,
  -- Invoice numbers must be unique per tenant, not globally.
  unique (org_id, number)
);

create index invoices_org_id_idx on invoices (org_id);
create index invoices_date_idx on invoices (org_id, date);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  description text,
  qty numeric(14, 3) not null default 1,
  rate numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  meta jsonb not null default '{}'::jsonb
);

create index invoice_items_invoice_id_idx on invoice_items (invoice_id);
create index invoice_items_org_id_idx on invoice_items (org_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  direction payment_direction not null,
  party_type party_type not null,
  -- Polymorphic by design (customer or supplier), so no FK here; the party_type
  -- column says which table party_id points at.
  party_id uuid,
  invoice_id uuid references invoices (id) on delete set null,
  amount numeric(14, 2) not null,
  method payment_method not null default 'cash',
  date date not null default current_date,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null
);

create index payments_org_id_idx on payments (org_id);

-- ---------------------------------------------------------------------------
-- 05 · Purchases & spend
-- ---------------------------------------------------------------------------

create table purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  number text not null,
  supplier_id uuid references suppliers (id) on delete set null,
  date date not null default current_date,
  status purchase_status not null default 'draft',
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);

create index purchases_org_id_idx on purchases (org_id);
create index purchases_date_idx on purchases (org_id, date);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  purchase_id uuid not null references purchases (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  qty numeric(14, 3) not null default 1,
  rate numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  meta jsonb not null default '{}'::jsonb
);

create index purchase_items_purchase_id_idx on purchase_items (purchase_id);
create index purchase_items_org_id_idx on purchase_items (org_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  category text,
  amount numeric(14, 2) not null,
  date date not null default current_date,
  note text,
  receipt_url text,
  recurring boolean not null default false,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null
);

create index expenses_org_id_idx on expenses (org_id);
create index expenses_date_idx on expenses (org_id, date);

-- ---------------------------------------------------------------------------
-- 06 · System & intelligence
-- ---------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  diff jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index audit_logs_org_id_idx on audit_logs (org_id);
create index audit_logs_created_at_idx on audit_logs (org_id, created_at desc);

comment on table audit_logs is
  'Append-only. The hash-chaining from the Security Architecture spec is added
   with the audit module; this table is the substrate.';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references users (id) on delete cascade,
  type text not null,
  title text,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_org_id_idx on notifications (org_id);

create table ai_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  prompt text,
  intent text,
  response jsonb,
  provider text,
  tokens int,
  created_at timestamptz not null default now()
);

create index ai_history_org_id_idx on ai_history (org_id);

create table marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  channel campaign_channel not null,
  segment jsonb not null default '{}'::jsonb,
  template_id uuid,
  status campaign_status not null default 'draft',
  scheduled_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null
);

create index marketing_campaigns_org_id_idx on marketing_campaigns (org_id);

-- ---------------------------------------------------------------------------
-- updated_at / version maintenance
-- ---------------------------------------------------------------------------

-- Sync resolves conflicts on (version, updated_at), so these must be set by the
-- database. A client that lies about its version cannot win a merge it should
-- have lost.
create or replace function touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.version is not null and old.version is not null then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'inventory', 'customers', 'suppliers', 'invoices',
    'payments', 'purchases', 'expenses', 'marketing_campaigns'
  ]
  loop
    execute format(
      'create trigger %I_touch before update on %I
         for each row execute function touch_row()',
      t, t
    );
  end loop;
end;
$$;
