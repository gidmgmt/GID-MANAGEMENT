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
