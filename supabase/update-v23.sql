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
    ('svr', 'Site visits', 'ការចុះពិនិត្យទីតាំង'),
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
      || case when full_len > 3300 then nl || '<i>Read the rest in GID / អានបន្តក្នុង GID</i>' else '' end
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
      ('action', '⚠️', 'ACTION NEEDED', 'រង់ចាំអ្នកចាត់ការ'),
      ('approved', '✅', 'APPROVED / DONE', 'បានអនុម័ត / រួចរាល់'),
      ('rejected', '❌', 'REJECTED / RETURNED', 'បានបដិសេធ / បញ្ជូនត្រឡប់'),
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
         'គណនីថ្មីរង់ចាំការអនុម័ត: ' || nm,
         'សូមពិនិត្យ ភ្ជាប់ទៅប្រវត្តិរូបបុគ្គលិក រួចអនុម័ត ឬបដិសេធ។'
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
