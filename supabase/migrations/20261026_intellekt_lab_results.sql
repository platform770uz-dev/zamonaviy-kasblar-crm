create table public.intellekt_lab_results (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  child_name text not null default '' check (char_length(child_name) <= 50),
  age_group text not null check (age_group in ('7-10', '11-14')),
  answers jsonb not null check (
    jsonb_typeof(answers) = 'array'
    and jsonb_array_length(answers) = 30
    and pg_column_size(answers) <= 30000
  ),
  logic_score smallint not null check (logic_score between 0 and 10),
  critical_score smallint not null check (critical_score between 0 and 10),
  consent_version text not null check (consent_version = 'intellekt-lab-crm-v1'),
  consent_text text not null check (char_length(consent_text) between 1 and 1000),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.intellekt_lab_results enable row level security;

revoke all on table public.intellekt_lab_results from anon, authenticated;
grant select on table public.intellekt_lab_results to authenticated;
grant insert, select on table public.intellekt_lab_results to service_role;

create policy intellekt_lab_results_manager_read
  on public.intellekt_lab_results
  for select
  to authenticated
  using (public.crm_is_manager());

create index intellekt_lab_results_created_at_idx
  on public.intellekt_lab_results (created_at desc);
