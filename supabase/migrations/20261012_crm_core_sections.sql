-- Core CRM sections. Apply through Supabase SQL editor after reviewing the role policy.
create table if not exists public.crm_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.crm_members enable row level security;
drop policy if exists crm_members_select_self_or_manager on public.crm_members;
create policy crm_members_select_self_or_manager on public.crm_members for select to authenticated
  using (user_id = auth.uid() or private.is_crm_owner());
drop policy if exists crm_members_manage_owner on public.crm_members;
create policy crm_members_manage_owner on public.crm_members for all to authenticated
  using (private.is_crm_owner()) with check (private.is_crm_owner());
grant select, insert, update, delete on public.crm_members to authenticated;

create or replace function public.crm_is_manager()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.is_crm_owner(), false) or exists (
  select 1 from public.crm_members m where m.user_id = auth.uid() and m.active and m.role = 'manager'
) $$;
revoke all on function public.crm_is_manager() from public, anon;
grant execute on function public.crm_is_manager() to authenticated;

create or replace function public.crm_is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.is_crm_owner(), false) or exists (
  select 1 from public.crm_members m where m.user_id = auth.uid() and m.active
) $$;
revoke all on function public.crm_is_member() from public, anon;
grant execute on function public.crm_is_member() to authenticated;

create or replace function public.crm_user_role()
returns text language sql stable security definer set search_path = ''
as $$ select case when public.crm_is_manager() then 'manager' else coalesce((
  select m.role from public.crm_members m where m.user_id = auth.uid() and m.active limit 1
), 'member') end $$;
revoke all on function public.crm_user_role() from public, anon;
grant execute on function public.crm_user_role() to authenticated;

create table if not exists public.bloggers (
  id uuid primary key default gen_random_uuid(),
  instagram_url text not null unique,
  username text,
  display_name text,
  phone text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.local_businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  city text,
  contact_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.promo_observations (
  id uuid primary key default gen_random_uuid(),
  blogger_id uuid references public.bloggers(id) on delete set null,
  business_id uuid references public.local_businesses(id) on delete set null,
  permalink text not null unique,
  published_at timestamptz,
  evidence text,
  review_status text not null default 'needs_review' check (review_status in ('needs_review','confirmed','rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'queued' check (status in ('queued','running','complete','stopped','error')),
  found_count integer not null default 0,
  message text
);

create table if not exists public.show_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  category text not null check (category in ('brand_face','mobileographer')),
  city text not null,
  portfolio_url text,
  application_date timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','reviewed','casting','chosen','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.custom_tabs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '▤',
  fields jsonb not null default '[]'::jsonb,
  viewer_roles text[] not null default array['owner','manager'],
  editor_roles text[] not null default array['owner','manager'],
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.custom_records (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.custom_tabs(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['bloggers','local_businesses','promo_observations','research_runs','show_applications','custom_tabs','custom_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists crm_member_all on public.%I', t);
    execute format('create policy crm_member_all on public.%I for all to authenticated using (public.crm_is_member()) with check (public.crm_is_member())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Custom tab visibility and editing rules are evaluated from the saved role lists.
drop policy if exists crm_member_all on public.custom_tabs;
drop policy if exists custom_tabs_view_allowed on public.custom_tabs;
create policy custom_tabs_view_allowed on public.custom_tabs for select to authenticated
  using (public.crm_is_member() and (created_by = auth.uid() or viewer_roles @> array[public.crm_user_role()]));
drop policy if exists custom_tabs_insert_member on public.custom_tabs;
create policy custom_tabs_insert_member on public.custom_tabs for insert to authenticated
  with check (public.crm_is_member() and created_by = auth.uid());
drop policy if exists custom_tabs_update_allowed on public.custom_tabs;
create policy custom_tabs_update_allowed on public.custom_tabs for update to authenticated
  using (public.crm_is_member() and editor_roles @> array[public.crm_user_role()])
  with check (public.crm_is_member() and editor_roles @> array[public.crm_user_role()]);
drop policy if exists custom_tabs_delete_allowed on public.custom_tabs;
create policy custom_tabs_delete_allowed on public.custom_tabs for delete to authenticated
  using (public.crm_is_member() and editor_roles @> array[public.crm_user_role()]);

drop policy if exists crm_member_all on public.custom_records;
drop policy if exists custom_records_view_allowed on public.custom_records;
create policy custom_records_view_allowed on public.custom_records for select to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = tab_id and (t.created_by = auth.uid() or t.viewer_roles @> array[public.crm_user_role()])));
drop policy if exists custom_records_insert_allowed on public.custom_records;
create policy custom_records_insert_allowed on public.custom_records for insert to authenticated
  with check (public.crm_is_member() and created_by = auth.uid() and exists (select 1 from public.custom_tabs t where t.id = tab_id and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])));
drop policy if exists custom_records_update_allowed on public.custom_records;
create policy custom_records_update_allowed on public.custom_records for update to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = tab_id and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])))
  with check (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = tab_id and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])));
drop policy if exists custom_records_delete_allowed on public.custom_records;
create policy custom_records_delete_allowed on public.custom_records for delete to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = tab_id and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])));

-- Vacancy leads stay manager-only at the database layer as well as in the UI.
alter table public.meta_admin_leads enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='meta_admin_leads' loop
    execute format('drop policy %I on public.meta_admin_leads', p.policyname);
  end loop;
end $$;
create policy meta_admin_leads_owner_update on public.meta_admin_leads for update to authenticated
  using (public.crm_is_manager()) with check (public.crm_is_manager());
create policy meta_admin_leads_manager_select on public.meta_admin_leads for select to authenticated
  using (public.crm_is_manager());
grant select on public.meta_admin_leads to authenticated;
grant update (pipeline_status, crm_note) on public.meta_admin_leads to authenticated;

create index if not exists promo_observations_published_at_idx on public.promo_observations(published_at desc);
create index if not exists promo_observations_business_id_idx on public.promo_observations(business_id);
create index if not exists show_applications_status_date_idx on public.show_applications(status, application_date desc);
create index if not exists custom_records_tab_created_idx on public.custom_records(tab_id, created_at desc);
