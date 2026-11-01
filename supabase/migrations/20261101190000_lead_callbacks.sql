-- Напоминания «Qayta aloqa» по лидам: CRM ставит время, pg_cron раз в минуту будит teachnova-bot,
-- бот шлёт напоминание руководителю и админам в Telegram.
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.lead_callbacks (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.custom_records(id) on delete cascade,
  tab_id uuid not null references public.custom_tabs(id) on delete cascade,
  due_at timestamptz not null,
  lead_name text,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists lead_callbacks_due_idx on public.lead_callbacks (status, due_at);
create index if not exists lead_callbacks_record_idx on public.lead_callbacks (record_id);

alter table public.lead_callbacks enable row level security;
revoke all on public.lead_callbacks from anon;
grant select, insert, update on public.lead_callbacks to authenticated;

-- Права те же, что у записей вкладки: смотреть и ставить напоминание может тот, кто может менять вкладку.
create policy lead_callbacks_select on public.lead_callbacks for select to authenticated
  using (public.crm_is_member() and exists (
    select 1 from public.custom_tabs t where t.id = lead_callbacks.tab_id
      and (t.created_by = auth.uid() or t.viewer_roles @> array[public.crm_user_role()])));

create policy lead_callbacks_insert on public.lead_callbacks for insert to authenticated
  with check (public.crm_is_member() and created_by = auth.uid() and status = 'pending' and exists (
    select 1 from public.custom_tabs t where t.id = lead_callbacks.tab_id
      and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])));

create policy lead_callbacks_update on public.lead_callbacks for update to authenticated
  using (public.crm_is_member() and exists (
    select 1 from public.custom_tabs t where t.id = lead_callbacks.tab_id
      and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])))
  with check (public.crm_is_member() and status in ('pending', 'cancelled'));

-- Раз в минуту: если есть созревшие напоминания, зовём teachnova-bot (секрет берётся из crm_maxfiy, в тексте задания его нет).
select cron.unschedule('teachnova-callback-reminders')
  where exists (select 1 from cron.job where jobname = 'teachnova-callback-reminders');
select cron.schedule('teachnova-callback-reminders', '* * * * *', $job$
  select net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/teachnova-bot?remind=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', (select qiymat from public.crm_maxfiy where kalit = 'tg_ichki')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000)
  where exists (
    select 1 from public.lead_callbacks
    where due_at <= now() and (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '10 minutes')));
$job$);
