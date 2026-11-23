-- GID Management System - DEMO database
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- It is safe to run again: it drops and recreates the demo tables.
--
-- DEMO ONLY: the access rules at the bottom let anyone who has the app link read and change the data.
-- Use fake data only. The live Phase 1 system will use real staff logins and strict per-role rules.

drop table if exists public.notifications cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.monthly_costs cascade;
drop table if exists public.stock_moves cascade;
drop table if exists public.stock_items cascade;
drop table if exists public.stores cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.safety cascade;
drop table if exists public.defects cascade;
drop table if exists public.inspections cascade;
drop table if exists public.invoices cascade;
drop table if exists public.claims cascade;
drop table if exists public.cost_lines cascade;
drop table if exists public.documents cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.requests cascade;
drop table if exists public.daily_reports cascade;
drop table if exists public.tasks cascade;
drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;
drop table if exists public.staff cascade;

create table public.staff (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text,
  title text,
  groups text,
  tags text,
  phone text,
  email text,
  telegram_chat_id text
);

create table public.projects (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  code text,
  name text,
  client text,
  location text,
  pm_id text,
  status text,
  start_date date,
  end_date date,
  contract_value numeric,
  budget numeric,
  progress numeric,
  lat numeric,
  lng numeric
);

create table public.project_members (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  staff_id text,
  role text
);

create table public.tasks (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  title text,
  assignee_id text,
  due_date date,
  status text,
  priority text,
  created_by text
);

create table public.daily_reports (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  report_date date,
  author_id text,
  weather text,
  manpower int,
  work_done text,
  issues text,
  photo text,
  status text,
  reviewed_by text,
  kind text,
  photos jsonb,
  entries jsonb,
  session text,
  plan text,
  trades jsonb,
  captions jsonb,
  ot_start text,
  ot_end text,
  safety_note text,
  submitted_at timestamptz,
  lat numeric,
  lng numeric,
  loc_acc numeric,
  distance_m numeric,
  loc_status text,
  loc_note text,
  late boolean,
  late_minutes int
);

create table public.requests (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  ref_no text,
  type text,
  project_id text,
  requester_id text,
  title text,
  details text,
  amount numeric,
  leave_days numeric,
  needed_by date,
  status text,
  step_index int,
  steps jsonb,
  history jsonb,
  items jsonb
);

create table public.suppliers (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text,
  trade text,
  contact text,
  phone text
);

create table public.purchase_orders (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  po_no text,
  request_id text,
  project_id text,
  supplier_id text,
  description text,
  amount numeric,
  status text,
  delivered_note text,
  delivered_photo text,
  delivered_by text,
  delivered_at timestamptz,
  split_flag boolean,
  items jsonb
);

create table public.documents (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  doc_no text,
  title text,
  discipline text,
  doc_type text,
  revision int,
  status text,
  owner_id text,
  due_date date,
  notes text,
  file_url text,
  file_name text,
  progress numeric
);

create table public.cost_lines (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  category text,
  budget numeric,
  actual numeric
);

create table public.claims (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  ipc_no int,
  period text,
  claimed numeric,
  certified numeric,
  status text,
  history jsonb
);

create table public.invoices (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  inv_no text,
  direction text,
  project_id text,
  party text,
  source_type text,
  source_id text,
  amount numeric,
  due_date date,
  status text,
  paid_at timestamptz
);

create table public.inspections (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  title text,
  area text,
  discipline text,
  inspector_id text,
  insp_date date,
  result text,
  notes text
);

create table public.defects (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  location text,
  description text,
  assigned_to text,
  due_date date,
  status text,
  photo text,
  raised_by text
);

create table public.safety (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  rec_type text,
  rec_date date,
  description text,
  severity text,
  reported_by text,
  status text,
  action text,
  area text,
  evidence jsonb,
  close_evidence jsonb,
  closed_by text,
  closed_at timestamptz,
  correction text,
  injury text,
  people_involved text,
  likelihood int,
  consequence int,
  root_cause text,
  preventive text,
  lessons text
);

create table public.audit_log (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  at timestamptz,
  actor_id text,
  action text,
  tbl text,
  record_id text,
  summary text
);

create table public.stores (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text,
  store_type text,
  project_id text,
  location text
);

create table public.stock_items (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  code text,
  name text,
  category text,
  unit text,
  min_qty numeric,
  unit_cost numeric
);

create table public.stock_moves (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  move_date date,
  item_id text,
  store_id text,
  to_store_id text,
  qty numeric,
  move_type text,
  project_id text,
  ref text,
  by_id text,
  note text
);

create table public.monthly_costs (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  project_id text,
  month text,
  spent numeric,
  billed numeric
);

create table public.app_settings (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  key text,
  value jsonb,
  updated_by text,
  updated_at timestamptz
);

create table public.notifications (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  to_id text,
  actor_id text,
  title text,
  body text,
  tbl text,
  record_id text,
  read boolean,
  at timestamptz
);

-- The USD 500 rule is also checked by the database, not only by the app:
-- a Material, Purchase or Payment request of USD 500 or more must include an MD approval step.
create or replace function public.check_md_step() returns trigger language plpgsql as $$
begin
  if new.type in ('Material','Purchase','Payment','Petty cash') and coalesce(new.amount,0) >= 500
     and not exists (select 1 from jsonb_array_elements(coalesce(new.steps,'[]'::jsonb)) s where s->>'role' = 'MD') then
    raise exception 'Requests of USD 500 or more need MD approval';
  end if;
  return new;
end $$;
create trigger requests_md_rule before insert or update on public.requests
  for each row execute function public.check_md_step();

-- Demo access rules (open). Replace before going live.
alter table public.staff enable row level security;
create policy "demo open access" on public.staff for all to anon, authenticated using (true) with check (true);
alter table public.projects enable row level security;
create policy "demo open access" on public.projects for all to anon, authenticated using (true) with check (true);
alter table public.project_members enable row level security;
create policy "demo open access" on public.project_members for all to anon, authenticated using (true) with check (true);
alter table public.tasks enable row level security;
create policy "demo open access" on public.tasks for all to anon, authenticated using (true) with check (true);
alter table public.daily_reports enable row level security;
create policy "demo open access" on public.daily_reports for all to anon, authenticated using (true) with check (true);
alter table public.requests enable row level security;
create policy "demo open access" on public.requests for all to anon, authenticated using (true) with check (true);
alter table public.suppliers enable row level security;
create policy "demo open access" on public.suppliers for all to anon, authenticated using (true) with check (true);
alter table public.purchase_orders enable row level security;
create policy "demo open access" on public.purchase_orders for all to anon, authenticated using (true) with check (true);
alter table public.documents enable row level security;
create policy "demo open access" on public.documents for all to anon, authenticated using (true) with check (true);
alter table public.cost_lines enable row level security;
create policy "demo open access" on public.cost_lines for all to anon, authenticated using (true) with check (true);
alter table public.claims enable row level security;
create policy "demo open access" on public.claims for all to anon, authenticated using (true) with check (true);
alter table public.invoices enable row level security;
create policy "demo open access" on public.invoices for all to anon, authenticated using (true) with check (true);
alter table public.inspections enable row level security;
create policy "demo open access" on public.inspections for all to anon, authenticated using (true) with check (true);
alter table public.defects enable row level security;
create policy "demo open access" on public.defects for all to anon, authenticated using (true) with check (true);
alter table public.safety enable row level security;
create policy "demo open access" on public.safety for all to anon, authenticated using (true) with check (true);
alter table public.audit_log enable row level security;
create policy "demo open access" on public.audit_log for all to anon, authenticated using (true) with check (true);
alter table public.stores enable row level security;
create policy "demo open access" on public.stores for all to anon, authenticated using (true) with check (true);
alter table public.stock_items enable row level security;
create policy "demo open access" on public.stock_items for all to anon, authenticated using (true) with check (true);
alter table public.stock_moves enable row level security;
create policy "demo open access" on public.stock_moves for all to anon, authenticated using (true) with check (true);
alter table public.monthly_costs enable row level security;
create policy "demo open access" on public.monthly_costs for all to anon, authenticated using (true) with check (true);
alter table public.app_settings enable row level security;
create policy "demo open access" on public.app_settings for all to anon, authenticated using (true) with check (true);
alter table public.notifications enable row level security;
create policy "demo open access" on public.notifications for all to anon, authenticated using (true) with check (true);

-- Let the app reach these tables through the Supabase API.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- File storage for photos and drawing PDFs (public bucket, DEMO ONLY)
insert into storage.buckets (id, name, public) values ('gid-demo-files', 'gid-demo-files', true) on conflict (id) do nothing;
drop policy if exists "demo files read" on storage.objects;
drop policy if exists "demo files upload" on storage.objects;
create policy "demo files read" on storage.objects for select to anon, authenticated using (bucket_id = 'gid-demo-files');
create policy "demo files upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'gid-demo-files');

-- ================= Telegram alerts =================
-- Every new notification is also sent to the person's Telegram, if they saved their Telegram chat ID.
-- The bot token is kept in a private table that the app and the public API cannot read.
-- Set the token once with supabase/telegram-setup.sql (it is kept when this file is run again).
create extension if not exists pg_net;
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.settings (key text primary key, value text);
revoke all on private.settings from anon, authenticated;
-- Which Telegram message went to which chat, so the app can show whether it arrived
create table if not exists private.telegram_log (request_id bigint primary key, chat text, notification_id text, at timestamptz default now());
revoke all on private.telegram_log from anon, authenticated;

create or replace function public.tg_esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

create or replace function public.notify_telegram() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare tok text; app text; chat text; actor text; msg text; body jsonb; rid bigint;
begin
  select value into tok from private.settings where key = 'telegram_bot_token';
  if coalesce(btrim(tok), '') = '' or tok like 'PASTE%' then return new; end if;
  select telegram_chat_id into chat from public.staff where id = new.to_id;
  if coalesce(btrim(chat), '') = '' then return new; end if;
  select value into app from private.settings where key = 'app_url';
  select name into actor from public.staff where id = new.actor_id;
  msg := '🔔 <b>' || tg_esc(new.title) || '</b>'
      || case when coalesce(new.body, '') <> '' then E'
' || tg_esc(new.body) else '' end
      || E'
<i>' || tg_esc(coalesce(actor, 'GID system')) || ' · '
      || to_char(coalesce(new.at, now()) at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI') || '</i>';
  body := jsonb_build_object('chat_id', btrim(chat), 'text', msg, 'parse_mode', 'HTML', 'disable_web_page_preview', true);
  if coalesce(btrim(app), '') like 'https://%' and new.tbl is not null and new.record_id is not null then
    body := body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
      jsonb_build_object('text', 'Open in GID', 'url', rtrim(btrim(app), '/') || '/#open=' || new.tbl || ':' || new.record_id)))));
  end if;
  rid := net.http_post(url := 'https://api.telegram.org/bot' || btrim(tok) || '/sendMessage', body := body);
  insert into private.telegram_log (request_id, chat, notification_id) values (rid, btrim(chat), new.id) on conflict do nothing;
  delete from private.telegram_log where at < now() - interval '7 days';
  return new;
exception when others then
  return new; -- a Telegram problem must never stop work in the app
end $$;
drop trigger if exists notifications_telegram on public.notifications;
create trigger notifications_telegram after insert on public.notifications
  for each row execute function public.notify_telegram();

-- Lets the app show whether Telegram is set up (never returns the token)
create or replace function public.telegram_status() returns jsonb
language sql security definer set search_path = public, private as $$
  select jsonb_build_object(
    'ready', exists (select 1 from private.settings where key = 'telegram_bot_token' and coalesce(btrim(value), '') <> '' and value not like 'PASTE%'),
    'bot', (select value from private.settings where key = 'bot_username'))
$$;
grant execute on function public.telegram_status() to anon, authenticated;

-- What Telegram answered to the last message sent to one chat (never returns the token)
create or replace function public.telegram_last_result(p_chat text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare l record; r record;
begin
  select * into l from private.telegram_log where chat = btrim(p_chat) order by at desc limit 1;
  if l is null then return jsonb_build_object('state', 'none'); end if;
  select status_code, content, error_msg, timed_out into r from net._http_response where id = l.request_id;
  if not found then return jsonb_build_object('state', 'sending', 'at', l.at); end if;
  return jsonb_build_object('state', case when r.status_code = 200 then 'delivered' else 'failed' end, 'at', l.at, 'status', r.status_code,
    'description', coalesce(case when r.content is not null and left(btrim(r.content), 1) = '{' then (r.content::jsonb)->>'description' end, r.error_msg,
                            case when r.timed_out then 'timed out' end));
exception when others then
  return jsonb_build_object('state', 'unknown', 'description', sqlerrm);
end $$;
grant execute on function public.telegram_last_result(text) to anon, authenticated;

-- ================= Site reports: server send time and late morning reports =================
-- The app sends late_minutes = -1 for a new site report; the database then sets the real send time (Phnom Penh)
-- and the late flag, so a phone with a wrong clock cannot change them. Starting demo data keeps its own values.
create or replace function public.daily_report_server_time() returns trigger language plpgsql as $$
declare loc timestamp; mins int;
begin
  if coalesce(new.kind, 'Site') <> 'Design' and new.late_minutes = -1 then
    loc := now() at time zone 'Asia/Phnom_Penh';
    new.submitted_at := now();
    new.report_date := loc::date;
    mins := extract(hour from loc)::int * 60 + extract(minute from loc)::int - 9 * 60;
    if new.session = 'Morning' and mins >= 0 then new.late := true; new.late_minutes := mins;
    else new.late := false; new.late_minutes := 0; end if;
  end if;
  return new;
end $$;
drop trigger if exists daily_reports_server_time on public.daily_reports;
create trigger daily_reports_server_time before insert on public.daily_reports for each row execute function public.daily_report_server_time();
