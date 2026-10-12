-- CRM workflow fields for Meta recruitment leads.
-- Apply only after reviewing the CRM pull request and confirming the project host region.

alter table public.meta_admin_leads
  add column if not exists pipeline_status text not null default 'new',
  add column if not exists crm_note text not null default '',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meta_admin_leads'::regclass
      and conname = 'meta_admin_leads_pipeline_status_check'
  ) then
    alter table public.meta_admin_leads
      add constraint meta_admin_leads_pipeline_status_check
      check (pipeline_status in ('new','contacted','interview','hired','rejected'));
  end if;
end
$$;

create or replace function private.touch_meta_admin_lead_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_meta_admin_lead_updated_at() from public, anon, authenticated;
drop trigger if exists meta_admin_leads_touch_updated_at on public.meta_admin_leads;
create trigger meta_admin_leads_touch_updated_at
before update of pipeline_status, crm_note on public.meta_admin_leads
for each row execute function private.touch_meta_admin_lead_updated_at();

grant update (pipeline_status, crm_note) on public.meta_admin_leads to authenticated;
drop policy if exists meta_admin_leads_owner_update on public.meta_admin_leads;
create policy meta_admin_leads_owner_update
on public.meta_admin_leads
for update
to authenticated
using (private.is_crm_owner())
with check (private.is_crm_owner());
