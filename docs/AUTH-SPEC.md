# Sign in / Sign up (version 20): agreed design

Decided by Jack (owner):
- Staff sign in with **phone number OR email**, plus a password.
- Anyone can **sign up**, but they get **no access until HR or the System Admin approves** them and links the account to a staff profile (which sets their role).
- The **demo passkey stays** as a second way in (for the demo period). With the passkey you keep today's "switch person" demo behaviour.

## Why our own accounts (not Supabase Auth)
Supabase Auth needs a working email/SMS sender for sign-up confirmation, and phone sign-in needs an SMS provider (cost). Our accounts live in the database, passwords are hashed with bcrypt (pgcrypto `crypt(pw, gen_salt('bf', 10))`), and everything goes through `security definer` functions. The account tables are in the **private** schema: the public anon key can never read them. A later step can make row-level security check the session token (sent as header `x-gid-session`).

## Database (file `supabase/update-v20.sql`, owner: gid-database-dev)
Tables in schema `private` (no grants to anon/authenticated):
- `private.accounts`: id uuid pk default gen_random_uuid(); login_phone text unique (normalised, see below); login_email text unique (lower-case); full_name text not null; pass_hash text not null; staff_id text (→ public.staff.id, null until approved); status text not null default 'pending' (pending | active | rejected | disabled); note text (what the person wrote at sign-up); created_at timestamptz default now(); decided_by text; decided_at timestamptz; last_sign_in timestamptz; failed_count int default 0; locked_until timestamptz; must_change_password bool default false.
  - Check: at least one of login_phone / login_email is set.
- `private.sessions`: token_hash text pk (sha256 hex of the token); account_id uuid → accounts on delete cascade; created_at default now(); expires_at timestamptz; last_seen timestamptz; device_id text; revoked_at timestamptz.

Normalising the login (one helper `private.norm_login(text) returns record/kind`):
- contains "@" → email: lower(trim()).
- else phone: keep digits only; leading "0" → replace with "855"; leading "855" kept; "+855" → "855". Result must be 11–12 digits, otherwise invalid.
- Staff phones in `public.staff.phone` are stored like "012 345 678" or "+855 12 345 678": normalise them the same way when matching.

Functions in `public` (`security definer`, `set search_path = public, private, extensions`), `grant execute … to anon, authenticated`, `revoke … from public`. All return `jsonb`. Errors are returned as `{"ok":false,"error":"<code>"}` (never raise for user mistakes) so the app can show friendly text. Error codes: `invalid_login`, `weak_password`, `exists`, `wrong`, `pending`, `rejected`, `disabled`, `locked`, `no_session`, `not_allowed`, `not_found`.
1. `gid_sign_up(p_login text, p_password text, p_name text, p_note text)`: password ≥ 8 chars with a letter and a digit (`weak_password`); login valid; not already used (`exists`). Inserts a pending account. Suggests a matching staff profile (same normalised phone/email in public.staff) but does NOT activate. Inserts one row in `public.notifications` for every current staff member (left_on is null) whose tags include HR, SYSADMIN or BACKUPADMIN: title "New sign-up waiting for approval", body "<name> · <login>", tbl 'accounts', record_id = account id, actor_id null (the Telegram trigger then alerts them). Returns `{"ok":true,"status":"pending"}`.
2. `gid_sign_in(p_login text, p_password text, p_device text)`: if locked_until > now() → `locked` (+ `"minutes"`). Wrong password → failed_count+1; at 5 → locked_until = now()+15 min, failed_count=0 → `wrong`. Unknown login also returns `wrong` (do not reveal which logins exist; still spend time on crypt to avoid timing differences). Status pending/rejected/disabled → that code (only after the password is correct). Staff profile has left_on set → `disabled`. Success: failed_count=0, last_sign_in=now(); token = encode(gen_random_bytes(32),'hex'); store sha256 hash; expires_at = now()+30 days. Returns `{"ok":true,"token":…,"staff_id":…,"name":…,"must_change_password":…,"expires_at":…}`.
3. `gid_session(p_token text)`: valid (not revoked, not expired, account active, staff not left) → updates last_seen, returns `{"ok":true,"staff_id","name","account_id","login","must_change_password"}`; else `no_session`.
4. `gid_sign_out(p_token text)`: sets revoked_at. Returns ok.
5. `gid_change_password(p_token, p_old, p_new)`: checks old, weak check, sets hash, must_change_password=false, revokes the account's other sessions.
6. Approvers = the session's staff has tag HR, SYSADMIN, BACKUPADMIN or MD. Otherwise `not_allowed`.
   - `gid_accounts(p_token)`: returns `{"ok":true,"accounts":[…]}` with id, full_name, login_phone, login_email, status, staff_id, note, created_at, decided_by, decided_at, last_sign_in, suggested_staff_id. Never the hash.
   - `gid_decide_account(p_token, p_account_id, p_action, p_staff_id)`: p_action approve | reject | disable | enable. Approve requires p_staff_id of an existing, current staff member that no other active account uses (`exists`). Sets decided_by/at. Disable also revokes sessions. Inserts an activity-log row in public.audit_log (actor_id, action 'Account approved'/…, tbl 'accounts', record_id, summary). Returns ok.
   - `gid_reset_password(p_token, p_account_id)`: generates a temporary password (10 chars, letters+digits, no 0/O/1/l), sets it with must_change_password=true, revokes sessions, returns `{"ok":true,"temp_password":…}` once (shown to the admin to pass on in person).
7. Housekeeping inside sign-in: delete sessions expired more than 7 days ago.

Also: `notify pgrst, 'reload schema';` at the end. The file must be safe to run twice.

## App (owner: gid-frontend-dev): index.html, app.js, styles.css
Sign-in screen (replaces today's passkey screen; same look, logo, particle intro stays):
- Three tabs at the top: **Sign in** (default) · **Create account** · **Demo passkey**.
- Sign in: "Phone number or email", "Password" (Show button), "Remember this device" (checked), button **Sign in**. Errors in plain words: wrong → "Wrong phone/email or password."; pending → "Your account is waiting for approval by HR or the System Admin."; rejected/disabled → "This account cannot sign in. Ask HR."; locked → "Too many wrong tries. Try again in N minutes."
- Create account: Full name, Phone number or email, Password, Confirm password, "Your job / team (so HR can find you)". Button **Create account**. Success → "Request sent. You can sign in after HR or the System Admin approves you." Password rule shown under the box: "At least 8 characters, with a letter and a number."
- Demo passkey: today's passkey form unchanged (hash check), note "Demo only: you can switch between sample people."
- **Local mode** (no Supabase in config.js): Sign in and Create account tabs show "Sign in needs the shared database. Use the demo passkey." and the Demo passkey tab is selected.
- Session: token saved in localStorage `gid-session` (or sessionStorage when "Remember" is off). On load: if a token exists, call `gid_session`; ok → open the app as that staff member; else drop it and show the sign-in screen. The supabase client is created in app.js, so do the check where Store is ready (index.html can expose `window.GID_AUTH = { mode: "account"|"passkey", token, staff_id }` once decided).
- Signed in with an account: `state.user` is fixed to the account's staff_id; the **switch-person picker is hidden** and "switch person" UI/actions refuse. The header shows the person's own photo/name; the menu gets **Change password** and **Sign out** (sign out calls gid_sign_out, clears the token, reloads to the sign-in screen). If `must_change_password` → show the change-password form first and do not open the app until done.
- Passkey mode: behaves exactly as today (switch person works), with a small "Demo mode" chip in the header.
- Every 5 minutes and when the app comes back to the screen, re-check `gid_session`; `no_session` → back to sign-in with "You were signed out. Please sign in again."
- Devices (Settings → Devices) "Sign out" must also end account sessions on that device: when the device is kicked, call gid_sign_out with the stored token before locking.
- **People → Accounts** tab (visible to HR, System Admin, backup admin, MD): sections "Waiting for approval" (name, login, note, signed up when, suggested staff profile) with **Approve** (choose staff profile; pre-select the suggestion) and **Reject**; "Active accounts" with **Disable**, **Reset password** (shows the temporary password once with a Copy button and the text "Give this to the person in person. They must change it when they sign in."); "Disabled / rejected" with **Enable**. In local mode the tab shows "Accounts need the shared database."
- Bell alerts for tbl 'accounts' open People → Accounts.
- Every new English text needs Khmer in i18n-km.js (gid-khmer-ux may do this afterwards).

## Tests (owner: gid-qa-tester)
- Local mode: sign-in screen shows passkey tab, passkey still works, nothing else changed (run tests/smoke.py and tests/workflows.py).
- Account mode: mock the Supabase REST RPC endpoints (`/rest/v1/rpc/gid_*`) in Playwright to test every screen state: sign in ok/wrong/pending/locked, sign up ok/weak/exists, must change password, sign out, session expired, switch-person hidden, Accounts tab approve/reject/disable/reset, as allowed and not-allowed roles, desktop + phone, English + Khmer.
- Database: the lead runs SQL checks on the live project for each function (create test accounts named "TEST …", then delete them).
