-- GID Management System - update for version 24: a phone number or email can sign up again after the staff member left
-- or the account was rejected / disabled. Safe to run twice; keeps all data (the old login is kept in old_login_phone / old_login_email).
-- 1. When HR removes a staff member (left_on is set), their account is disabled at once and their sign-ins end.
-- 2. When someone signs up with a phone/email that belongs to a disabled or rejected account (or to someone who left),
--    the old account gives up that login (kept as history) and the new sign-up goes ahead to HR for approval as usual.
--    A login that is waiting for approval or in use by a current staff member still says "already has an account".

alter table private.accounts add column if not exists old_login_phone text;
alter table private.accounts add column if not exists old_login_email text;
alter table private.accounts add column if not exists released_at timestamptz;
-- an account must still have a login, or (once released) its old login kept as history
alter table private.accounts drop constraint if exists accounts_login_set;
alter table private.accounts add constraint accounts_login_set check (login_phone is not null or login_email is not null
  or (released_at is not null and (old_login_phone is not null or old_login_email is not null)));

-- Free a login held by an account that can no longer be used. Returns how many accounts gave it up.
create or replace function private.gid_release_login(p_kind text, p_val text) returns int
language plpgsql security definer set search_path = public, private as $$
declare n int;
begin
  if p_kind is null or coalesce(p_val, '') = '' then return 0; end if;
  with gone as (
    update private.accounts a set
      old_login_phone = coalesce(a.login_phone, a.old_login_phone),
      old_login_email = coalesce(a.login_email, a.old_login_email),
      login_phone = case when p_kind = 'phone' then null else a.login_phone end,
      login_email = case when p_kind = 'email' then null else a.login_email end,
      status = case when a.status in ('active', 'pending') then 'disabled' else a.status end,
      released_at = now()
    where ((p_kind = 'phone' and a.login_phone = p_val) or (p_kind = 'email' and a.login_email = p_val))
      and (a.status in ('rejected', 'disabled')
           or exists (select 1 from public.staff s where s.id = a.staff_id and s.left_on is not null))
    returning a.id)
  select count(*) into n from gone;
  update private.sessions set revoked_at = now()
  where revoked_at is null and account_id in (select id from private.accounts where released_at is not null and login_phone is null and login_email is null);
  return n;
end $$;
revoke all on function private.gid_release_login(text, text) from public, anon, authenticated;

-- 1. Staff member removed -> account disabled, sign-ins ended (history kept)
create or replace function private.staff_left_account() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.left_on is not null and old.left_on is null then
    update private.accounts set status = 'disabled', decided_by = 'left company', decided_at = now()
    where staff_id = new.id and status in ('active', 'pending');
    update private.sessions set revoked_at = now()
    where revoked_at is null and account_id in (select id from private.accounts where staff_id = new.id);
  end if;
  return new;
end $$;
revoke all on function private.staff_left_account() from public, anon, authenticated;
drop trigger if exists staff_left_account on public.staff;
create trigger staff_left_account after update of left_on on public.staff
  for each row execute function private.staff_left_account();

-- Staff who already left before this update: disable their accounts now
update private.accounts a set status = 'disabled', decided_by = 'left company', decided_at = now()
where a.status in ('active', 'pending') and exists (select 1 from public.staff s where s.id = a.staff_id and s.left_on is not null);
update private.sessions set revoked_at = now()
where revoked_at is null and account_id in (select id from private.accounts where status = 'disabled');

-- 2. Sign-up: same as update-v23.sql, plus "free the login from an old unusable account first"
create or replace function public.gid_sign_up(p_login text, p_password text, p_name text, p_note text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare n record; nm text := left(btrim(coalesce(p_name, '')), 100); acc uuid;
begin
  n := private.norm_login(p_login);
  if n.kind is null or nm = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_login', 'field', case when n.kind is null then 'login' else 'name' end);
  end if;
  if not private.pw_ok(p_password) then return jsonb_build_object('ok', false, 'error', 'weak_password'); end if;
  perform private.gid_release_login(n.kind, n.val);   -- v24: a login of someone who left / a rejected or disabled account can be used again
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

-- Accounts list for HR / admins: same as update-v20.sql, plus the released (old) login
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
      'old_login_phone', a.old_login_phone, 'old_login_email', a.old_login_email, 'released_at', a.released_at,
      'status', a.status, 'staff_id', a.staff_id, 'note', a.note, 'created_at', a.created_at,
      'decided_by', a.decided_by, 'decided_at', a.decided_at, 'last_sign_in', a.last_sign_in,
      'suggested_staff_id', case when a.status = 'pending' then private.suggest_staff(a.login_phone, a.login_email) end)
      order by a.created_at desc)
    from private.accounts a), '[]'::jsonb));
end $$;
revoke all on function public.gid_accounts(text) from public;
grant execute on function public.gid_accounts(text) to anon, authenticated;

-- An account whose login was given to a new sign-up cannot be enabled again (it has no phone/email to sign in with)
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
  if a.id = private.session_account(p_token) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if act in ('approve', 'enable') and a.login_phone is null and a.login_email is null then
    return jsonb_build_object('ok', false, 'error', 'released');   -- v24
  end if;

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
    new_status := 'pending';
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
          a.full_name || ' · ' || coalesce(a.login_phone, a.login_email, a.old_login_phone, a.old_login_email)
          || case when new_status = 'active' then ' → staff ' || coalesce(sid, a.staff_id) else '' end);
  return jsonb_build_object('ok', true, 'status', new_status);
end $$;
revoke all on function public.gid_decide_account(text, text, text, text) from public;
grant execute on function public.gid_decide_account(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
