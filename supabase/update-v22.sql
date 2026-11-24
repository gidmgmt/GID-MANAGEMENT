-- GID Management System - update for version 22: Schedule & Meetings, and Cambodia public holidays. Safe to run twice; keeps all data.
-- events: meetings, inspections, site visits, claim dates… (attendees = jsonb list of staff ids). holidays: official public holidays (HR keeps them up to date).

create table if not exists public.events (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  no text,
  title text,
  type text,
  date date,
  start_time text,
  end_time text,
  all_day boolean,
  project_id text,
  location text,
  organiser_id text,
  attendees jsonb,
  notes text,
  minutes text,
  status text,
  link_module text,
  link_id text,
  created_by text,
  updated_at timestamptz
);
alter table public.events add column if not exists no text;
alter table public.events add column if not exists title text;
alter table public.events add column if not exists type text;
alter table public.events add column if not exists date date;
alter table public.events add column if not exists start_time text;
alter table public.events add column if not exists end_time text;
alter table public.events add column if not exists all_day boolean;
alter table public.events add column if not exists project_id text;
alter table public.events add column if not exists location text;
alter table public.events add column if not exists organiser_id text;
alter table public.events add column if not exists attendees jsonb;
alter table public.events add column if not exists notes text;
alter table public.events add column if not exists minutes text;
alter table public.events add column if not exists status text;
alter table public.events add column if not exists link_module text;
alter table public.events add column if not exists link_id text;
alter table public.events add column if not exists created_by text;
alter table public.events add column if not exists updated_at timestamptz;
alter table public.events enable row level security;
drop policy if exists "demo open access" on public.events;
create policy "demo open access" on public.events for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.events to anon, authenticated;

create table if not exists public.holidays (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date,
  name text,
  name_km text,
  year int
);
alter table public.holidays add column if not exists date date;
alter table public.holidays add column if not exists name text;
alter table public.holidays add column if not exists name_km text;
alter table public.holidays add column if not exists year int;
alter table public.holidays enable row level security;
drop policy if exists "demo open access" on public.holidays;
create policy "demo open access" on public.holidays for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.holidays to anon, authenticated;

create index if not exists events_date on public.events (date);
create index if not exists holidays_date on public.holidays (date);

-- Official public holidays 2026 (Sub-Decree 167) and 2027 (sub-decree of 16 Sep 2026; lunar dates "to be confirmed" may move)
insert into public.holidays (id, date, name, name_km, year) values
  ('hol-2026-01-01', '2026-01-01', 'International New Year Day', 'ទិវាចូលឆ្នាំសកល', 2026),
  ('hol-2026-01-07', '2026-01-07', 'Victory over Genocide Day', 'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍', 2026),
  ('hol-2026-03-08', '2026-03-08', 'International Women''s Day', 'ទិវាសិទ្ធិនារីអន្តរជាតិ', 2026),
  ('hol-2026-04-14', '2026-04-14', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2026),
  ('hol-2026-04-15', '2026-04-15', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2026),
  ('hol-2026-04-16', '2026-04-16', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2026),
  ('hol-2026-05-01', '2026-05-01', 'International Labour Day and Visak Bochea Day', 'ទិវាពលកម្មអន្តរជាតិ និងពិធីបុណ្យវិសាខបូជា', 2026),
  ('hol-2026-05-05', '2026-05-05', 'Royal Ploughing Ceremony', 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល', 2026),
  ('hol-2026-05-14', '2026-05-14', 'King Norodom Sihamoni''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2026),
  ('hol-2026-06-18', '2026-06-18', 'Queen Mother Norodom Monineath Sihanouk''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម សម្តេចព្រះមហាក្សត្រី នរោត្តម មុនិនាថ សីហនុ', 2026),
  ('hol-2026-09-24', '2026-09-24', 'Constitution Day', 'ទិវារដ្ឋធម្មនុញ្ញ', 2026),
  ('hol-2026-10-10', '2026-10-10', 'Pchum Ben', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ', 2026),
  ('hol-2026-10-11', '2026-10-11', 'Pchum Ben', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ', 2026),
  ('hol-2026-10-12', '2026-10-12', 'Pchum Ben', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ', 2026),
  ('hol-2026-10-15', '2026-10-15', 'Commemoration Day of the late King Father Norodom Sihanouk', 'ទិវាប្រារព្ធពិធីគោរពព្រះវិញ្ញាណក្ខន្ធ ព្រះករុណា ព្រះបាទសម្តេចព្រះ នរោត្តម សីហនុ ព្រះវររាជបិតា', 2026),
  ('hol-2026-10-29', '2026-10-29', 'King Norodom Sihamoni''s Coronation Day', 'ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2026),
  ('hol-2026-11-09', '2026-11-09', 'Independence Day', 'ទិវាឯករាជ្យជាតិ', 2026),
  ('hol-2026-11-23', '2026-11-23', 'Water Festival', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក', 2026),
  ('hol-2026-11-24', '2026-11-24', 'Water Festival', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក', 2026),
  ('hol-2026-11-25', '2026-11-25', 'Water Festival', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក', 2026),
  ('hol-2026-12-29', '2026-12-29', 'Peace Day in Cambodia', 'ទិវាសន្តិភាពនៅកម្ពុជា', 2026),
  ('hol-2027-01-01', '2027-01-01', 'International New Year Day', 'ទិវាចូលឆ្នាំសកល', 2027),
  ('hol-2027-01-07', '2027-01-07', 'Victory over Genocide Day', 'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍', 2027),
  ('hol-2027-03-08', '2027-03-08', 'International Women''s Day', 'ទិវាសិទ្ធិនារីអន្តរជាតិ', 2027),
  ('hol-2027-04-14', '2027-04-14', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2027),
  ('hol-2027-04-15', '2027-04-15', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2027),
  ('hol-2027-04-16', '2027-04-16', 'Khmer New Year', 'ពិធីបុណ្យចូលឆ្នាំខ្មែរ', 2027),
  ('hol-2027-05-01', '2027-05-01', 'International Labour Day', 'ទិវាពលកម្មអន្តរជាតិ', 2027),
  ('hol-2027-05-14', '2027-05-14', 'King Norodom Sihamoni''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2027),
  ('hol-2027-05-20', '2027-05-20', 'Visak Bochea Day (to be confirmed)', 'ពិធីបុណ្យវិសាខបូជា (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-05-24', '2027-05-24', 'Royal Ploughing Ceremony (to be confirmed)', 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-06-18', '2027-06-18', 'Queen Mother Norodom Monineath Sihanouk''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម សម្តេចព្រះមហាក្សត្រី នរោត្តម មុនិនាថ សីហនុ', 2027),
  ('hol-2027-09-24', '2027-09-24', 'Constitution Day', 'ទិវារដ្ឋធម្មនុញ្ញ', 2027),
  ('hol-2027-09-29', '2027-09-29', 'Pchum Ben (to be confirmed)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-09-30', '2027-09-30', 'Pchum Ben (to be confirmed)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-10-01', '2027-10-01', 'Pchum Ben (to be confirmed)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-10-15', '2027-10-15', 'Commemoration Day of the late King Father Norodom Sihanouk', 'ទិវាប្រារព្ធពិធីគោរពព្រះវិញ្ញាណក្ខន្ធ ព្រះករុណា ព្រះបាទសម្តេចព្រះ នរោត្តម សីហនុ ព្រះវររាជបិតា', 2027),
  ('hol-2027-10-29', '2027-10-29', 'King Norodom Sihamoni''s Coronation Day', 'ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ ព្រះករុណា ព្រះបាទ នរោត្តម សីហមុនី', 2027),
  ('hol-2027-11-09', '2027-11-09', 'Independence Day', 'ទិវាឯករាជ្យជាតិ', 2027),
  ('hol-2027-11-12', '2027-11-12', 'Water Festival (to be confirmed)', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-11-13', '2027-11-13', 'Water Festival (to be confirmed)', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-11-14', '2027-11-14', 'Water Festival (to be confirmed)', 'បុណ្យអុំទូក បណ្តែតប្រទីប និងសំពះព្រះខែ អកអំបុក (រង់ចាំបញ្ជាក់)', 2027),
  ('hol-2027-12-29', '2027-12-29', 'Peace Day in Cambodia', 'ទិវាសន្តិភាពនៅកម្ពុជា', 2027)
on conflict (id) do nothing;
