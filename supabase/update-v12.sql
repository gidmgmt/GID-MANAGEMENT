-- GID Management System - update for version 12 (November 2026)
-- Safe to run on the live database: it adds the new columns and the server-time rule.
-- It does NOT delete any data or Telegram links. Paste everything into Supabase -> SQL Editor -> Run.

alter table public.daily_reports
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists loc_acc numeric,
  add column if not exists distance_m numeric,
  add column if not exists loc_status text,
  add column if not exists loc_note text,
  add column if not exists late boolean,
  add column if not exists late_minutes int;

alter table public.safety
  add column if not exists area text,
  add column if not exists evidence jsonb,
  add column if not exists close_evidence jsonb,
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz,
  add column if not exists correction text,
  add column if not exists injury text,
  add column if not exists people_involved text,
  add column if not exists likelihood int,
  add column if not exists consequence int,
  add column if not exists root_cause text,
  add column if not exists preventive text,
  add column if not exists lessons text;

alter table public.projects
  add column if not exists lat numeric,
  add column if not exists lng numeric;

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

-- Project Director becomes Project Manager
update public.staff set title = 'Project Manager', tags = '' where id = 's02' and tags = 'PD';

notify pgrst, 'reload schema';
