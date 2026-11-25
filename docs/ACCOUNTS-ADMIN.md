# Managing sign-in accounts directly in Supabase

Normal work: use the app, **People → Accounts** (approve, reject, reset password, disable, enable).
Use this page only as a backup, for example if nobody can sign in to the app.

**Where:** supabase.com → project → **SQL Editor** → New query → paste one block → **Run**.
**Where the data is:** table `private.accounts` (one row per person who signed up) and `private.sessions` (one row per device that is signed in).
Change the parts in CAPITALS before running. Phone numbers are stored as **855 + the number without the first 0** (012 345 678 → `85512345678`). Emails are stored in small letters.
Never delete rows: switch accounts off instead, so the history stays.

## 1. See every account and its status
```sql
select a.full_name,
       coalesce(a.login_phone, a.login_email, a.old_login_phone || ' (released)', a.old_login_email || ' (released)') as login,
       a.status,                                  -- pending = waiting for approval, active, rejected, disabled = switched off
       s.name as staff_profile, a.staff_id,
       to_char(a.created_at at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI') as signed_up,
       to_char(a.last_sign_in at time zone 'Asia/Phnom_Penh', 'DD Mon YYYY HH24:MI') as last_sign_in,
       (select count(*) from private.sessions x where x.account_id = a.id and x.revoked_at is null and x.expires_at > now()) as signed_in_devices,
       a.locked_until is not null and a.locked_until > now() as locked_5_wrong_passwords
from private.accounts a left join public.staff s on s.id = a.staff_id
order by a.created_at desc;
```
Only the people waiting for approval: add `where a.status = 'pending'` before `order by`.

## 2. Find a staff profile id (needed to approve or add)
```sql
select id, name, title, staff_no from public.staff where left_on is null and name ilike '%NAME%';
```

## 3. Kick someone out (sign them out on every device; they can sign in again)
```sql
update private.sessions set revoked_at = now()
where revoked_at is null and account_id in (select id from private.accounts where login_phone = '855XXXXXXXX');
```

## 4. Block someone (switch the account off and sign them out)
```sql
update private.accounts set status = 'disabled', decided_by = 'manual', decided_at = now() where login_phone = '855XXXXXXXX';
update private.sessions set revoked_at = now()
where revoked_at is null and account_id in (select id from private.accounts where login_phone = '855XXXXXXXX');
```
Switch it back on: `update private.accounts set status = 'active', decided_by = 'manual', decided_at = now() where login_phone = '855XXXXXXXX';`

## 5. Approve someone who is waiting, and link them to their staff profile
```sql
update private.accounts set status = 'active', staff_id = 'STAFF_ID', decided_by = 'manual', decided_at = now()
where login_phone = '855XXXXXXXX' and status = 'pending';
```
One staff profile can have only one active account. If it says "duplicate key", that profile already has an active account: block that one first (step 4).

## 6. Add an account yourself (with a temporary password they must change)
Password: at least 8 characters with letters and numbers. Give it to the person face to face; the app makes them choose a new one.
```sql
insert into private.accounts (login_phone, full_name, pass_hash, staff_id, status, must_change_password, decided_by, decided_at)
values ('855XXXXXXXX', 'FULL NAME', extensions.crypt('TEMP-PASSWORD-1', extensions.gen_salt('bf', 10)), 'STAFF_ID', 'active', true, 'manual', now());
```
For an email login, use `login_email` instead of `login_phone` (small letters).

## 7. Reset a forgotten password (temporary password, must change) and unlock
```sql
update private.accounts set pass_hash = extensions.crypt('TEMP-PASSWORD-1', extensions.gen_salt('bf', 10)),
  must_change_password = true, failed_count = 0, locked_until = null
where login_phone = '855XXXXXXXX';
```
Only unlock after 5 wrong passwords: `update private.accounts set failed_count = 0, locked_until = null where login_phone = '855XXXXXXXX';`

## Good to know
- Removing a staff member in People switches their account off automatically and signs them out.
- If that phone number signs up again, the new sign-up waits for approval; the old account keeps the number as history ("released").
- Everyone is signed out every day at 03:00 Phnom Penh time.
- Do not paste passwords anywhere else (chat, files); the database keeps only a scrambled copy.
