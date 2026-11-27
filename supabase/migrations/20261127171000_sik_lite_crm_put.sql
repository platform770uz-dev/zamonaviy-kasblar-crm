-- Super Intellekt Kids Lite: write a booking into the CRM tab «Super Intellekt Kids Lite» by its external id.
-- Existing records are merged (values || patch), so whatever operators add to a record stays.
create or replace function public.sik_crm_put(p_external_id text, p_patch jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_tab constant uuid := 'a7c4e2f1-5b3d-4c8e-9f21-6d0b8e3a4c57';
  v_owner uuid;
begin
  update public.custom_records
     set values = values || p_patch, updated_at = now()
   where tab_id = v_tab and external_id = p_external_id;
  if found then
    return;
  end if;
  select created_by into v_owner from public.custom_tabs where id = v_tab;
  insert into public.custom_records (tab_id, external_id, values, created_by)
  values (v_tab, p_external_id, p_patch, v_owner)
  on conflict (tab_id, external_id) do update
    set values = public.custom_records.values || excluded.values, updated_at = now();
end;
$$;

revoke all on function public.sik_crm_put(text, jsonb) from public, anon, authenticated;
grant execute on function public.sik_crm_put(text, jsonb) to service_role;
