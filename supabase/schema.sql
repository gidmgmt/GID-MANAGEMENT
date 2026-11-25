-- GID Management System - DEMO database
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- It is safe to run again: it drops and recreates the demo tables.
--
-- DEMO ONLY: the access rules at the bottom let anyone who has the app link read and change the data.
-- Use fake data only. The live Phase 1 system will use real staff logins and strict per-role rules.

drop table if exists public.announcements cascade;
drop table if exists public.holidays cascade;
drop table if exists public.events cascade;
drop table if exists public.notifications cascade;
drop table if exists public.warranties cascade;
drop table if exists public.handover_items cascade;
drop table if exists public.tests cascade;
drop table if exists public.sub_payments cascade;
drop table if exists public.sub_contracts cascade;
drop table if exists public.subcontractors cascade;
drop table if exists public.variations cascade;
drop table if exists public.site_visits cascade;
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
  telegram_chat_id text,
  short_name text,
  telegram_user text,
  start_date date,
  desk text,
  photo text,
  left_on date,
  staff_no text
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
  lng numeric,
  scopes jsonb,
  handover_date date,
  dlp_months int
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
  notes text,
  evidence jsonb,
  result_evidence jsonb,
  result_note text,
  checked_at timestamptz
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
  raised_by text,
  discipline text,
  priority text,
  evidence jsonb,
  close_evidence jsonb,
  correction text,
  fixed_by text,
  fixed_at timestamptz,
  closed_by text,
  closed_at timestamptz,
  verify_note text,
  inspection_id text
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

create table public.site_visits (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  svr_no text,
  status text,
  client text,
  contact_name text,
  contact_phone text,
  contact_telegram text,
  address text,
  city text,
  lat numeric,
  lng numeric,
  loc_acc numeric,
  visit_date date,
  time_from text,
  time_to text,
  visited_by text,
  lead_source text,
  work_type text,
  requirements text,
  budget_min numeric,
  budget_max numeric,
  timeline text,
  scopes jsonb,
  conditions jsonb,
  constraints jsonb,
  plot_size text,
  floors text,
  floor_height text,
  floor_area text,
  risks text,
  opportunities text,
  photos jsonb,
  captions jsonb,
  decision text,
  est_value numeric,
  proposed_team text,
  actions jsonb,
  quote_due date,
  quote_value numeric,
  lost_reason text,
  project_id text,
  author_id text,
  approved_by text,
  approved_at timestamptz
);

create table public.variations (
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

create table public.subcontractors (
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

create table public.sub_contracts (
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

create table public.sub_payments (
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

create table public.tests (
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

create table public.handover_items (
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

create table public.warranties (
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
  at timestamptz,
  kind text,
  module text,
  ref text,
  project text,
  amount text,
  due text,
  title_km text,
  body_km text,
  silent boolean
);

create table public.events (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  no text,
  title text,
  type text,
  date date,
  start_time text,
  end_time text,
  all_day boolean,
  project_id text,
  location text,
  organiser_id text,
  attendees jsonb,
  notes text,
  minutes text,
  status text,
  link_module text,
  link_id text,
  created_by text,
  updated_at timestamptz
);

create table public.holidays (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date,
  name text,
  name_km text,
  year int
);

create table public.announcements (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  title text,
  message text,
  importance text,
  audience jsonb,
  recipients jsonb,
  sent_by text,
  sent_at timestamptz,
  pin_until date,
  status text
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
alter table public.site_visits enable row level security;
create policy "demo open access" on public.site_visits for all to anon, authenticated using (true) with check (true);
alter table public.variations enable row level security;
create policy "demo open access" on public.variations for all to anon, authenticated using (true) with check (true);
alter table public.subcontractors enable row level security;
create policy "demo open access" on public.subcontractors for all to anon, authenticated using (true) with check (true);
alter table public.sub_contracts enable row level security;
create policy "demo open access" on public.sub_contracts for all to anon, authenticated using (true) with check (true);
alter table public.sub_payments enable row level security;
create policy "demo open access" on public.sub_payments for all to anon, authenticated using (true) with check (true);
alter table public.tests enable row level security;
create policy "demo open access" on public.tests for all to anon, authenticated using (true) with check (true);
alter table public.handover_items enable row level security;
create policy "demo open access" on public.handover_items for all to anon, authenticated using (true) with check (true);
alter table public.warranties enable row level security;
create policy "demo open access" on public.warranties for all to anon, authenticated using (true) with check (true);
alter table public.notifications enable row level security;
create policy "demo open access" on public.notifications for all to anon, authenticated using (true) with check (true);
alter table public.events enable row level security;
create policy "demo open access" on public.events for all to anon, authenticated using (true) with check (true);
alter table public.holidays enable row level security;
create policy "demo open access" on public.holidays for all to anon, authenticated using (true) with check (true);
alter table public.announcements enable row level security;
create policy "demo open access" on public.announcements for all to anon, authenticated using (true) with check (true);

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
  if new.tbl = 'welcome' then
    -- welcome message for a new staff member: sent exactly as HR wrote it
    msg := '🎉 <b>' || tg_esc(new.title) || E'</b>

' || tg_esc(coalesce(new.body, ''));
  else
  msg := '🔔 <b>' || tg_esc(new.title) || '</b>'
      || case when coalesce(new.body, '') <> '' then E'
' || tg_esc(new.body) else '' end
      || E'
<i>' || tg_esc(coalesce(actor, 'GID system')) || ' · '
      || to_char(coalesce(new.at, now()) at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI') || '</i>';
  end if;
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

-- GID Management System - update for version 18: Devices (who is signed in on which phone or computer). Safe to run; keeps all data.
create table if not exists public.device_sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  staff_id text,
  device_name text,
  label text,
  os text,
  browser text,
  kind text,
  user_agent text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'active',
  ended_at timestamptz,
  ended_by text,
  ended_note text
);
create index if not exists device_sessions_last_seen on public.device_sessions (last_seen desc);
alter table public.device_sessions enable row level security;
drop policy if exists "demo open access" on public.device_sessions;
create policy "demo open access" on public.device_sessions for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.device_sessions to anon, authenticated;

-- Each open app calls this once a minute. It uses the server's clock, and it never turns a signed-out device back on:
-- it returns 'terminated' or 'signed out' so the app locks itself.
create or replace function public.device_beat(p_id text, p_staff text, p_name text, p_os text, p_browser text, p_kind text, p_ua text)
returns text language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from public.device_sessions where id = p_id;
  if st is not null and st <> 'active' then return st; end if;
  insert into public.device_sessions (id, staff_id, device_name, os, browser, kind, user_agent, first_seen, last_seen, status)
  values (p_id, p_staff, p_name, p_os, p_browser, p_kind, left(p_ua, 300), now(), now(), 'active')
  on conflict (id) do update set staff_id = excluded.staff_id, device_name = excluded.device_name, os = excluded.os, browser = excluded.browser,
    kind = excluded.kind, user_agent = excluded.user_agent, last_seen = now()
  where public.device_sessions.status = 'active';
  return 'active';
end $$;
revoke all on function public.device_beat(text, text, text, text, text, text, text) from public;
grant execute on function public.device_beat(text, text, text, text, text, text, text) to anon, authenticated;

-- GID Management System - update for version 20: Sign in / Sign up with our own staff accounts. Safe to run twice; keeps all data.
-- Accounts and sign-in sessions live in the "private" schema: the public app key can never read them.
-- Passwords are stored only as bcrypt hashes; sign-in tokens are stored only as sha256 hashes.
-- The app talks to them only through the gid_* functions below. They answer {"ok":false,"error":"<code>"} for user mistakes.
-- Codes: invalid_login, weak_password, exists, wrong, pending, rejected, disabled, locked, no_session, not_allowed, not_found.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ================= Tables =================
create table if not exists private.accounts (
  id uuid primary key default gen_random_uuid(),
  login_phone text unique,
  login_email text unique,
  full_name text not null,
  pass_hash text not null,
  staff_id text,                              -- public.staff.id, set when HR / System Admin approves (no foreign key: Reset demo reloads staff)
  status text not null default 'pending',     -- pending | active | rejected | disabled
  note text,
  created_at timestamptz default now(),
  decided_by text,
  decided_at timestamptz,
  last_sign_in timestamptz,
  failed_count int default 0,
  locked_until timestamptz,
  must_change_password bool default false,
  constraint accounts_login_set check (login_phone is not null or login_email is not null),
  constraint accounts_status_ok check (status in ('pending', 'active', 'rejected', 'disabled'))
);
-- One active account per staff profile
create unique index if not exists accounts_one_active_per_staff on private.accounts (staff_id) where status = 'active';

create table if not exists private.sessions (
  token_hash text primary key,
  account_id uuid references private.accounts (id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz,
  last_seen timestamptz,
  device_id text,
  revoked_at timestamptz
);
create index if not exists sessions_account on private.sessions (account_id);
create index if not exists sessions_expires on private.sessions (expires_at);

alter table private.accounts enable row level security;   -- no policies: nobody but the functions below can touch them
alter table private.sessions enable row level security;
revoke all on private.accounts from public, anon, authenticated;
revoke all on private.sessions from public, anon, authenticated;

-- ================= Helpers (private, not callable by the app) =================
-- Login text -> kind ('email' | 'phone' | null when invalid) and the normalised value.
-- Phone: digits only; "0..." -> "855..."; "+855"/"855" kept; "855 0..." (extra trunk zero) -> "855..."; must be 11-12 digits.
create or replace function private.norm_login(p text, out kind text, out val text)
language plpgsql immutable set search_path = public, private, extensions as $$
declare t text := btrim(coalesce(p, '')); d text;
begin
  if position('@' in t) > 0 then
    t := lower(t);
    if t ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then kind := 'email'; val := t; end if;
    return;
  end if;
  d := regexp_replace(t, '\D', '', 'g');
  if d like '8550%' then d := '855' || substr(d, 5);
  elsif d like '0%' then d := '855' || substr(d, 2);
  end if;
  if d like '855%' and length(d) between 11 and 12 then kind := 'phone'; val := d; end if;
end $$;

-- Is a tag (MD, HR, SYSADMIN...) in a comma/space separated tag list?
create or replace function private.has_tag(p_tags text, p_tag text) returns boolean
language sql immutable set search_path = public, private, extensions as $$
  select upper(p_tag) = any (regexp_split_to_array(upper(btrim(coalesce(p_tags, ''))), '[\s,;]+'))
$$;

create or replace function private.token_hash(p_token text) returns text
language sql immutable set search_path = public, private, extensions as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

create or replace function private.pw_ok(p text) returns boolean
language sql immutable set search_path = public, private, extensions as $$
  select length(coalesce(p, '')) >= 8 and p ~ '[A-Za-z]' and p ~ '[0-9]'
$$;

-- The account behind a valid session (not revoked, not expired, account active, staff profile current), or null.
create or replace function private.session_account(p_token text) returns uuid
language sql stable security definer set search_path = public, private, extensions as $$
  select a.id
  from private.sessions s
  join private.accounts a on a.id = s.account_id
  join public.staff st on st.id = a.staff_id
  where s.token_hash = private.token_hash(p_token)
    and s.revoked_at is null and s.expires_at > now()
    and a.status = 'active' and st.left_on is null
  limit 1
$$;

-- The staff id of the session if that person may approve accounts (HR, SYSADMIN, BACKUPADMIN or MD), or null.
create or replace function private.approver_staff(p_token text) returns text
language sql stable security definer set search_path = public, private, extensions as $$
  select st.id
  from private.accounts a join public.staff st on st.id = a.staff_id
  where a.id = private.session_account(p_token)
    and (private.has_tag(st.tags, 'HR') or private.has_tag(st.tags, 'SYSADMIN')
         or private.has_tag(st.tags, 'BACKUPADMIN') or private.has_tag(st.tags, 'MD'))
$$;

-- A current staff profile with the same phone / email as this account and no active account of its own.
create or replace function private.suggest_staff(p_phone text, p_email text) returns text
language sql stable security definer set search_path = public, private, extensions as $$
  select st.id from public.staff st
  where st.left_on is null
    and ((p_phone is not null and (private.norm_login(st.phone)).val = p_phone)
      or (p_email is not null and lower(btrim(st.email)) = p_email))
    and not exists (select 1 from private.accounts x where x.staff_id = st.id and x.status = 'active')
  order by st.id limit 1
$$;

revoke all on function private.norm_login(text) from public, anon, authenticated;
revoke all on function private.has_tag(text, text) from public, anon, authenticated;
revoke all on function private.token_hash(text) from public, anon, authenticated;
revoke all on function private.pw_ok(text) from public, anon, authenticated;
revoke all on function private.session_account(text) from public, anon, authenticated;
revoke all on function private.approver_staff(text) from public, anon, authenticated;
revoke all on function private.suggest_staff(text, text) from public, anon, authenticated;

-- ================= 1. Sign up =================
create or replace function public.gid_sign_up(p_login text, p_password text, p_name text, p_note text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare n record; nm text := left(btrim(coalesce(p_name, '')), 100); acc uuid;
begin
  n := private.norm_login(p_login);
  if n.kind is null or nm = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_login', 'field', case when n.kind is null then 'login' else 'name' end);
  end if;
  if not private.pw_ok(p_password) then return jsonb_build_object('ok', false, 'error', 'weak_password'); end if;
  if exists (select 1 from private.accounts where (n.kind = 'phone' and login_phone = n.val) or (n.kind = 'email' and login_email = n.val)) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  begin
    insert into private.accounts (login_phone, login_email, full_name, pass_hash, note, status)
    values (case when n.kind = 'phone' then n.val end, case when n.kind = 'email' then n.val end,
            nm, crypt(p_password, gen_salt('bf', 10)), nullif(left(btrim(coalesce(p_note, '')), 500), ''), 'pending')
    returning id into acc;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end;
  -- Alert HR, System Admin and backup admin (bell + Telegram through the notify_telegram trigger)
  insert into public.notifications (to_id, actor_id, title, body, tbl, record_id, read, at)
  select st.id, null, 'New sign-up waiting for approval', nm || ' · ' || btrim(p_login), 'accounts', acc::text, false, now()
  from public.staff st
  where st.left_on is null
    and (private.has_tag(st.tags, 'HR') or private.has_tag(st.tags, 'SYSADMIN') or private.has_tag(st.tags, 'BACKUPADMIN'));
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;

-- ================= 2. Sign in =================
create or replace function public.gid_sign_in(p_login text, p_password text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare n record; a private.accounts%rowtype; st_left date; st_found boolean; tok text; exp timestamptz;
begin
  -- housekeeping: forget sessions that ended more than 7 days ago
  delete from private.sessions where expires_at < now() - interval '7 days';

  n := private.norm_login(p_login);
  if n.kind is not null then
    select * into a from private.accounts
    where (n.kind = 'phone' and login_phone = n.val) or (n.kind = 'email' and login_email = n.val)
    for update;
  end if;
  if a.id is null then
    perform crypt(coalesce(p_password, ''), gen_salt('bf', 10));   -- same time as a real check: do not reveal which logins exist
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'minutes', greatest(1, ceil(extract(epoch from (a.locked_until - now())) / 60)::int));
  end if;

  if crypt(coalesce(p_password, ''), a.pass_hash) <> a.pass_hash then
    if coalesce(a.failed_count, 0) + 1 >= 5 then
      update private.accounts set failed_count = 0, locked_until = now() + interval '15 minutes' where id = a.id;
    else
      update private.accounts set failed_count = coalesce(failed_count, 0) + 1 where id = a.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  -- password is right: clear the wrong-try counter, then check the status
  update private.accounts set failed_count = 0, locked_until = null where id = a.id;
  if a.status <> 'active' then return jsonb_build_object('ok', false, 'error', a.status); end if;
  select true, left_on into st_found, st_left from public.staff where id = a.staff_id;
  if st_found is null or st_left is not null then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;

  tok := encode(gen_random_bytes(32), 'hex');
  exp := now() + interval '30 days';
  insert into private.sessions (token_hash, account_id, created_at, expires_at, last_seen, device_id)
  values (private.token_hash(tok), a.id, now(), exp, now(), nullif(left(btrim(coalesce(p_device, '')), 100), ''));
  update private.accounts set last_sign_in = now() where id = a.id;
  return jsonb_build_object('ok', true, 'token', tok, 'staff_id', a.staff_id, 'name', a.full_name,
    'must_change_password', coalesce(a.must_change_password, false), 'expires_at', exp);
end $$;

-- ================= 3. Session check =================
create or replace function public.gid_session(p_token text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare acc uuid; a private.accounts%rowtype;
begin
  acc := private.session_account(p_token);
  if acc is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  update private.sessions set last_seen = now() where token_hash = private.token_hash(p_token);
  select * into a from private.accounts where id = acc;
  return jsonb_build_object('ok', true, 'staff_id', a.staff_id, 'name', a.full_name, 'account_id', a.id,
    'login', coalesce(a.login_phone, a.login_email), 'must_change_password', coalesce(a.must_change_password, false));
end $$;

-- ================= 4. Sign out =================
create or replace function public.gid_sign_out(p_token text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
begin
  update private.sessions set revoked_at = now() where token_hash = private.token_hash(p_token) and revoked_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- ================= 5. Change password =================
create or replace function public.gid_change_password(p_token text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare acc uuid; h text;
begin
  acc := private.session_account(p_token);
  if acc is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select pass_hash into h from private.accounts where id = acc for update;
  if crypt(coalesce(p_old, ''), h) <> h then return jsonb_build_object('ok', false, 'error', 'wrong'); end if;
  if not private.pw_ok(p_new) then return jsonb_build_object('ok', false, 'error', 'weak_password'); end if;
  update private.accounts set pass_hash = crypt(p_new, gen_salt('bf', 10)), must_change_password = false where id = acc;
  update private.sessions set revoked_at = now()
  where account_id = acc and revoked_at is null and token_hash <> private.token_hash(p_token);
  return jsonb_build_object('ok', true);
end $$;

-- ================= 6. Approvers: list, decide, reset =================
create or replace function public.gid_accounts(p_token text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare me text;
begin
  me := private.approver_staff(p_token);
  if me is null then
    return jsonb_build_object('ok', false, 'error', case when private.session_account(p_token) is null then 'no_session' else 'not_allowed' end);
  end if;
  return jsonb_build_object('ok', true, 'accounts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'full_name', a.full_name, 'login_phone', a.login_phone, 'login_email', a.login_email,
      'status', a.status, 'staff_id', a.staff_id, 'note', a.note, 'created_at', a.created_at,
      'decided_by', a.decided_by, 'decided_at', a.decided_at, 'last_sign_in', a.last_sign_in,
      'suggested_staff_id', case when a.status = 'pending' then private.suggest_staff(a.login_phone, a.login_email) end)
      order by a.created_at desc)
    from private.accounts a), '[]'::jsonb));
end $$;

create or replace function public.gid_decide_account(p_token text, p_account_id text, p_action text, p_staff_id text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare me text; acc uuid; a private.accounts%rowtype; act text := lower(btrim(coalesce(p_action, ''))); sid text; label text; new_status text;
begin
  me := private.approver_staff(p_token);
  if me is null then
    return jsonb_build_object('ok', false, 'error', case when private.session_account(p_token) is null then 'no_session' else 'not_allowed' end);
  end if;
  if act not in ('approve', 'reject', 'disable', 'enable') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  begin acc := p_account_id::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'not_found'); end;
  select * into a from private.accounts where id = acc for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- nobody may approve, reject or disable their own account (so the last admin cannot lock themselves out)
  if a.id = private.session_account(p_token) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;

  if act = 'approve' or (act = 'enable' and a.staff_id is not null) then
    sid := case when act = 'approve' then btrim(coalesce(p_staff_id, '')) else a.staff_id end;
    if not exists (select 1 from public.staff where id = sid and left_on is null) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (select 1 from private.accounts where staff_id = sid and status = 'active' and id <> a.id) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    new_status := 'active';
  elsif act = 'enable' then
    new_status := 'pending';    -- a rejected sign-up that was never linked goes back to the waiting list
  elsif act = 'reject' then
    new_status := 'rejected';
  else
    new_status := 'disabled';
  end if;

  begin
    update private.accounts set status = new_status, staff_id = coalesce(sid, staff_id), decided_by = me, decided_at = now(),
      failed_count = case when new_status = 'active' then 0 else failed_count end,
      locked_until = case when new_status = 'active' then null else locked_until end
    where id = a.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end;
  if new_status in ('rejected', 'disabled') then
    update private.sessions set revoked_at = now() where account_id = a.id and revoked_at is null;
  end if;

  label := case act when 'approve' then 'Account approved' when 'reject' then 'Account rejected'
                    when 'disable' then 'Account disabled' else 'Account enabled' end;
  insert into public.audit_log (at, actor_id, action, tbl, record_id, summary)
  values (now(), me, label, 'accounts', a.id::text,
          a.full_name || ' · ' || coalesce(a.login_phone, a.login_email)
          || case when new_status = 'active' then ' → staff ' || coalesce(sid, a.staff_id) else '' end);
  return jsonb_build_object('ok', true, 'status', new_status);
end $$;

create or replace function public.gid_reset_password(p_token text, p_account_id text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare me text; acc uuid; a private.accounts%rowtype; pw text; b bytea; i int;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';   -- no 0 O 1 l I
begin
  me := private.approver_staff(p_token);
  if me is null then
    return jsonb_build_object('ok', false, 'error', case when private.session_account(p_token) is null then 'no_session' else 'not_allowed' end);
  end if;
  begin acc := p_account_id::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'not_found'); end;
  select * into a from private.accounts where id = acc for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  loop
    pw := ''; b := gen_random_bytes(64); i := 0;
    while length(pw) < 10 and i < 64 loop
      if get_byte(b, i) < 224 then pw := pw || substr(abc, get_byte(b, i) % 56 + 1, 1); end if;   -- 224 = 4 x 56, no bias
      i := i + 1;
    end loop;
    exit when length(pw) = 10 and private.pw_ok(pw);
  end loop;
  update private.accounts set pass_hash = crypt(pw, gen_salt('bf', 10)), must_change_password = true,
    failed_count = 0, locked_until = null where id = a.id;
  update private.sessions set revoked_at = now() where account_id = a.id and revoked_at is null;
  insert into public.audit_log (at, actor_id, action, tbl, record_id, summary)
  values (now(), me, 'Password reset', 'accounts', a.id::text, a.full_name || ' · ' || coalesce(a.login_phone, a.login_email));
  return jsonb_build_object('ok', true, 'temp_password', pw);
end $$;

-- ================= Who may call the functions =================
revoke all on function public.gid_sign_up(text, text, text, text) from public;
revoke all on function public.gid_sign_in(text, text, text) from public;
revoke all on function public.gid_session(text) from public;
revoke all on function public.gid_sign_out(text) from public;
revoke all on function public.gid_change_password(text, text, text) from public;
revoke all on function public.gid_accounts(text) from public;
revoke all on function public.gid_decide_account(text, text, text, text) from public;
revoke all on function public.gid_reset_password(text, text) from public;
grant execute on function public.gid_sign_up(text, text, text, text) to anon, authenticated;
grant execute on function public.gid_sign_in(text, text, text) to anon, authenticated;
grant execute on function public.gid_session(text) to anon, authenticated;
grant execute on function public.gid_sign_out(text) to anon, authenticated;
grant execute on function public.gid_change_password(text, text, text) to anon, authenticated;
grant execute on function public.gid_accounts(text) to anon, authenticated;
grant execute on function public.gid_decide_account(text, text, text, text) to anon, authenticated;
grant execute on function public.gid_reset_password(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- TEST BLOCK for the lead (do NOT run as part of the update). Copy everything between the /* */ markers
-- into ONE execute_sql call: it creates "TEST ..." accounts, runs every function, and lists each step with pass = true/false.
-- Telegram alerts from the test sign-ups are switched off inside the block (set send_tg := true to see them).
-- Then run the CLEANUP block (a second call) and check it returns 0 left.
-- =====================================================================================================
/*
create temp table if not exists gid_test_out (n serial, step text, result jsonb, pass boolean);
truncate gid_test_out;
do $t$
declare
  send_tg boolean := false;
  r jsonb; acc uuid; adm_acc uuid; adm_staff text; who_staff text; tok_admin text; tok text; tok2 text; tmp text; i int;
begin
  if not send_tg then alter table public.notifications disable trigger notifications_telegram; end if;
  -- start clean if an earlier test was not cleaned up
  delete from public.notifications where tbl = 'accounts' and record_id in (select id::text from private.accounts where full_name like 'TEST %');
  delete from public.audit_log where tbl = 'accounts' and record_id in (select id::text from private.accounts where full_name like 'TEST %');
  delete from private.accounts where full_name like 'TEST %';

  -- approver: s33 (System Admin) unless s33 already has an active real account; then another HR/admin profile
  select id into adm_staff from public.staff st where id in ('s33', 's35', 's30', 's01') and left_on is null
    and not exists (select 1 from private.accounts a where a.staff_id = st.id and a.status = 'active')
    order by case id when 's33' then 1 when 's35' then 2 when 's30' then 3 else 4 end limit 1;
  -- staff profile for TEST Sophea: a current person with no approver tags and no active account
  select id into who_staff from public.staff st where left_on is null
    and not (private.has_tag(tags, 'HR') or private.has_tag(tags, 'SYSADMIN') or private.has_tag(tags, 'BACKUPADMIN') or private.has_tag(tags, 'MD'))
    and not exists (select 1 from private.accounts a where a.staff_id = st.id and a.status = 'active')
    order by id desc limit 1;
  insert into gid_test_out (step, result, pass) values ('0 staff used', jsonb_build_object('approver', adm_staff, 'sophea', who_staff), adm_staff is not null and who_staff is not null);

  r := public.gid_sign_up('099 000 0020', 'Sophea2026', 'TEST Sophea', 'Site engineer, project A');
  insert into gid_test_out (step, result, pass) values ('1 sign up by phone', r, r->>'status' = 'pending');
  select id into acc from private.accounts where full_name = 'TEST Sophea';
  insert into gid_test_out (step, result, pass) values ('1b stored phone normalised', to_jsonb((select login_phone from private.accounts where id = acc)),
    (select login_phone from private.accounts where id = acc) = '855990000020');
  insert into gid_test_out (step, result, pass) select '1c HR/admin alerts created', to_jsonb(count(*)), count(*) > 0
    from public.notifications where tbl = 'accounts' and record_id = acc::text;
  r := public.gid_sign_up('+855 99 000 0020', 'Other2026x', 'TEST Sophea twice', null);
  insert into gid_test_out (step, result, pass) values ('1d same phone other format', r, r->>'error' = 'exists');
  r := public.gid_sign_up('test.weak.v20@example.invalid', 'short1', 'TEST Weak', null);
  insert into gid_test_out (step, result, pass) values ('1e weak password', r, r->>'error' = 'weak_password');
  r := public.gid_sign_up('12', 'Sophea2026', 'TEST Bad login', null);
  insert into gid_test_out (step, result, pass) values ('1f invalid login', r, r->>'error' = 'invalid_login');

  r := public.gid_sign_in('0990000020', 'Sophea2026', 'test-device');
  insert into gid_test_out (step, result, pass) values ('2 sign in before approval', r, r->>'error' = 'pending');
  r := public.gid_sign_in('0990000020', 'NotHerPw99', 'test-device');
  insert into gid_test_out (step, result, pass) values ('2b wrong password while pending', r, r->>'error' = 'wrong');
  r := public.gid_sign_in('011 222 3334', 'Whatever99', 'test-device');
  insert into gid_test_out (step, result, pass) values ('2c unknown login', r, r->>'error' = 'wrong');

  -- TEST approver: signed up normally, made active by a direct UPDATE (test only)
  r := public.gid_sign_up('test.approver.v20@example.invalid', 'Approver2026', 'TEST Approver', 'test approver');
  update private.accounts set status = 'active', staff_id = adm_staff, decided_by = 'test', decided_at = now()
    where login_email = 'test.approver.v20@example.invalid' returning id into adm_acc;
  r := public.gid_sign_in('TEST.Approver.v20@example.invalid ', 'Approver2026', 'test-device');
  tok_admin := r->>'token';
  insert into gid_test_out (step, result, pass) values ('3 approver signs in (email, any case)', r - 'token', r->>'ok' = 'true' and r->>'staff_id' = adm_staff);

  r := public.gid_accounts(tok_admin);
  insert into gid_test_out (step, result, pass) values ('4 approver lists accounts', jsonb_build_object('count', jsonb_array_length(r->'accounts')),
    r->>'ok' = 'true' and exists (select 1 from jsonb_array_elements(r->'accounts') e where e->>'id' = acc::text and e->>'status' = 'pending')
    and not (r::text like '%pass_hash%' or r::text like '%$2a$%'));
  r := public.gid_decide_account(tok_admin, adm_acc::text, 'disable', null);
  insert into gid_test_out (step, result, pass) values ('4b cannot disable own account', r, r->>'error' = 'not_allowed');
  r := public.gid_decide_account(tok_admin, acc::text, 'approve', 'nobody-x');
  insert into gid_test_out (step, result, pass) values ('4c approve with unknown staff', r, r->>'error' = 'not_found');
  r := public.gid_decide_account(tok_admin, acc::text, 'approve', adm_staff);
  insert into gid_test_out (step, result, pass) values ('4d approve with a staff already used', r, r->>'error' = 'exists');
  r := public.gid_decide_account(tok_admin, acc::text, 'approve', who_staff);
  insert into gid_test_out (step, result, pass) values ('5 approve TEST Sophea', r, r->>'ok' = 'true');
  insert into gid_test_out (step, result, pass) select '5b activity log row', to_jsonb(count(*)), count(*) = 1
    from public.audit_log where tbl = 'accounts' and record_id = acc::text and action = 'Account approved';

  r := public.gid_sign_in('+855 99 000 0020', 'Sophea2026', 'test-device');
  tok := r->>'token';
  insert into gid_test_out (step, result, pass) values ('6 sign in after approval', r - 'token', r->>'ok' = 'true' and r->>'staff_id' = who_staff and length(tok) = 64);
  insert into gid_test_out (step, result, pass) values ('6b token stored only as hash', null,
    not exists (select 1 from private.sessions where token_hash = tok) and exists (select 1 from private.sessions where token_hash = private.token_hash(tok)));
  r := public.gid_accounts(tok);
  insert into gid_test_out (step, result, pass) values ('6c normal staff cannot list accounts', r, r->>'error' = 'not_allowed');

  r := public.gid_session(tok);
  insert into gid_test_out (step, result, pass) values ('7 session check', r, r->>'ok' = 'true' and r->>'staff_id' = who_staff and r->>'login' = '855990000020');
  r := public.gid_session('not-a-real-token');
  insert into gid_test_out (step, result, pass) values ('7b bad token', r, r->>'error' = 'no_session');

  r := public.gid_sign_in('0990000020', 'Sophea2026', 'second-device');
  tok2 := r->>'token';
  r := public.gid_change_password(tok, 'WrongOld11', 'NewSophea77');
  insert into gid_test_out (step, result, pass) values ('8 change password, wrong old', r, r->>'error' = 'wrong');
  r := public.gid_change_password(tok, 'Sophea2026', 'abcdefgh');
  insert into gid_test_out (step, result, pass) values ('8b change password, weak new', r, r->>'error' = 'weak_password');
  r := public.gid_change_password(tok, 'Sophea2026', 'NewSophea77');
  insert into gid_test_out (step, result, pass) values ('8c change password', r, r->>'ok' = 'true');
  insert into gid_test_out (step, result, pass) values ('8d this session kept, other device signed out',
    jsonb_build_object('this', public.gid_session(tok)->>'ok', 'other', public.gid_session(tok2)->>'error'),
    public.gid_session(tok)->>'ok' = 'true' and public.gid_session(tok2)->>'error' = 'no_session');
  r := public.gid_sign_in('0990000020', 'NewSophea77', 'test-device');
  insert into gid_test_out (step, result, pass) values ('8e sign in with new password', r - 'token', r->>'ok' = 'true');

  for i in 1..5 loop
    r := public.gid_sign_in('0990000020', 'Wrong' || i || 'xxxx', 'test-device');
    insert into gid_test_out (step, result, pass) values ('9 wrong password #' || i, r, r->>'error' = 'wrong');
  end loop;
  r := public.gid_sign_in('0990000020', 'NewSophea77', 'test-device');
  insert into gid_test_out (step, result, pass) values ('9b locked even with right password', r, r->>'error' = 'locked' and (r->>'minutes')::int between 1 and 15);

  r := public.gid_reset_password(tok_admin, acc::text);
  tmp := r->>'temp_password';
  insert into gid_test_out (step, result, pass) values ('10 reset password', jsonb_build_object('ok', r->'ok', 'length', length(tmp)),
    r->>'ok' = 'true' and length(tmp) = 10 and tmp !~ '[0O1l]');
  insert into gid_test_out (step, result, pass) values ('10b old sessions ended', to_jsonb(public.gid_session(tok)->>'error'), public.gid_session(tok)->>'error' = 'no_session');
  r := public.gid_sign_in('0990000020', tmp, 'test-device');
  tok := r->>'token';
  insert into gid_test_out (step, result, pass) values ('10c sign in with temporary password', r - 'token', r->>'ok' = 'true' and r->>'must_change_password' = 'true');

  r := public.gid_sign_out(tok);
  insert into gid_test_out (step, result, pass) values ('11 sign out', r, r->>'ok' = 'true');
  r := public.gid_session(tok);
  insert into gid_test_out (step, result, pass) values ('11b session after sign out', r, r->>'error' = 'no_session');

  r := public.gid_decide_account(tok_admin, acc::text, 'disable', null);
  insert into gid_test_out (step, result, pass) values ('12 disable', r, r->>'status' = 'disabled');
  r := public.gid_sign_in('0990000020', tmp, 'test-device');
  insert into gid_test_out (step, result, pass) values ('12b sign in when disabled', r, r->>'error' = 'disabled');
  r := public.gid_decide_account(tok_admin, acc::text, 'enable', null);
  insert into gid_test_out (step, result, pass) values ('12c enable', r, r->>'status' = 'active');

  if not send_tg then alter table public.notifications enable trigger notifications_telegram; end if;
end $t$;
select n, step, pass, result from gid_test_out order by n;
*/

-- CLEANUP (second call): removes every TEST account, its sessions, alerts and activity-log rows.
/*
with gone as (select id::text as id from private.accounts where full_name like 'TEST %'),
     n as (delete from public.notifications where tbl = 'accounts' and record_id in (select id from gone) returning 1),
     l as (delete from public.audit_log where tbl = 'accounts' and record_id in (select id from gone) returning 1)
delete from private.accounts where id::text in (select id from gone);
select (select count(*) from private.accounts where full_name like 'TEST %') as accounts_left,
       (select count(*) from public.notifications n where tbl = 'accounts' and not exists (select 1 from private.accounts a where a.id::text = n.record_id)) as orphan_alerts,
       (select count(*) from public.audit_log l where tbl = 'accounts' and not exists (select 1 from private.accounts a where a.id::text = l.record_id)) as orphan_log_rows;
*/

-- GID Management System - update for version 22: Schedule & Meetings, and Cambodia public holidays. Safe to run twice; keeps all data.
-- events: meetings, inspections, site visits, claim dates… (attendees = jsonb list of staff ids). holidays: official public holidays (HR keeps them up to date).

create table if not exists public.events (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  no text,
  title text,
  type text,
  date date,
  start_time text,
  end_time text,
  all_day boolean,
  project_id text,
  location text,
  organiser_id text,
  attendees jsonb,
  notes text,
  minutes text,
  status text,
  link_module text,
  link_id text,
  created_by text,
  updated_at timestamptz
);
alter table public.events add column if not exists no text;
alter table public.events add column if not exists title text;
alter table public.events add column if not exists type text;
alter table public.events add column if not exists date date;
alter table public.events add column if not exists start_time text;
alter table public.events add column if not exists end_time text;
alter table public.events add column if not exists all_day boolean;
alter table public.events add column if not exists project_id text;
alter table public.events add column if not exists location text;
alter table public.events add column if not exists organiser_id text;
alter table public.events add column if not exists attendees jsonb;
alter table public.events add column if not exists notes text;
alter table public.events add column if not exists minutes text;
alter table public.events add column if not exists status text;
alter table public.events add column if not exists link_module text;
alter table public.events add column if not exists link_id text;
alter table public.events add column if not exists created_by text;
alter table public.events add column if not exists updated_at timestamptz;
alter table public.events enable row level security;
drop policy if exists "demo open access" on public.events;
create policy "demo open access" on public.events for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.events to anon, authenticated;

create table if not exists public.holidays (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date,
  name text,
  name_km text,
  year int
);
alter table public.holidays add column if not exists date date;
alter table public.holidays add column if not exists name text;
alter table public.holidays add column if not exists name_km text;
alter table public.holidays add column if not exists year int;
alter table public.holidays enable row level security;
drop policy if exists "demo open access" on public.holidays;
create policy "demo open access" on public.holidays for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.holidays to anon, authenticated;

create index if not exists events_date on public.events (date);
create index if not exists holidays_date on public.holidays (date);

-- Official public holidays 2026 (Sub-Decree 167) and 2027 (sub-decree of 16 Sep 2026; lunar dates "to be confirmed" may move)
insert into public.holidays (id, date, name, name_km, year) values
  ('hol-2026-01-01', '2026-01-01', 'International New Year Day', 'ទិវាចូលឆ្នាំសកល', 2026),
  ('hol-2026-01-07', '2026-01-07', 'Victory over Genocide Day', 'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍', 2026),
  ('hol-2026-03-08', '2026-03-08', 'International Women''s Day', 'ទិវាសិទ្ធិនារីអន្តរជាតិ', 2026),
  ('hol-2026-04-14', '2026-04-14', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2026),
  ('hol-2026-04-15', '2026-04-15', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2026),
  ('hol-2026-04-16', '2026-04-16', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2026),
  ('hol-2026-05-01', '2026-05-01', 'International Labour Day and Visak Bochea Day', 'ទិវាពលកម្មអន្តរជាតិ និងពិធីបុណ្យវិសាខបូជា', 2026),
  ('hol-2026-05-05', '2026-05-05', 'Royal Ploughing Ceremony', 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល', 2026),
  ('hol-2026-05-14', '2026-05-14', 'King Norodom Sihamoni''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2026),
  ('hol-2026-06-18', '2026-06-18', 'Queen Mother Norodom Monineath Sihanouk''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម សម្តេចព្រះមហាក្សត្រី នរោត្តម មុនិនាថ សីហនុ', 2026),
  ('hol-2026-09-24', '2026-09-24', 'Constitution Day', 'ទិវារដ្ឋធម្មនុញ្ញ', 2026),
  ('hol-2026-10-10', '2026-10-10', 'Pchum Ben', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ', 2026),
  ('hol-2026-10-11', '2026-10-11', 'Pchum Ben', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ', 2026),
  ('hol-2026-10-12', '2026-10-12', 'Pchum Ben', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ', 2026),
  ('hol-2026-10-15', '2026-10-15', 'Commemoration Day of the late King Father Norodom Sihanouk', 'ទិវាប្រារព្ធពិធីគោរពព្រះវិញ្ញាណក្ខន្ធ ព្រះករុណា ព្រះបាទសម្តេចព្រះ នរោត្តម សីហនុ ព្រះវររាជបិតា', 2026),
  ('hol-2026-10-29', '2026-10-29', 'King Norodom Sihamoni''s Coronation Day', 'ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2026),
  ('hol-2026-11-09', '2026-11-09', 'Independence Day', 'ទិវាឯករាជ្យជាតិ', 2026),
  ('hol-2026-11-23', '2026-11-23', 'Water Festival', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក', 2026),
  ('hol-2026-11-24', '2026-11-24', 'Water Festival', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក', 2026),
  ('hol-2026-11-25', '2026-11-25', 'Water Festival', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក', 2026),
  ('hol-2026-12-29', '2026-12-29', 'Peace Day in Cambodia', 'ទិវាសន្តិភាពនៅកម្ពុជា', 2026),
  ('hol-2027-01-01', '2027-01-01', 'International New Year Day', 'ទិវាចូលឆ្នាំសកល', 2027),
  ('hol-2027-01-07', '2027-01-07', 'Victory over Genocide Day', 'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍', 2027),
  ('hol-2027-03-08', '2027-03-08', 'International Women''s Day', 'ទិវាសិទ្ធិនារីអន្តរជាតិ', 2027),
  ('hol-2027-04-14', '2027-04-14', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2027),
  ('hol-2027-04-15', '2027-04-15', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2027),
  ('hol-2027-04-16', '2027-04-16', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2027),
  ('hol-2027-05-01', '2027-05-01', 'International Labour Day', 'ទិវាពលកម្មអន្តរជាតិ', 2027),
  ('hol-2027-05-14', '2027-05-14', 'King Norodom Sihamoni''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2027),
  ('hol-2027-05-20', '2027-05-20', 'Visak Bochea Day (to be confirmed)', 'ពិធីបុណ្យវិសាខបូជា (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-05-24', '2027-05-24', 'Royal Ploughing Ceremony (to be confirmed)', 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-06-18', '2027-06-18', 'Queen Mother Norodom Monineath Sihanouk''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម សម្តេចព្រះមហាក្សត្រី នរោត្តម មុនិនាថ សីហនុ', 2027),
  ('hol-2027-09-24', '2027-09-24', 'Constitution Day', 'ទិវារដ្ឋធម្មនុញ្ញ', 2027),
  ('hol-2027-09-29', '2027-09-29', 'Pchum Ben (to be confirmed)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-09-30', '2027-09-30', 'Pchum Ben (to be confirmed)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-10-01', '2027-10-01', 'Pchum Ben (to be confirmed)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-10-15', '2027-10-15', 'Commemoration Day of the late King Father Norodom Sihanouk', 'ទិវាប្រារព្ធពិធីគោរពព្រះវិញ្ញាណក្ខន្ធ ព្រះករុណា ព្រះបាទសម្តេចព្រះ នរោត្តម សីហនុ ព្រះវររាជបិតា', 2027),
  ('hol-2027-10-29', '2027-10-29', 'King Norodom Sihamoni''s Coronation Day', 'ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2027),
  ('hol-2027-11-09', '2027-11-09', 'Independence Day', 'ទិវាឯករាជ្យជាតិ', 2027),
  ('hol-2027-11-12', '2027-11-12', 'Water Festival (to be confirmed)', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-11-13', '2027-11-13', 'Water Festival (to be confirmed)', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-11-14', '2027-11-14', 'Water Festival (to be confirmed)', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-12-29', '2027-12-29', 'Peace Day in Cambodia', 'ទិវាសន្តិភាពនៅកម្ពុជា', 2027)
on conflict (id) do nothing;

-- GID Management System - update for version 23: Announcements, sign in every day, clearer Telegram alerts. Safe to run twice; keeps all data.
-- 1. announcements: company announcements (MD / HR / Admin write them; the app sends one notification per recipient).
-- 2. Sign in every day: every new sign-in ends at the next 03:00 Phnom Penh time. Sessions already open are cut to the next 03:00 too.
-- 3. Telegram alerts: new columns on notifications (kind, module, ref, project, amount, due, title_km, body_km) and a new message layout.
--    Old app versions that do not fill the new columns still get today's message look. See docs/NOTIFICATIONS.md.

-- ================= 1. Announcements =================
create table if not exists public.announcements (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  title text,
  message text,
  importance text,          -- Normal | High
  audience jsonb,           -- who it was meant for, as chosen in the form, e.g. {"all":true} or {"groups":["SITE"],"projects":["p1"]}
  recipients jsonb,         -- the staff ids it was actually sent to (list)
  sent_by text,             -- staff id
  sent_at timestamptz,
  pin_until date,           -- shown at the top of the home screen until this date (Phnom Penh)
  status text               -- Draft | Sent | Withdrawn
);
alter table public.announcements add column if not exists title text;
alter table public.announcements add column if not exists message text;
alter table public.announcements add column if not exists importance text;
alter table public.announcements add column if not exists audience jsonb;
alter table public.announcements add column if not exists recipients jsonb;
alter table public.announcements add column if not exists sent_by text;
alter table public.announcements add column if not exists sent_at timestamptz;
alter table public.announcements add column if not exists pin_until date;
alter table public.announcements add column if not exists status text;
alter table public.announcements enable row level security;
drop policy if exists "demo open access" on public.announcements;
create policy "demo open access" on public.announcements for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.announcements to anon, authenticated;
create index if not exists announcements_sent_at on public.announcements (sent_at);

-- ================= 2. Sign in every day =================
-- The next 03:00 in Phnom Penh after p_at. Signing in at 01:30 -> 03:00 the same night; at 03:00 or 03:10 -> 03:00 the next day.
-- (Shift the clock back 3 hours, take the start of that day, add 1 day and 3 hours. Cambodia has no summer time.)
create or replace function private.gid_next_cutoff(p_at timestamptz default now()) returns timestamptz
language sql stable set search_path = public, private, extensions as $$
  select (date_trunc('day', (p_at at time zone 'Asia/Phnom_Penh') - interval '3 hours') + interval '1 day 3 hours') at time zone 'Asia/Phnom_Penh'
$$;
revoke all on function private.gid_next_cutoff(timestamptz) from public, anon, authenticated;

-- Same as update-v20.sql; only the expiry line changed (was now() + interval '30 days').
create or replace function public.gid_sign_in(p_login text, p_password text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare n record; a private.accounts%rowtype; st_left date; st_found boolean; tok text; exp timestamptz;
begin
  -- housekeeping: forget sessions that ended more than 7 days ago
  delete from private.sessions where expires_at < now() - interval '7 days';

  n := private.norm_login(p_login);
  if n.kind is not null then
    select * into a from private.accounts
    where (n.kind = 'phone' and login_phone = n.val) or (n.kind = 'email' and login_email = n.val)
    for update;
  end if;
  if a.id is null then
    perform crypt(coalesce(p_password, ''), gen_salt('bf', 10));   -- same time as a real check: do not reveal which logins exist
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'minutes', greatest(1, ceil(extract(epoch from (a.locked_until - now())) / 60)::int));
  end if;

  if crypt(coalesce(p_password, ''), a.pass_hash) <> a.pass_hash then
    if coalesce(a.failed_count, 0) + 1 >= 5 then
      update private.accounts set failed_count = 0, locked_until = now() + interval '15 minutes' where id = a.id;
    else
      update private.accounts set failed_count = coalesce(failed_count, 0) + 1 where id = a.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  -- password is right: clear the wrong-try counter, then check the status
  update private.accounts set failed_count = 0, locked_until = null where id = a.id;
  if a.status <> 'active' then return jsonb_build_object('ok', false, 'error', a.status); end if;
  select true, left_on into st_found, st_left from public.staff where id = a.staff_id;
  if st_found is null or st_left is not null then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;

  tok := encode(gen_random_bytes(32), 'hex');
  exp := private.gid_next_cutoff();   -- v23: everyone signs in again every day; the session ends at the next 03:00 Phnom Penh
  insert into private.sessions (token_hash, account_id, created_at, expires_at, last_seen, device_id)
  values (private.token_hash(tok), a.id, now(), exp, now(), nullif(left(btrim(coalesce(p_device, '')), 100), ''));
  update private.accounts set last_sign_in = now() where id = a.id;
  return jsonb_build_object('ok', true, 'token', tok, 'staff_id', a.staff_id, 'name', a.full_name,
    'must_change_password', coalesce(a.must_change_password, false), 'expires_at', exp);
end $$;
revoke all on function public.gid_sign_in(text, text, text) from public;
grant execute on function public.gid_sign_in(text, text, text) to anon, authenticated;

-- The rule applies from day one: sessions already open end at the next 03:00 as well (running this again changes nothing new).
update private.sessions set expires_at = least(expires_at, private.gid_next_cutoff())
where revoked_at is null and (expires_at is null or expires_at > private.gid_next_cutoff());

-- ================= 3. Clearer Telegram alerts =================
-- New optional columns. The app fills them; empty = the old message look. Meanings: docs/NOTIFICATIONS.md ("For developers").
alter table public.notifications add column if not exists kind text;      -- action | approved | rejected | reminder | announcement | info | welcome
alter table public.notifications add column if not exists module text;    -- requests, procurement, stock, daily, docs, projects, cost, finance, qaqc, safety, svr, vo, subs, handover, people, admin, schedule, announcements
alter table public.notifications add column if not exists ref text;       -- reference number, e.g. REQ-0012, PO-0007, VO-101-003
alter table public.notifications add column if not exists project text;   -- project number and name, e.g. "DEMO-101 · Tower A Office Fit-out" (a bare code or project id is completed from public.projects)
alter table public.notifications add column if not exists amount text;    -- ready-to-show amount, e.g. "$650"
alter table public.notifications add column if not exists due text;       -- ready-to-show date or time, e.g. "28 Nov 2026" or "28 Nov 2026 09:00-10:30"
alter table public.notifications add column if not exists title_km text;  -- Khmer title
alter table public.notifications add column if not exists body_km text;   -- Khmer detail line(s)
alter table public.staff add column if not exists staff_no text;          -- staff ID number shown on the badge (HR edits it)
-- give existing demo staff (ids s01…s40) their staff ID number, same as the app's demo data (GID-001…); never overwrites a number HR typed
update public.staff set staff_no = 'GID-' || lpad(substring(id from 2), 3, '0') where coalesce(btrim(staff_no), '') = '' and id ~ '^s[0-9]+$';
alter table public.notifications add column if not exists silent boolean;  -- true = in-app bell only, no Telegram (owner: drawing uploads, progress changes)

-- Cut a text to n characters (… at the end) before it is escaped, so an HTML entity is never cut in half.
create or replace function private.tg_cut(p text, n int) returns text
language sql immutable set search_path = public, private as $$
  select case when p is null then null when length(p) > n then rtrim(left(p, n - 1)) || '…' else p end
$$;
revoke all on function private.tg_cut(text, int) from public, anon, authenticated;

-- Module code (or a table name from older app versions) -> English and Khmer module name for the message header.
create or replace function private.tg_module(p_code text, p_tbl text, out code text, out en text, out km text)
language plpgsql immutable set search_path = public, private as $$
begin
  code := lower(btrim(coalesce(nullif(btrim(p_code), ''), case p_tbl
    when 'requests' then 'requests' when 'purchase_orders' then 'procurement' when 'suppliers' then 'procurement'
    when 'stock_moves' then 'stock' when 'stock_items' then 'stock' when 'stores' then 'stock'
    when 'daily_reports' then 'daily' when 'documents' then 'docs'
    when 'tasks' then 'projects' when 'projects' then 'projects' when 'project_members' then 'projects'
    when 'claims' then 'cost' when 'cost_lines' then 'cost' when 'monthly_costs' then 'cost' when 'invoices' then 'finance'
    when 'defects' then 'qaqc' when 'inspections' then 'qaqc' when 'safety' then 'safety' when 'site_visits' then 'svr'
    when 'variations' then 'vo' when 'subcontractors' then 'subs' when 'sub_contracts' then 'subs' when 'sub_payments' then 'subs'
    when 'tests' then 'handover' when 'handover_items' then 'handover' when 'warranties' then 'handover'
    when 'staff' then 'people' when 'accounts' then 'people' when 'welcome' then 'people' when 'app_settings' then 'admin'
    when 'events' then 'schedule' when 'holidays' then 'schedule' when 'announcements' then 'announcements'
    else '' end)));
  select x.en, x.km into en, km from (values
    ('requests', 'Requests', 'សំណើ'),
    ('procurement', 'Procurement', 'លទ្ធកម្ម'),
    ('stock', 'Stock', 'ស្តុក'),
    ('daily', 'Daily reports', 'របាយការណ៍ប្រចាំថ្ងៃ'),
    ('docs', 'Documents', 'ឯកសារ'),
    ('projects', 'Projects & Tasks', 'គម្រោង និងកិច្ចការ'),
    ('cost', 'Cost & Claims (IPC)', 'ចំណាយ និងការស្នើសុំទូទាត់ (IPC)'),
    ('finance', 'Finance', 'ហិរញ្ញវត្ថុ'),
    ('qaqc', 'QA/QC', 'ត្រួតពិនិត្យគុណភាព'),
    ('safety', 'Safety', 'សុវត្ថិភាព'),
    ('svr', 'Site visits', 'ចុះពិនិត្យទីតាំង'),
    ('vo', 'Variations (VO)', 'ការងារកែប្រែ (VO)'),
    ('subs', 'Subcontractors', 'អ្នកម៉ៅការបន្ត'),
    ('handover', 'Testing & Handover', 'តេស្ត និងប្រគល់ការងារ'),
    ('people', 'People', 'បុគ្គលិក'),
    ('admin', 'Settings', 'ការកំណត់'),
    ('schedule', 'Schedule & Meetings', 'កាលវិភាគ និងកិច្ចប្រជុំ'),
    ('announcements', 'Announcements', 'សេចក្តីជូនដំណឹង')
  ) as x (c, en, km) where x.c = code;
  if en is null then en := 'GID'; km := 'GID'; end if;
end $$;
revoke all on function private.tg_module(text, text) from public, anon, authenticated;

create or replace function public.notify_telegram() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  tok text; app text; chat text; actor text; msg text; body jsonb; rid bigint;
  nl constant text := E'\n';
  k text := lower(btrim(coalesce(new.kind, '')));
  md record; icon text; kind_en text; kind_km text;
  t text; t_km text; foot text; a_title text; a_msg text; a_imp text; full_len int; proj text;
begin
  if coalesce(new.silent, false) then return new; end if;  -- bell only
  select value into tok from private.settings where key = 'telegram_bot_token';
  if coalesce(btrim(tok), '') = '' or tok like 'PASTE%' then return new; end if;
  select telegram_chat_id into chat from public.staff where id = new.to_id;
  if coalesce(btrim(chat), '') = '' then return new; end if;
  select value into app from private.settings where key = 'app_url';
  select name into actor from public.staff where id = new.actor_id;
  foot := '<i>' || tg_esc(coalesce(actor, 'GID system')) || ' · '
      || to_char(coalesce(new.at, now()) at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI') || '</i>';

  if new.tbl = 'announcements' or k = 'announcement' then
    -- Announcement: the full message exactly as it was written (read from the announcement itself, not the shortened bell text)
    if new.tbl = 'announcements' then
      select title, message, importance into a_title, a_msg, a_imp from public.announcements where id = new.record_id;
    end if;
    a_title := coalesce(nullif(btrim(a_title), ''), new.title, '');
    a_msg := coalesce(nullif(a_msg, ''), new.body, '');
    full_len := length(a_msg);
    msg := case when lower(coalesce(a_imp, '')) in ('high', 'urgent', 'important')
                then '📢 <b>IMPORTANT ANNOUNCEMENT · សេចក្តីជូនដំណឹងសំខាន់</b>'
                else '📢 <b>ANNOUNCEMENT · សេចក្តីជូនដំណឹង</b>' end
      || nl || '<b>' || tg_esc(private.tg_cut(a_title, 250)) || '</b>'
      || case when a_msg <> '' then nl || nl || tg_esc(private.tg_cut(a_msg, 3300)) else '' end
      || case when full_len > 3300 then nl || '<i>Read the rest in GID / អានបន្តនៅក្នុង GID</i>' else '' end
      || nl || nl || foot;

  elsif new.tbl = 'welcome' and k in ('', 'welcome') then
    -- welcome message for a new staff member: sent exactly as HR wrote it
    msg := '🎉 <b>' || tg_esc(private.tg_cut(new.title, 250)) || '</b>' || nl || nl || tg_esc(private.tg_cut(coalesce(new.body, ''), 2200))
      || case when coalesce(new.title_km, '') <> '' or coalesce(new.body_km, '') <> '' then
           nl || nl || '<b>' || tg_esc(private.tg_cut(coalesce(new.title_km, ''), 200)) || '</b>'
           || case when coalesce(new.body_km, '') <> '' then nl || tg_esc(private.tg_cut(new.body_km, 1200)) else '' end
         else '' end;

  elsif k = '' then
    -- Older app version (no kind): today's look
    msg := '🔔 <b>' || tg_esc(private.tg_cut(new.title, 300)) || '</b>'
        || case when coalesce(new.body, '') <> '' then nl || tg_esc(private.tg_cut(new.body, 3000)) else '' end
        || nl || foot;

  else
    -- v23 layout: kind · module, title with reference, details, Khmer, footer
    select * into md from private.tg_module(new.module, new.tbl);
    select x.i, x.e, x.km into icon, kind_en, kind_km from (values
      ('action', '⚠️', 'ACTION NEEDED', 'អ្នកត្រូវចាត់ការ'),
      ('approved', '✅', 'APPROVED / DONE', 'បានអនុម័ត / រួចរាល់'),
      ('rejected', '❌', 'REJECTED / RETURNED', 'បានបដិសេធ / បញ្ជូនមកវិញ'),
      ('reminder', '📅', 'REMINDER', 'ការរំលឹក'),
      ('info', 'ℹ️', 'FOR YOUR INFORMATION', 'សម្រាប់ជាព័ត៌មាន'),
      ('welcome', '🎉', 'WELCOME', 'សូមស្វាគមន៍')
    ) as x (c, i, e, km) where x.c = k;
    if icon is null then icon := 'ℹ️'; kind_en := 'FOR YOUR INFORMATION'; kind_km := 'សម្រាប់ជាព័ត៌មាន'; end if;

    t := coalesce(nullif(btrim(new.title), ''), kind_en);
    t_km := nullif(btrim(coalesce(new.title_km, '')), '');
    if coalesce(btrim(new.ref), '') <> '' then
      if position(btrim(new.ref) in t) = 0 then t := btrim(new.ref) || ' · ' || t; end if;
      if t_km is not null and position(btrim(new.ref) in t_km) = 0 then t_km := btrim(new.ref) || ' · ' || t_km; end if;
    end if;

    -- Project: always number AND name ("DEMO-101 · Tower A Office Fit-out"). If the app sent only the code or the project id, add the name.
    proj := nullif(btrim(coalesce(new.project, '')), '');
    if proj is not null then
      select p.code || ' · ' || p.name into proj
      from public.projects p
      where (p.code = proj or p.id = proj) and coalesce(btrim(p.name), '') <> ''
      order by (p.code = proj) desc limit 1;
      if proj is null then proj := btrim(new.project); end if;
    end if;

    msg := icon || ' <b>' || tg_esc(kind_en) || ' · ' || tg_esc(md.en) || '</b>'
      || nl || '<b>' || tg_esc(private.tg_cut(t, 250)) || '</b>'
      || case when coalesce(btrim(new.body), '') <> '' then nl || tg_esc(private.tg_cut(btrim(new.body), 1200)) else '' end
      || case when proj is not null then nl || 'Project / គម្រោង: ' || tg_esc(private.tg_cut(proj, 150)) else '' end
      || case when coalesce(btrim(new.amount), '') <> '' then nl || 'Amount / ទឹកប្រាក់: <b>' || tg_esc(private.tg_cut(btrim(new.amount), 60)) || '</b>' else '' end
      || case when coalesce(btrim(new.due), '') <> '' then nl || 'Date / កាលបរិច្ឆេទ: ' || tg_esc(private.tg_cut(btrim(new.due), 80)) else '' end
      -- Khmer: always at least the kind and module in Khmer, then the Khmer title and text when the app sent them
      || nl || nl || tg_esc(kind_km) || ' · ' || tg_esc(md.km)
      || case when t_km is not null then nl || '<b>' || tg_esc(private.tg_cut(t_km, 250)) || '</b>' else '' end
      || case when coalesce(btrim(new.body_km), '') <> '' then nl || tg_esc(private.tg_cut(btrim(new.body_km), 1200)) else '' end
      || nl || nl || foot;
  end if;

  -- Telegram takes at most 4096 characters (counted after the <b>/<i> marks and &amp; are read). The cuts above keep every message
  -- under about 3,900, so nothing is cut here (cutting the finished text could break a <b> mark and Telegram would refuse it).
  body := jsonb_build_object('chat_id', btrim(chat), 'text', msg, 'parse_mode', 'HTML', 'disable_web_page_preview', true);
  if coalesce(btrim(app), '') like 'https://%' and new.tbl is not null and new.record_id is not null then
    body := body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
      jsonb_build_object('text', 'Open in GID / បើកក្នុង GID', 'url', rtrim(btrim(app), '/') || '/#open=' || new.tbl || ':' || new.record_id)))));
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

-- The sign-up alert to HR / System Admin / backup admin, now in the new layout (same as update-v20.sql otherwise).
create or replace function public.gid_sign_up(p_login text, p_password text, p_name text, p_note text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare n record; nm text := left(btrim(coalesce(p_name, '')), 100); acc uuid;
begin
  n := private.norm_login(p_login);
  if n.kind is null or nm = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_login', 'field', case when n.kind is null then 'login' else 'name' end);
  end if;
  if not private.pw_ok(p_password) then return jsonb_build_object('ok', false, 'error', 'weak_password'); end if;
  if exists (select 1 from private.accounts where (n.kind = 'phone' and login_phone = n.val) or (n.kind = 'email' and login_email = n.val)) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  begin
    insert into private.accounts (login_phone, login_email, full_name, pass_hash, note, status)
    values (case when n.kind = 'phone' then n.val end, case when n.kind = 'email' then n.val end,
            nm, crypt(p_password, gen_salt('bf', 10)), nullif(left(btrim(coalesce(p_note, '')), 500), ''), 'pending')
    returning id into acc;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end;
  -- Alert HR, System Admin and backup admin (bell + Telegram through the notify_telegram trigger)
  insert into public.notifications (to_id, actor_id, title, body, tbl, record_id, read, at, kind, module, title_km, body_km)
  select st.id, null, 'New account waiting for approval: ' || nm,
         'Signed up with ' || btrim(p_login) || coalesce(' · "' || nullif(left(btrim(coalesce(p_note, '')), 120), '') || '"', '')
           || '. Check who it is, link the staff profile and approve, or reject.',
         'accounts', acc::text, false, now(), 'action', 'people',
         'គណនីថ្មីរង់ចាំការអនុម័ត៖ ' || nm,
         'សូមពិនិត្យថាជានរណា ភ្ជាប់ទៅប្រវត្តិរូបបុគ្គលិក រួចអនុម័ត ឬបដិសេធ។'
  from public.staff st
  where st.left_on is null
    and (private.has_tag(st.tags, 'HR') or private.has_tag(st.tags, 'SYSADMIN') or private.has_tag(st.tags, 'BACKUPADMIN'));
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;
revoke all on function public.gid_sign_up(text, text, text, text) from public;
grant execute on function public.gid_sign_up(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================================
-- CHECKS for the lead (do NOT run as part of the update; each is one execute_sql call).
-- =====================================================================================================
-- A. The 03:00 rule (all four must be true):
/*
select private.gid_next_cutoff('2026-11-25 01:30+07') = '2026-11-25 03:00+07' as at_0130_same_night,
       private.gid_next_cutoff('2026-11-25 03:00+07') = '2026-11-26 03:00+07' as at_0300_next_day,
       private.gid_next_cutoff('2026-11-25 03:10+07') = '2026-11-26 03:00+07' as at_0310_next_day,
       private.gid_next_cutoff('2026-12-31 23:59+07') = '2027-01-01 03:00+07' as new_year,
       private.gid_next_cutoff() at time zone 'Asia/Phnom_Penh' as next_cutoff_phnom_penh;
*/
-- B. No open session lasts past the next 03:00 (should be 0):
/*
select count(*) as too_long from private.sessions where revoked_at is null and expires_at > private.gid_next_cutoff();
*/
-- C. A new sign-in ends at the next 03:00 Phnom Penh. Run the TEST block of update-v20.sql first (it leaves TEST accounts),
--    then this; expect ends_local = next 03:00 and pass = true. Then run the CLEANUP block of update-v20.sql.
/*
select s.created_at at time zone 'Asia/Phnom_Penh' as signed_in_local, s.expires_at at time zone 'Asia/Phnom_Penh' as ends_local,
       s.expires_at = private.gid_next_cutoff(s.created_at) as pass
from private.sessions s join private.accounts a on a.id = s.account_id
where a.full_name like 'TEST %' order by s.created_at desc limit 3;
*/
-- D. New columns and table exist:
/*
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notifications'
          and column_name in ('kind', 'module', 'ref', 'project', 'amount', 'due', 'title_km', 'body_km')) as new_note_columns,   -- 8
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'announcements') as announcement_columns,  -- 11
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'announcements') as announcement_policies;  -- 1
*/
