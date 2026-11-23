-- GID Management System - update for version 14: project scopes and progress by scope. Safe to run; keeps all data.
alter table public.projects add column if not exists scopes jsonb;
notify pgrst, 'reload schema';
