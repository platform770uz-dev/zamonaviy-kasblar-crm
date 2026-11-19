-- ИИ-очередь звонков: главный экран вкладки лидов CRM («ИИ maslahat»).
-- Каждое составление очереди — партия (lead_call_batches) и до 20 лидов по порядку (lead_call_queue): почему звонить
-- сейчас и что сказать. Пишет только функция lead-queue (service role); CRM читает последнюю готовую партию с теми же
-- правами, что и лиды. baseline — подпись итога звонка и статус каждого лида на момент составления: изменились —
-- CRM показывает «✓ позвонили»; лида нет в baseline — заявка пришла позже и встаёт наверх очереди.

create table if not exists public.lead_call_batches (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.custom_tabs(id) on delete cascade,
  ready boolean not null default false,
  ai boolean not null default false,
  model text,
  auto boolean not null default false,
  created_by uuid,
  created_by_name text not null default '',
  baseline jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.lead_call_batches is
  'Партии ИИ-очереди звонков (функция lead-queue): кто и когда составил, ИИ или правила, baseline лидов. CRM показывает последнюю партию с ready = true.';
create index if not exists lead_call_batches_tab_created_idx on public.lead_call_batches (tab_id, created_at desc);

create table if not exists public.lead_call_queue (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.lead_call_batches(id) on delete cascade,
  record_id uuid not null references public.custom_records(id) on delete cascade,
  rank smallint not null check (rank between 1 and 100),
  reason text not null default '',
  say text not null default '',
  signals text[] not null default '{}',
  unique (batch_id, record_id)
);
comment on table public.lead_call_queue is
  'Лиды партии ИИ-очереди по порядку: почему звонить сейчас (reason) и что сказать (say). Пишет функция lead-queue.';
create index if not exists lead_call_queue_record_idx on public.lead_call_queue (record_id);

alter table public.lead_call_batches enable row level security;
alter table public.lead_call_queue enable row level security;
drop policy if exists lead_call_batches_select on public.lead_call_batches;
create policy lead_call_batches_select on public.lead_call_batches for select to authenticated using (
  public.crm_is_member() and exists (
    select 1 from public.custom_tabs t
    where t.id = lead_call_batches.tab_id
      and (t.created_by = auth.uid() or t.viewer_roles @> array[public.crm_user_role()])
  )
);
-- Лиды партии видит тот, кто видит саму партию (политика выше применяется к подзапросу).
drop policy if exists lead_call_queue_select on public.lead_call_queue;
create policy lead_call_queue_select on public.lead_call_queue for select to authenticated using (
  exists (select 1 from public.lead_call_batches b where b.id = lead_call_queue.batch_id)
);
revoke all on public.lead_call_batches, public.lead_call_queue from anon;
revoke insert, update, delete, truncate on public.lead_call_batches, public.lead_call_queue from authenticated;

-- Копия очереди уходит операторам в Telegram тем же путём, что лиды и итоги звонков (operator-notify, рабочее время).
alter table public.operator_notifications drop constraint if exists operator_notifications_kind_check;
alter table public.operator_notifications add constraint operator_notifications_kind_check
  check (kind in ('lead', 'call_result', 'callback', 'queue'));

-- Очередь составляется сама к началу смены: пн–сб 07:55 UTC (= 12:55 Ташкент). К 13:00 она готова в CRM,
-- а operator-notify с 13:00 доставляет копию операторам. В течение дня её можно пересчитать кнопкой «ИИ maslahat».
select cron.schedule('lead-queue-daily', '55 7 * * 1-6', $job$
  select net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/lead-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', (select qiymat from public.crm_maxfiy where kalit = 'tg_ichki')),
    body := '{"action":"build","auto":true}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
