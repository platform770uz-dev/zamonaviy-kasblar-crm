-- Browser-only CRM sign-in links and role mapping for approved Telegram users.
-- The manager uses the existing PIN endpoint; approved admins use one-time links
-- issued only by the Telegram bot after an owner approves their request.

create table if not exists public.crm_browser_login_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  chat_id bigint not null references public.tg_chatlar(chat_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table public.crm_browser_login_tokens enable row level security;
revoke all on table public.crm_browser_login_tokens from public, anon, authenticated;
grant all on table public.crm_browser_login_tokens to service_role;
create index if not exists crm_browser_login_tokens_expiry_idx
  on public.crm_browser_login_tokens(expires_at);

create or replace function public.crm_is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.is_crm_owner(), false)
    or exists (
      select 1 from public.crm_web_login w
      where w.auth_user_id = auth.uid() and w.enabled
    )
    or exists (
      select 1 from public.tg_chatlar t
      where t.auth_user_id = auth.uid()
        and t.tasdiqlangan and not t.bloklangan and t.rol = 'owner'
    )
    or exists (
      select 1 from public.crm_members m
      where m.user_id = auth.uid() and m.active and m.role = 'manager'
    );
$$;
revoke all on function public.crm_is_manager() from public, anon;
grant execute on function public.crm_is_manager() to authenticated;

create or replace function public.crm_is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.crm_is_manager()
    or exists (
      select 1 from public.tg_chatlar t
      where t.auth_user_id = auth.uid()
        and t.tasdiqlangan and not t.bloklangan and t.rol in ('admin','owner')
    )
    or exists (
      select 1 from public.crm_members m
      where m.user_id = auth.uid() and m.active
    );
$$;
revoke all on function public.crm_is_member() from public, anon;
grant execute on function public.crm_is_member() to authenticated;

create or replace function public.crm_user_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when public.crm_is_manager() then 'manager'
    else coalesce((
      select case when t.rol = 'owner' then 'manager' else 'admin' end
      from public.tg_chatlar t
      where t.auth_user_id = auth.uid()
        and t.tasdiqlangan and not t.bloklangan
      limit 1
    ), (
      select m.role from public.crm_members m
      where m.user_id = auth.uid() and m.active limit 1
    ), 'member')
  end;
$$;
revoke all on function public.crm_user_role() from public, anon;
grant execute on function public.crm_user_role() to authenticated;

-- The user asked that approved admins can see all CRM sections except HR.
alter table public.custom_tabs
  alter column viewer_roles set default array['owner','manager','admin']::text[],
  alter column editor_roles set default array['owner','manager','admin']::text[];
update public.custom_tabs
set viewer_roles = array(select distinct unnest(viewer_roles || array['admin']::text[])),
    editor_roles = array(select distinct unnest(editor_roles || array['admin']::text[]));

