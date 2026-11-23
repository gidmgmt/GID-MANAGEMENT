-- GID Management System - update for version 13
-- Safe to run on the live database: adds the QA/QC photo, correction and PDF columns. Keeps all data.
alter table public.defects
  add column if not exists discipline text,
  add column if not exists priority text,
  add column if not exists evidence jsonb,
  add column if not exists close_evidence jsonb,
  add column if not exists correction text,
  add column if not exists fixed_by text,
  add column if not exists fixed_at timestamptz,
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz,
  add column if not exists verify_note text,
  add column if not exists inspection_id text;
alter table public.inspections
  add column if not exists evidence jsonb,
  add column if not exists result_evidence jsonb,
  add column if not exists result_note text,
  add column if not exists checked_at timestamptz;
notify pgrst, 'reload schema';
