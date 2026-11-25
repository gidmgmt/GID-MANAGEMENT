-- GID Management System - update for version 25: simple account commands for the owner to run in the Supabase SQL Editor.
-- Each one takes the phone number as people write it (012 345 678, +855 12 345 678) or an email, and answers in plain words.
-- Only the database owner can run them (SQL Editor); the app and the public key cannot. Safe to run twice; changes no data by itself.
--   select * from private.accounts_list();                       -- every account, its status, signed-in devices
--   select * from private.find_staff('sok');                     -- find a staff profile (id / staff number)
--   select private.kick_out('012 345 678');                      -- sign out on every device (can sign in again)
--   select private.block_account('012 345 678');                 -- switch off + sign out
--   select private.unblock_account('012 345 678');               -- switch back on
--   select private.approve_account('012 345 678', 'GID-007');    -- approve a waiting sign-up and link the staff profile
--   select private.add_account('012 345 678', 'Full Name', 'GID-007', 'Temp1234');  -- create an account yourself
--   select private.reset_password('012 345 678', 'Temp1234');    -- temporary password, must change; also unlocks

-- find the account that signs in with this phone/email
create or replace function private.acc_by_login(p_login text) returns uuid
language plpgsql stable set search_path = public, private, extensions as $$
declare n record; r uuid;
begin
  n := private.norm_login(p_login);
  if n.kind is null then return null; end if;
  select id into r from private.accounts where (n.kind = 'phone' and login_phone = n.val) or (n.kind = 'email' and login_email = n.val);
  return r;
end $$;

-- staff profile from its staff number (GID-007), id (s07) or a unique part of the name
create or replace function private.staff_by_key(p_key text) returns text
language plpgsql stable set search_path = public, private as $$
declare k text := btrim(coalesce(p_key, '')); r text; c int;
begin
  if k = '' then return null; end if;
  select id into r from public.staff where left_on is null and (upper(staff_no) = upper(k) or id = k) limit 1;
  if r is not null then return r; end if;
  select count(*), min(id) into c, r from public.staff where left_on is null and name ilike '%' || k || '%';
  return case when c = 1 then r else null end;
end $$;

create or replace function private.accounts_list()
returns table (name text, sign_in_with text, status text, staff_profile text, staff_number text, signed_up text, last_sign_in text, devices_signed_in int, locked text)
language sql stable set search_path = public, private as $$
  select a.full_name,
         coalesce('0' || substr(a.login_phone, 4), a.login_email, '0' || substr(a.old_login_phone, 4) || ' (released)', a.old_login_email || ' (released)'),
         case a.status when 'pending' then 'WAITING for approval' when 'active' then 'ACTIVE (can sign in)'
                       when 'rejected' then 'REJECTED' when 'disabled' then 'BLOCKED (switched off)' else a.status end,
         s.name, s.staff_no,
         to_char(a.created_at at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI'),
         coalesce(to_char(a.last_sign_in at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI'), 'never'),
         (select count(*)::int from private.sessions x where x.account_id = a.id and x.revoked_at is null and x.expires_at > now()),
         case when a.locked_until > now() then 'LOCKED until ' || to_char(a.locked_until at time zone 'Asia/Phnom_Penh', 'HH24:MI') else '' end
  from private.accounts a left join public.staff s on s.id = a.staff_id
  order by case a.status when 'pending' then 0 when 'active' then 1 else 2 end, a.created_at desc
$$;

create or replace function private.find_staff(p_name text)
returns table (staff_number text, staff_id text, name text, job_title text, has_account text)
language sql stable set search_path = public, private as $$
  select s.staff_no, s.id, s.name, s.title,
         case when exists (select 1 from private.accounts a where a.staff_id = s.id and a.status = 'active') then 'yes, active' else 'no' end
  from public.staff s
  where s.left_on is null and (s.name ilike '%' || btrim(coalesce(p_name, '')) || '%' or upper(coalesce(s.staff_no, '')) = upper(btrim(coalesce(p_name, ''))) or s.id = btrim(coalesce(p_name, '')))
  order by s.name
$$;

create or replace function private.kick_out(p_login text) returns text
language plpgsql set search_path = public, private as $$
declare a uuid := private.acc_by_login(p_login); nm text; n int;
begin
  if a is null then return 'NOT DONE: no account signs in with ' || coalesce(p_login, '') || '. Check the number with: select * from private.accounts_list();'; end if;
  select full_name into nm from private.accounts where id = a;
  update private.sessions set revoked_at = now() where account_id = a and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  return 'DONE: ' || nm || ' was signed out on ' || n || ' device(s). They can sign in again with their password.';
end $$;

create or replace function private.block_account(p_login text) returns text
language plpgsql set search_path = public, private as $$
declare a uuid := private.acc_by_login(p_login); nm text;
begin
  if a is null then return 'NOT DONE: no account signs in with ' || coalesce(p_login, '') || '.'; end if;
  update private.accounts set status = 'disabled', decided_by = 'owner (SQL Editor)', decided_at = now() where id = a returning full_name into nm;
  update private.sessions set revoked_at = now() where account_id = a and revoked_at is null;
  return 'DONE: ' || nm || ' is blocked and signed out everywhere. Undo with: select private.unblock_account(''' || p_login || ''');';
end $$;

create or replace function private.unblock_account(p_login text) returns text
language plpgsql set search_path = public, private as $$
declare a uuid := private.acc_by_login(p_login); r private.accounts%rowtype;
begin
  if a is null then return 'NOT DONE: no account signs in with ' || coalesce(p_login, '') || '.'; end if;
  select * into r from private.accounts where id = a;
  if r.staff_id is null then return 'NOT DONE: ' || r.full_name || ' is not linked to a staff profile yet. Use approve_account instead.'; end if;
  if exists (select 1 from public.staff where id = r.staff_id and left_on is not null) then
    return 'NOT DONE: ' || r.full_name || '''s staff profile was removed (left the company). Restore the profile in People first.'; end if;
  if exists (select 1 from private.accounts where staff_id = r.staff_id and status = 'active' and id <> a) then
    return 'NOT DONE: this staff profile already has another active account. Block that one first.'; end if;
  update private.accounts set status = 'active', decided_by = 'owner (SQL Editor)', decided_at = now(), failed_count = 0, locked_until = null where id = a;
  return 'DONE: ' || r.full_name || ' can sign in again.';
end $$;

create or replace function private.approve_account(p_login text, p_staff text) returns text
language plpgsql set search_path = public, private as $$
declare a uuid := private.acc_by_login(p_login); sid text := private.staff_by_key(p_staff); nm text; sn text;
begin
  if a is null then return 'NOT DONE: no account signs in with ' || coalesce(p_login, '') || '.'; end if;
  if sid is null then return 'NOT DONE: staff profile "' || coalesce(p_staff, '') || '" not found (or more than one match). Find it with: select * from private.find_staff(''name'');'; end if;
  if exists (select 1 from private.accounts where staff_id = sid and status = 'active' and id <> a) then
    return 'NOT DONE: this staff profile already has an active account. Block that one first.'; end if;
  update private.accounts set status = 'active', staff_id = sid, decided_by = 'owner (SQL Editor)', decided_at = now(), failed_count = 0, locked_until = null
  where id = a returning full_name into nm;
  select name into sn from public.staff where id = sid;
  return 'DONE: ' || nm || ' is approved and linked to the staff profile ' || sn || '. They can sign in now.';
end $$;

create or replace function private.add_account(p_login text, p_full_name text, p_staff text, p_temp_password text) returns text
language plpgsql set search_path = public, private, extensions as $$
declare n record; sid text := private.staff_by_key(p_staff); sn text;
begin
  n := private.norm_login(p_login);
  if n.kind is null then return 'NOT DONE: "' || coalesce(p_login, '') || '" is not a phone number (e.g. 012 345 678) or an email.'; end if;
  if coalesce(btrim(p_full_name), '') = '' then return 'NOT DONE: write the person''s full name.'; end if;
  if sid is null then return 'NOT DONE: staff profile "' || coalesce(p_staff, '') || '" not found (or more than one match). Find it with: select * from private.find_staff(''name'');'; end if;
  if not private.pw_ok(p_temp_password) then return 'NOT DONE: the temporary password needs at least 8 characters with letters and numbers.'; end if;
  perform private.gid_release_login(n.kind, n.val);
  if private.acc_by_login(p_login) is not null then return 'NOT DONE: ' || p_login || ' already has an account. See it with: select * from private.accounts_list();'; end if;
  if exists (select 1 from private.accounts where staff_id = sid and status = 'active') then
    return 'NOT DONE: this staff profile already has an active account. Block that one first.'; end if;
  insert into private.accounts (login_phone, login_email, full_name, pass_hash, staff_id, status, must_change_password, decided_by, decided_at)
  values (case when n.kind = 'phone' then n.val end, case when n.kind = 'email' then n.val end, btrim(p_full_name),
          crypt(p_temp_password, gen_salt('bf', 10)), sid, 'active', true, 'owner (SQL Editor)', now());
  select name into sn from public.staff where id = sid;
  return 'DONE: account created for ' || btrim(p_full_name) || ' (staff profile ' || sn || '). Give them the temporary password in person; the app will ask them to choose a new one.';
end $$;

create or replace function private.reset_password(p_login text, p_temp_password text) returns text
language plpgsql set search_path = public, private, extensions as $$
declare a uuid := private.acc_by_login(p_login); nm text;
begin
  if a is null then return 'NOT DONE: no account signs in with ' || coalesce(p_login, '') || '.'; end if;
  if not private.pw_ok(p_temp_password) then return 'NOT DONE: the temporary password needs at least 8 characters with letters and numbers.'; end if;
  update private.accounts set pass_hash = crypt(p_temp_password, gen_salt('bf', 10)), must_change_password = true, failed_count = 0, locked_until = null
  where id = a returning full_name into nm;
  update private.sessions set revoked_at = now() where account_id = a and revoked_at is null;
  return 'DONE: ' || nm || ' has a temporary password and is unlocked. Give it to them in person; the app will ask them to choose a new one.';
end $$;

-- owner only: the app (anon key) can never call these
revoke all on function private.acc_by_login(text), private.staff_by_key(text), private.accounts_list(), private.find_staff(text),
  private.kick_out(text), private.block_account(text), private.unblock_account(text), private.approve_account(text, text),
  private.add_account(text, text, text, text), private.reset_password(text, text) from public, anon, authenticated;
