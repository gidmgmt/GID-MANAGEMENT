// Generates supabase/schema.sql from the table list in data.js, then appends the extra SQL files that are not table-driven (devices, v18+).
// Run from the repo root: node tools/gen-sql.js
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../data.js"), "utf8");
const sandbox = {};
new Function("globalThis", "window", src)(sandbox, undefined);
const { TABLES } = sandbox.GID;

let sql = `-- GID Management System - DEMO database
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- It is safe to run again: it drops and recreates the demo tables.
--
-- DEMO ONLY: the access rules at the bottom let anyone who has the app link read and change the data.
-- Use fake data only. The live Phase 1 system will use real staff logins and strict per-role rules.

`;
const names = Object.keys(TABLES);
for (const t of names.slice().reverse()) sql += `drop table if exists public.${t} cascade;\n`;
sql += "\n";
for (const t of names) {
  const cols = Object.entries(TABLES[t]).map(([c, ty]) => `  ${c} ${ty}`);
  sql += `create table public.${t} (\n  id text primary key default gen_random_uuid()::text,\n  created_at timestamptz not null default now(),\n${cols.join(",\n")}\n);\n\n`;
}
sql += `-- The USD 500 rule is also checked by the database, not only by the app:
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
`;
for (const t of names) {
  sql += `alter table public.${t} enable row level security;\n`;
  sql += `create policy "demo open access" on public.${t} for all to anon, authenticated using (true) with check (true);\n`;
}
sql += `\n-- Let the app reach these tables through the Supabase API.\ngrant usage on schema public to anon, authenticated;\ngrant select, insert, update, delete on all tables in schema public to anon, authenticated;\n`;
sql += `
-- File storage for photos and drawing PDFs (public bucket, DEMO ONLY)
insert into storage.buckets (id, name, public) values ('gid-demo-files', 'gid-demo-files', true) on conflict (id) do nothing;
drop policy if exists "demo files read" on storage.objects;
drop policy if exists "demo files upload" on storage.objects;
create policy "demo files read" on storage.objects for select to anon, authenticated using (bucket_id = 'gid-demo-files');
create policy "demo files upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'gid-demo-files');
`;
sql += `
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
    msg := '🎉 <b>' || tg_esc(new.title) || E'</b>\n\n' || tg_esc(coalesce(new.body, ''));
  else
  msg := '🔔 <b>' || tg_esc(new.title) || '</b>'
      || case when coalesce(new.body, '') <> '' then E'\n' || tg_esc(new.body) else '' end
      || E'\n<i>' || tg_esc(coalesce(actor, 'GID system')) || ' · '
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
`;
sql += `
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
`;
for (const extra of ["update-v18.sql", "update-v20.sql"]) sql += "\n" + fs.readFileSync(path.join(__dirname, "../supabase", extra), "utf8");
fs.writeFileSync(path.join(__dirname, "../supabase/schema.sql"), sql);
console.log("schema.sql written:", names.length, "tables");
