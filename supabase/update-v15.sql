-- GID Management System - update for version 15: staff details (add/remove staff) and the Telegram welcome message. Safe to run; keeps all data.
alter table public.staff
  add column if not exists short_name text,
  add column if not exists telegram_user text,
  add column if not exists start_date date,
  add column if not exists desk text,
  add column if not exists photo text,
  add column if not exists left_on date;

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

notify pgrst, 'reload schema';
