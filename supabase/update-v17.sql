-- GID Management System - update for version 17: Variations, Subcontractors, Testing/Handover/Warranty. Safe to run; keeps all data.
alter table public.projects add column if not exists handover_date date, add column if not exists dlp_months int;
create table if not exists public.variations (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  vo_no text,
  project_id text,
  title text,
  reason text,
  asked_by text,
  asked_date date,
  time_days int,
  lines jsonb,
  markup_pct numeric,
  amount numeric,
  status text,
  evidence jsonb,
  client_evidence jsonb,
  client_ref text,
  claim_id text,
  raised_by text,
  history jsonb
);
alter table public.variations enable row level security;
drop policy if exists "demo open access" on public.variations;
create policy "demo open access" on public.variations for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.variations to anon, authenticated;
create table if not exists public.subcontractors (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text,
  trade text,
  contact text,
  phone text,
  telegram text,
  patent boolean,
  vat boolean,
  insurance_until date,
  status text,
  notes text
);
alter table public.subcontractors enable row level security;
drop policy if exists "demo open access" on public.subcontractors;
create policy "demo open access" on public.subcontractors for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.subcontractors to anon, authenticated;
create table if not exists public.sub_contracts (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  sub_id text,
  project_id text,
  scope text,
  contract_value numeric,
  retention_pct numeric,
  start_date date,
  end_date date,
  status text,
  ratings jsonb,
  retention_released boolean
);
alter table public.sub_contracts enable row level security;
drop policy if exists "demo open access" on public.sub_contracts;
create policy "demo open access" on public.sub_contracts for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.sub_contracts to anon, authenticated;
create table if not exists public.sub_payments (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  contract_id text,
  pc_no text,
  period_to date,
  claimed numeric,
  certified numeric,
  retention_amt numeric,
  status text,
  note text,
  evidence jsonb,
  history jsonb,
  paid_at timestamptz
);
alter table public.sub_payments enable row level security;
drop policy if exists "demo open access" on public.sub_payments;
create policy "demo open access" on public.sub_payments for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.sub_payments to anon, authenticated;
create table if not exists public.tests (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  test_no text,
  project_id text,
  system text,
  test_type text,
  location text,
  instrument text,
  instrument_sn text,
  calib_until date,
  limit_value numeric,
  rows jsonb,
  result text,
  tested_by text,
  witness text,
  test_date date,
  photos jsonb,
  defect_ids jsonb,
  note text
);
alter table public.tests enable row level security;
drop policy if exists "demo open access" on public.tests;
create policy "demo open access" on public.tests for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.tests to anon, authenticated;
create table if not exists public.handover_items (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  category text,
  title text,
  status text,
  due_date date,
  evidence jsonb,
  note text,
  updated_by text
);
alter table public.handover_items enable row level security;
drop policy if exists "demo open access" on public.handover_items;
create policy "demo open access" on public.handover_items for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.handover_items to anon, authenticated;
create table if not exists public.warranties (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  item text,
  supplier text,
  start_date date,
  end_date date,
  evidence jsonb,
  note text
);
alter table public.warranties enable row level security;
drop policy if exists "demo open access" on public.warranties;
create policy "demo open access" on public.warranties for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.warranties to anon, authenticated;
notify pgrst, 'reload schema';
