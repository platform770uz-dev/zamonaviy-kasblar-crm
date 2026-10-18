-- New table for results that a parent explicitly chooses to send.
-- The public Mini App has no direct table access; a separate Edge Function inserts rows.
create table if not exists public.yba_public_intro_results (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  child_name text not null check (char_length(child_name) between 1 and 24),
  age_group text not null check (age_group in ('7-10','11-14')),
  interests text[] not null default '{}',
  blog_styles text[] not null default '{}',
  progress smallint not null check (progress = 4),
  consent_version text not null,
  consent_text text not null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.yba_public_intro_results enable row level security;
revoke all on public.yba_public_intro_results from anon, authenticated;
grant select on public.yba_public_intro_results to authenticated;
grant all on public.yba_public_intro_results to service_role;

drop policy if exists yba_public_intro_results_manager_read on public.yba_public_intro_results;
create policy yba_public_intro_results_manager_read
  on public.yba_public_intro_results for select to authenticated
  using (public.crm_is_manager());

create index if not exists yba_public_intro_results_created_idx
  on public.yba_public_intro_results(created_at desc);

