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
