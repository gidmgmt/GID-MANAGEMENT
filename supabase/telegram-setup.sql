-- GID demo: turn on Telegram alerts (run once, after schema.sql)
-- 1. Replace the three values between the quotes below.
-- 2. Paste this file into Supabase: SQL Editor > New query > Run.
-- Running it again with new values updates them. The token stays private: the app cannot read it.

insert into private.settings (key, value) values
  ('telegram_bot_token', '9226849374:AAH6Y2ytzRgpNzJSbPe9q-1wxWL-oNDWVBc'),   -- looks like 7712345678:AAH...
  ('bot_username',       'GID_management_system_bot'),              -- the bot's username, without @
  ('app_url',            'https://gid-management.netlify.app')       -- the demo link, for the "Open in GID" button
on conflict (key) do update set value = excluded.value;

-- Check: should show ready = true
select public.telegram_status();
